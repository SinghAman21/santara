import { constants } from 'node:fs';
import { lstat, readdir, open, mkdir, mkdtemp, link, rm, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { categoryFor, detectBackends, getCapabilities, mediaFormats, mediaDemuxers, videoFormats, audioEncoderFor, documentReaders, documentWriters } from './registry.mjs';
import { convertSubtitles } from './subtitles.mjs';
import { createArchive, extractArchive } from './archives.mjs';
import { mediaOperationArgs, mediaMergeArgs } from './media.mjs';

export { detectBackends, getCapabilities } from './registry.mjs';

export async function validateSignature(filename, ext = path.extname(filename).slice(1).toLowerCase()) {
  if (!['png', 'jpg', 'jpeg', 'pdf', 'wav', 'zip'].includes(ext)) return;
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Input must be a regular file');
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    const valid = ext === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : ['jpg', 'jpeg'].includes(ext) ? bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : ext === 'pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
      : ext === 'wav' ? ['RIFF', 'RF64'].includes(bytes.subarray(0, 4).toString()) && bytes.subarray(8, 12).toString() === 'WAVE'
      : bytes.length >= 4 && bytes[0] === 80 && bytes[1] === 75 && [[3, 4], [5, 6], [7, 8]].some(pair => bytes[2] === pair[0] && bytes[3] === pair[1]);
    if (!valid) throw new Error(`File signature does not match .${ext}: ${path.basename(filename)}`);
  } finally { await handle.close(); }
}

export async function inspectFiles(paths, { recursive = false } = {}) {
  if (!Array.isArray(paths)) throw new Error('Expected an array of local paths');
  const files = [];
  const seen = new Set();
  const visit = async (filename, depth = 0) => {
    if (typeof filename !== 'string' || filename.includes('\0')) throw new Error('Invalid local path');
    if (depth > 64 || files.length >= 10000) throw new Error('File inspection limit exceeded');
    const absolute = path.resolve(filename);
    if (seen.has(absolute)) return;
    seen.add(absolute);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`Symbolic links are unsupported: ${absolute}`);
    if (!info.isFile() && !info.isDirectory()) throw new Error(`Not a regular file: ${absolute}`);
    if (info.isDirectory() && recursive) {
      for (const entry of (await readdir(absolute)).sort()) await visit(path.join(absolute, entry), depth + 1);
      return;
    }
    const ext = path.extname(absolute).slice(1).toLowerCase();
    if (info.isFile()) await validateSignature(absolute, ext);
    files.push({ path: absolute, name: path.basename(absolute), size: info.size, ext, category: info.isDirectory() ? 'directory' : categoryFor(ext), isDirectory: info.isDirectory(), id: createHash('sha256').update(absolute).digest('hex').slice(0, 24) });
  };
  for (const filename of paths) await visit(typeof filename === 'string' ? filename : filename.path);
  return files;
}

const number = (value, fallback, min, max, integer = false) => {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) throw new Error(`Expected ${integer ? 'integer' : 'number'} between ${min} and ${max}`);
  return result;
};
const clone = value => structuredClone(value);
export function normalizeImageOptions(values, names) {
  const options = Object.fromEntries(Object.entries(values).filter(([key]) => names.includes(key)));
  for (const key of ['quality', 'compressionLevel', 'width', 'height', 'x', 'y', 'angle', 'cropX', 'cropY', 'cropWidth', 'cropHeight', 'brightness', 'saturation', 'contrast', 'padding']) {
    if (typeof options[key] !== 'string') continue;
    if (!options[key].trim()) delete options[key];
    else options[key] = Number(options[key]);
  }
  for (const key of ['flipHorizontal', 'flipVertical', 'stripMetadata', 'autoOrient', 'progressive']) if (typeof options[key] === 'string') {
    if (!['true', 'false'].includes(options[key])) throw new Error(`Invalid ${key}`);
    options[key] = options[key] === 'true';
  }
  return options;
}
export function parseSegments(value) {
  if (typeof value !== 'string' || value.length > 8000) throw new Error('Enter time ranges such as 0-5,10-15 (seconds)');
  const ranges = value.split(',');
  if (!ranges.length || ranges.length > 100) throw new Error('Split accepts 1–100 time ranges');
  return ranges.map(range => {
    const match = range.trim().match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
    if (!match) throw new Error('Invalid split range. Use start-end seconds, separated by commas.');
    const start = number(match[1], 0, 0, 604800), end = number(match[2], 0, 0, 604800);
    if (end <= start) throw new Error('Each split range must end after it starts');
    return { start, duration: end - start };
  });
}
const abortError = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });
const ensureActive = signal => { if (signal.aborted) throw abortError(); };
const cropRectangle = (options, dimensions, video = false) => {
  const rectangle = { width: number(options.width, 256, 1, 16384, true), height: number(options.height, 256, 1, 16384, true), x: number(options.x, 0, 0, 16384, true), y: number(options.y, 0, 0, 16384, true) };
  if (!dimensions || rectangle.x + rectangle.width > dimensions.width || rectangle.y + rectangle.height > dimensions.height) throw new Error('Crop rectangle exceeds input dimensions');
  if (video && (rectangle.width % 2 || rectangle.height % 2)) throw new Error('Video crop width and height must be even');
  return rectangle;
};

async function safeCopy(source, destination, signal) {
  ensureActive(signal);
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new Error('Input must be a regular file, not a symlink');
  const handle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino !== sourceInfo.ino || opened.dev !== sourceInfo.dev) throw new Error('Input changed while opening');
    const output = await open(destination, 'wx', 0o600);
    try {
      const buffer = Buffer.alloc(256 * 1024);
      let position = 0;
      while (true) {
        ensureActive(signal);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
        if (!bytesRead) break;
        let written = 0;
        while (written < bytesRead) written += (await output.write(buffer, written, bytesRead - written)).bytesWritten;
        position += bytesRead;
      }
    } finally { await output.close(); }
  } finally { await handle.close(); }
}

function run(command, args, { signal, timeout, cwd, onOutput }) {
  return new Promise((resolve, reject) => {
    ensureActive(signal);
    let stderr = '';
    let stdout = '';
    let timedOut = false;
    const child = spawn(command, args, { shell: false, windowsHide: true, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const terminate = () => child.kill('SIGKILL');
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeout);
    signal.addEventListener('abort', terminate, { once: true });
    child.stdout.on('data', chunk => {
      stdout = (stdout + chunk.toString()).slice(-8192);
      onOutput?.(chunk.toString());
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', terminate); };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => {
      cleanup();
      if (signal.aborted) reject(abortError());
      else if (timedOut) reject(new Error('Conversion timed out'));
      else if (code !== 0) reject(new Error(`${path.basename(command)} exited ${code}: ${stderr.trim()}`));
      else resolve(stdout);
    });
  });
}

function ffmpegArgs(job, input, output, dimensions) {
  const options = job.options;
  const ext = path.extname(job.input).slice(1).toLowerCase();
  if (!mediaDemuxers[ext]) throw new Error('Unsupported media input');
  const args = ['-hide_banner', '-nostdin', '-v', 'error', '-n', '-protocol_whitelist', 'file', '-f', mediaDemuxers[ext], '-i', input];
  if (job.operation === 'trim') {
    args.push('-ss', String(number(options.start, 0, 0, 604800)), '-t', String(number(options.duration, 10, 0.01, 604800)));
  }
  const filters = [];
  if (job.operation === 'crop') {
    const rectangle = cropRectangle(options, dimensions, true);
    filters.push(`crop=${rectangle.width}:${rectangle.height}:${rectangle.x}:${rectangle.y}:exact=1`);
  }
  if (job.operation === 'resize') filters.push(`scale=${number(options.width, 1280, 2, 16384, true)}:${options.height === undefined ? -2 : number(options.height, 720, 2, 16384, true)}`);
  if (job.operation === 'rotate') {
    const angle = number(options.angle, 90, 90, 270, true);
    if (![90, 180, 270].includes(angle)) throw new Error('Rotation must be 90, 180 or 270');
    filters.push(angle === 180 ? 'transpose=1,transpose=1' : `transpose=${angle === 90 ? 1 : 2}`);
  }
  if (job.operation === 'flip') {
    if (!['horizontal', 'vertical'].includes(options.direction || 'horizontal')) throw new Error('Invalid flip direction');
    filters.push(options.direction === 'vertical' ? 'vflip' : 'hflip');
  }
  if (job.operation === 'gif') filters.push(`fps=${number(options.fps, 12, 1, 60, true)}`, `scale=${number(options.width, 480, 2, 2048, true)}:-1`);
  if (filters.length) args.push('-vf', filters.join(','));
  const [encoder, muxer] = mediaFormats[job.format];
  const video = [...videoFormats, 'gif'].includes(job.format);
  if (video) {
    args.push('-map', '0:v:0', '-c:v', encoder);
    if (job.format === 'gif') args.push('-an');
    else args.push('-map', '0:a:0?', '-c:a', audioEncoderFor(job.format));
    if (encoder === 'libx264') args.push('-pix_fmt', 'yuv420p', '-crf', String(Math.round(51 - number(options.quality, job.operation === 'compress' ? 55 : 75, 1, 100) * 0.5)));
    if (encoder === 'libvpx-vp9') args.push('-b:v', '0', '-crf', String(Math.round(63 - number(options.quality, 70, 1, 100) * 0.6)));
    if (['mpeg4', 'wmv2'].includes(encoder)) args.push('-q:v', String(Math.max(2, Math.round(32 - number(options.quality, 75, 1, 100) * 0.3))));
  } else args.push('-map', '0:a:0', '-vn', '-c:a', encoder);
  if (job.operation === 'compress' && ['mp3', 'ogg', 'opus', 'm4a', 'wma'].includes(job.format)) args.push('-b:a', `${number(options.bitrate, 128, 16, 512, true)}k`);
  if (options.sampleRate !== undefined) args.push('-ar', String(number(options.sampleRate, 44100, 8000, 192000, true)));
  if (options.channels !== undefined) args.push('-ac', String(number(options.channels, 2, 1, 2, true)));
  if (job.operation === 'strip-metadata' || options.stripMetadata) args.push('-map_metadata', '-1', '-map_metadata:s', '-1', '-map_chapters', '-1');
  else args.push('-map_metadata', '0', '-map_chapters', '0');
  args.push('-progress', 'pipe:1', '-f', muxer, output);
  return args;
}

function imageArgs(job, input, output, dimensions) {
  const options = job.options;
  const coder = ext => ({ jpg: 'jpeg', tif: 'tiff' }[ext] || ext);
  const args = ['-limit', 'memory', '256MiB', '-limit', 'map', '512MiB', '-limit', 'disk', '1GiB', '-limit', 'time', '120', `${coder(path.extname(job.input).slice(1).toLowerCase())}:${input}[0]`];
  if (options.autoOrient !== false) args.push('-auto-orient');
  if (job.operation === 'crop') {
    const rectangle = cropRectangle(options, dimensions);
    args.push('-crop', `${rectangle.width}x${rectangle.height}+${rectangle.x}+${rectangle.y}`, '+repage');
  }
  if (job.operation === 'resize') args.push('-resize', `${number(options.width, 1280, 1, 16384, true)}x${number(options.height, 1280, 1, 16384, true)}>`);
  if (job.operation === 'rotate') args.push('-rotate', String(number(options.angle, 90, -360, 360)));
  if (job.operation === 'flip') {
    if (!['horizontal', 'vertical'].includes(options.direction || 'horizontal')) throw new Error('Invalid flip direction');
    args.push(options.direction === 'vertical' ? '-flip' : '-flop');
  }
  if (job.operation === 'strip-metadata' || options.stripMetadata) args.push('-strip', '-orient', 'Undefined');
  if (['convert', 'compress'].includes(job.operation)) args.push('-quality', String(number(options.quality, 80, 1, 100, true)));
  if (['jpg', 'jpeg'].includes(job.format)) args.push('-background', 'white', '-alpha', 'remove', '-alpha', 'off');
  args.push(`${coder(job.format)}:${output}`);
  return args;
}

export function createEngine({ onUpdate = () => {}, settings = {}, backends } = {}) {
  let config = { concurrency: 2, collision: 'autorenaming', timeout: 30 * 60 * 1000, stripMetadata: false, ...settings };
  let detected = backends;
  let ready = backends ? Promise.resolve(backends) : detectBackends(settings.backendPaths || {}).then(value => { detected = value; return value; });
  const jobs = [];
  const controllers = new Map();
  let active = 0;
  let scheduled = false;
  const emit = job => { try { onUpdate(clone(job), clone(jobs)); } catch {} };
  const list = () => clone(jobs);
  const capability = job => {
    if (job.operation === 'create-archive') {
      const archive = getCapabilities(detected).find(item => item.operation === 'create-archive' && item.outputs.includes(job.format) && item.available);
      if (!archive) throw new Error('Unsupported archive format');
      return archive;
    }
    const category = categoryFor(path.extname(job.input).slice(1).toLowerCase());
    const cap = getCapabilities(detected).find(item => item.category === category && item.operation === job.operation && item.inputs.includes(path.extname(job.input).slice(1).toLowerCase()) && item.outputs.includes(job.format) && item.available);
    if (!cap) throw new Error(`Unsupported or unavailable operation: ${category}/${job.operation}/${job.format}`);
    return cap;
  };
  const execute = async (job, signal) => {
    await ready;
    ensureActive(signal);
    const cap = capability(job);
    if (cap.backend === 'pandoc' && (await lstat(job.input)).size > 16 * 1024 * 1024) throw new Error('Document exceeds 16 MiB limit');
    const outputDirectory = path.resolve(job.options.outputDirectory || job.options.outputDir || config.outputDirectory || config.outputDir || path.dirname(job.input));
    await mkdir(outputDirectory, { recursive: true });
    const directoryInfo = await lstat(outputDirectory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error('Output directory must not be a symlink');
    if (job.operation === 'create-archive') for (const source of job.options.inputs || [job.input]) {
      if ((await lstat(source)).isDirectory()) {
        const relative = path.relative(source, outputDirectory);
        if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Archive output directory must be outside selected input folders');
      }
    }
    const workspace = await mkdtemp(path.join(outputDirectory, '.santara-'));
    try {
      const input = path.join(workspace, `input.${path.extname(job.input).slice(1).toLowerCase()}`);
      if (job.operation !== 'create-archive') {
        await safeCopy(job.input, input, signal);
        if (cap.backend === 'pandoc' && (await stat(input)).size > 16 * 1024 * 1024) throw new Error('Document exceeds 16 MiB limit');
        await validateSignature(input);
      }
      job.progress = 5; emit(job);
      ensureActive(signal);
      job.status = 'processing'; emit(job);
      ensureActive(signal);
      const output = path.join(workspace, `output.${job.format}`);
      const progress = value => { job.progress = Math.max(job.progress, value); emit(job); };
      const runOptions = { signal, cwd: workspace, timeout: number(config.timeout, 1800000, 100, 86400000, true) };
      if (job.operation === 'extract') {
        const basename = path.basename(job.input, path.extname(job.input));
        const requested = job.options.filename || `${basename}-extracted`;
        if (typeof requested !== 'string' || requested === '.' || requested === '..' || requested !== path.basename(requested) || /[\\/:\x00-\x1f]/.test(requested) || requested.length > 220) throw new Error('Unsafe extraction directory name');
        const collision = job.options.collision || config.collision;
        if (!['skip', 'autorenaming', 'rename', 'ask'].includes(collision)) throw new Error('Invalid collision policy');
        for (let attempt = 0; attempt < 10000; attempt++) {
          ensureActive(signal);
          const destination = path.join(outputDirectory, attempt ? `${requested} (${attempt})` : requested);
          try {
            await extractArchive({ input, outputDirectory: destination, format: path.extname(job.input).slice(1).toLowerCase(), signal });
            job.output = destination;
            return;
          } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            if (collision === 'skip') return { skipped: true, error: 'Extraction directory already exists' };
            if (collision === 'ask') throw new Error(`Output exists; choose a new extraction directory: ${destination}`);
          }
        }
        throw new Error('Output naming limit exceeded');
      } else if (job.operation === 'create-archive') {
        await createArchive({ inputs: job.options.inputs || [job.input], output, format: job.format, signal });
      } else if (cap.backend === 'javascript') {
        if ((await stat(input)).size > 16 * 1024 * 1024) throw new Error('Subtitle exceeds 16 MiB limit');
        const text = await readFile(input, 'utf8');
        ensureActive(signal);
        await writeFile(output, convertSubtitles(text, path.extname(job.input).slice(1).toLowerCase(), job.format), { flag: 'wx', mode: 0o600 });
      } else if (cap.backend === 'ffmpeg') {
        let duration = 0;
        let dimensions;
        let mergeMetadata;
        let manifest;
        if (job.operation === 'merge') {
          if (!detected.ffprobe?.available) throw new Error('Merge requires FFprobe to validate every clip');
          const paths = [input];
          for (const [index, source] of (job.options.inputs || []).entries()) {
            const extra = path.join(workspace, `merge-${index}.${path.extname(source).slice(1).toLowerCase()}`);
            await safeCopy(source, extra, signal); await validateSignature(extra); paths.push(extra);
          }
          if (paths.length < 2) throw new Error('Merge requires at least two compatible files');
          mergeMetadata = [];
          for (const filename of paths) {
            const result = await run(detected.ffprobe.path, ['-v', 'error', '-protocol_whitelist', 'file', '-f', mediaDemuxers[path.extname(filename).slice(1).toLowerCase()], '-show_streams', '-show_format', '-show_data_hash', 'sha256', '-of', 'json', filename], { ...runOptions, timeout: Math.min(runOptions.timeout, 10000) });
            mergeMetadata.push(JSON.parse(result));
          }
          manifest = path.join(workspace, 'merge.txt');
          await writeFile(manifest, paths.map(filename => `file '${path.basename(filename)}'`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
          duration = mergeMetadata.reduce((total, metadata) => total + (Number(metadata.format?.duration) || 0), 0);
        }
        if (detected.ffprobe?.available && job.operation !== 'merge') {
          try {
            const json = await run(detected.ffprobe.path, ['-v', 'error', '-protocol_whitelist', 'file', '-f', mediaDemuxers[path.extname(job.input).slice(1).toLowerCase()], '-show_entries', 'format=duration:stream=codec_type,width,height:stream_side_data=rotation', '-of', 'json', input], { ...runOptions, timeout: Math.min(runOptions.timeout, 10000) });
            const metadata = JSON.parse(json);
            duration = Number(metadata.format?.duration) || 0;
            const video = metadata.streams?.find(stream => stream.codec_type === 'video');
            if (video) {
              const rotation = video.side_data_list?.find(item => item.rotation !== undefined)?.rotation || 0;
              dimensions = Math.abs(rotation) % 180 === 90 ? { width: video.height, height: video.width } : { width: video.width, height: video.height };
            }
          } catch (error) { ensureActive(signal); if (job.operation === 'crop') throw new Error(`Cannot inspect crop dimensions: ${error.message}`); }
        }
        if (['trim', 'split'].includes(job.operation)) duration = Math.min(Math.max(0, duration - Number(job.options.start || 0)), Number(job.options.duration || 10));
        if (job.operation === 'speed') duration /= Number(job.options.factor || 1);
        let pending = '';
        const args = job.operation === 'merge' ? mediaMergeArgs(job, manifest, output, mergeMetadata) : mediaOperationArgs(job, input, output, dimensions) || ffmpegArgs(job, input, output, dimensions);
        await run(detected.ffmpeg.path, args, { ...runOptions, onOutput: chunk => {
          pending += chunk;
          const lines = pending.split('\n');
          pending = lines.pop().slice(-8192);
          for (const line of lines) {
            const match = line.match(/^out_time_us=(\d+)/);
            if (match && duration > 0) progress(Math.min(94, 5 + Number(match[1]) / 1000000 / duration * 89));
          }
        } });
      }
      else if (cap.backend === 'sharp') {
        const images = await import('./images.mjs');
        ensureActive(signal);
        const imageOptions = normalizeImageOptions(job.options, images.imageOptionNames);
        await images.convertImage({ input, output, operation: job.operation, format: job.format, options: imageOptions, signal });
      }
      else if (cap.backend === 'imagemagick') {
        let dimensions;
        if (job.operation === 'crop') {
          const identify = imageArgs({ ...job, operation: 'inspect', format: 'png' }, input, output);
          identify.splice(-1, 1, '-format', '%w %h', 'info:');
          const result = await run(detected.imagemagick.path, identify, runOptions);
          const match = result.trim().match(/^(\d+) (\d+)$/);
          if (!match) throw new Error('Cannot inspect image dimensions');
          dimensions = { width: Number(match[1]), height: Number(match[2]) };
        }
        await run(detected.imagemagick.path, imageArgs(job, input, output, dimensions), runOptions);
      }
      else if (cap.backend === 'poppler') {
        const page = number(job.options.page, 1, 1, 100000, true);
        const prefix = path.join(workspace, 'output');
        await run(detected.poppler.path, ['-f', String(page), '-l', String(page), '-singlefile', '-r', String(number(job.options.dpi, 300, 36, 600, true)), job.format === 'png' ? '-png' : '-jpeg', input, prefix], runOptions);
      } else if (cap.backend === 'pandoc') {
        const reader = documentReaders[path.extname(job.input).slice(1).toLowerCase()];
        const writer = documentWriters[job.format];
        if (!detected.pandoc.sandbox || !reader || !writer) throw new Error('Sandboxed document format unavailable');
        await run(detected.pandoc.path, ['--sandbox', `--from=${reader}`, `--to=${writer}`, '--output', output, '--', input], runOptions);
      } else if (cap.backend === 'qpdf') {
        let args;
        const pages = String(job.options.pages || '1-z');
        if (!/^\d+(?:-\d+|-z)?(?:,\d+(?:-\d+|-z)?)*$/.test(pages)) throw new Error('Invalid PDF page range');
        if (job.operation === 'compress') args = [input, '--object-streams=generate', '--compress-streams=y', output];
        if (job.operation === 'pdf-extract') args = [input, '--pages', '.', pages, '--', output];
        if (job.operation === 'pdf-rotate') {
          const angle = number(job.options.angle, 90, 90, 270, true);
          if (![90, 180, 270].includes(angle)) throw new Error('Rotation must be 90, 180 or 270');
          args = [input, `--rotate=+${angle}:${pages}`, output];
        }
        if (job.operation === 'pdf-merge') {
          args = ['--empty', '--pages', input, '1-z'];
          for (const [index, filename] of (job.options.inputs || []).entries()) {
            const extra = path.join(workspace, `merge-${index}.pdf`);
            await safeCopy(filename, extra, signal);
            await validateSignature(extra);
            args.push(extra, '1-z');
          }
          args.push('--', output);
        }
        await run(detected.qpdf.path, args, runOptions);
      }
      ensureActive(signal);
      progress(95);
      const outputInfo = await lstat(output);
      if (!outputInfo.isFile() || outputInfo.isSymbolicLink() || outputInfo.size === 0) throw new Error('Backend produced no regular output');
      await validateSignature(output);
      const basename = path.basename(job.input, path.extname(job.input));
      const suffix = { convert: 'converted', compress: 'compressed' }[job.operation] || job.operation;
      let generated = `${basename}-${suffix}.${job.format}`;
      if (job.operation === 'convert' && config.namingPattern) {
        if (typeof config.namingPattern !== 'string') throw new Error('Naming pattern must be text');
        generated = config.namingPattern.replaceAll('{name}', basename).replaceAll('{ext}', job.format).replaceAll('{operation}', suffix);
        if (!generated.endsWith(`.${job.format}`)) generated += `.${job.format}`;
      }
      const requested = job.options.filename || generated;
      if (typeof requested !== 'string' || requested !== path.basename(requested) || /[\\/:\x00-\x1f]/.test(requested) || !requested.endsWith(`.${job.format}`) || requested.length > 240) throw new Error('Unsafe output filename');
      const collision = job.options.collision || config.collision;
      if (!['skip', 'autorenaming', 'rename', 'ask'].includes(collision)) throw new Error('Invalid collision policy');
      for (let attempt = 0; attempt < 10000; attempt++) {
        ensureActive(signal);
        const filename = attempt ? `${requested.slice(0, -(job.format.length + 1))} (${attempt}).${job.format}` : requested;
        const destination = path.join(outputDirectory, filename);
        try {
          await link(output, destination);
          job.output = destination;
          return;
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          if (collision === 'skip') return { skipped: true };
          if (collision === 'ask') throw Object.assign(new Error(`Output exists; choose a new name: ${destination}`), { code: 'COLLISION' });
        }
      }
      throw new Error('Output naming limit exceeded');
    } finally { await rm(workspace, { recursive: true, force: true }); }
  };
  const pump = () => {
    scheduled = false;
    const concurrency = Math.floor(number(config.concurrency, 2, 1, 8, true));
    while (active < concurrency) {
      const job = jobs.find(item => item.status === 'queued');
      if (!job) break;
      active++;
      const controller = new AbortController();
      controllers.set(job.id, controller);
      job.status = 'preparing';
      job.progress = 1;
      emit(job);
      execute(job, controller.signal).then(result => {
        job.status = result?.skipped ? 'skipped' : 'completed';
        if (result?.error) job.error = result.error;
        job.progress = 100;
      }).catch(error => {
        job.status = error.name === 'AbortError' ? 'cancelled' : 'failed';
        job.error = error.message;
      }).finally(() => {
        active--;
        controllers.delete(job.id);
        emit(job);
        schedule();
      });
    }
  };
  const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(pump); } };
  const validateSettings = value => {
    number(value.concurrency, 2, 1, 8, true);
    number(value.timeout, 1800000, 100, 86400000, true);
    if (!['skip', 'autorenaming', 'rename', 'ask'].includes(value.collision)) throw new Error('Invalid collision policy');
    if (typeof value.stripMetadata !== 'boolean') throw new Error('stripMetadata must be a boolean');
  };
  validateSettings(config);
  return {
    async enqueue({ files, operation = 'convert', format, options = {} }) {
      await ready;
      if (!Array.isArray(files) || !files.length || files.length > 10000) throw new Error('Choose between 1 and 10000 files');
      if (typeof operation !== 'string' || typeof format !== 'string' || !/^[a-z0-9]+$/.test(format)) throw new Error('Invalid operation or format');
      const inspected = [];
      for (const item of files) {
        const filename = typeof item === 'string' ? item : item?.path;
        if (typeof filename !== 'string' || filename.includes('\0')) throw new Error('Invalid local path');
        try { inspected.push(...await inspectFiles([filename])); }
        catch (error) { inspected.push({ path: path.resolve(filename), name: path.basename(filename), inspectionError: error.message }); }
      }
      const pdfs = inspected.filter(file => !file.inspectionError && !file.isDirectory && file.ext === 'pdf');
      const segments = operation === 'split' ? parseSegments(options.segments) : null;
      const mediaCategory = categoryFor(inspected.find(file => !file.inspectionError && ['audio', 'video'].includes(file.category))?.ext || '');
      const mergeFiles = operation === 'merge' ? inspected.filter(file => !file.inspectionError && !file.isDirectory && file.category === mediaCategory) : [];
      if (mergeFiles.length > 100) throw new Error('Merge accepts at most 100 files');
      const archiveInputs = inspected.filter(file => !file.inspectionError).filter((file, index, all) => !all.some((parent, parentIndex) => {
        if (parentIndex === index) return false;
        if (parent.path === file.path) return parentIndex < index;
        const relative = path.relative(parent.path, file.path);
        return parent.isDirectory && relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      }));
      const selected = operation === 'create-archive' && archiveInputs.length ? [archiveInputs[0], ...inspected.filter(file => file.inspectionError)] : operation === 'pdf-merge' && pdfs.length >= 2 ? [pdfs[0], ...inspected.filter(file => !pdfs.includes(file))] : operation === 'merge' && mergeFiles.length >= 2 ? [mergeFiles[0], ...inspected.filter(file => !mergeFiles.includes(file))] : inspected;
      let additions = selected.map(file => {
        const job = { id: randomUUID(), input: file.path, name: file.name, operation, format, status: 'queued', progress: 0, output: null, error: null, createdAt: new Date().toISOString(), options: { stripMetadata: config.stripMetadata, autoOrient: config.autoOrient !== false, ...clone(options), ...(operation === 'merge' ? { inputs: mergeFiles.slice(1).map(item => item.path) } : {}), ...(operation === 'pdf-merge' ? { inputs: pdfs.slice(1).map(item => item.path) } : {}), ...(operation === 'create-archive' ? { inputs: archiveInputs.map(item => item.path) } : {}) } };
        try {
          if (file.inspectionError) throw new Error(file.inspectionError);
          if (file.isDirectory && operation !== 'create-archive') throw new Error('Directory selection must be expanded by the main process');
          if (operation === 'create-archive' && format === 'gz' && (archiveInputs.length !== 1 || archiveInputs[0].isDirectory)) throw new Error('GZIP requires exactly one regular file');
          if (operation === 'pdf-merge' && (pdfs.length < 2 || file !== pdfs[0])) throw new Error('Merge requires at least two compatible PDFs');
          if (operation === 'merge' && (mergeFiles.length < 2 || file !== mergeFiles[0])) throw new Error('Merge requires at least two files of the same media category');
          capability(job);
        } catch (error) { job.status = 'skipped'; job.error = error.message; }
        return job;
      });
      if (segments) {
        if (additions.length * segments.length > 10000) throw new Error('Split would exceed the 10000-job limit');
        additions = additions.flatMap(job => job.status === 'skipped' ? [job] : segments.map((segment, index) => ({ ...job, id: randomUUID(), options: { ...job.options, ...segment, filename: `${path.basename(job.input, path.extname(job.input))}-${String(index + 1).padStart(3, '0')}.${format}` } })));
      }
      jobs.push(...additions);
      additions.forEach(emit);
      schedule();
      return clone(additions);
    },
    cancel(id) {
      const job = jobs.find(item => item.id === id);
      if (!job || !['queued', 'preparing', 'processing'].includes(job.status)) return false;
      if (controllers.has(id)) controllers.get(id).abort();
      else { job.status = 'cancelled'; job.error = 'Cancelled'; emit(job); }
      return true;
    },
    retry(id, options = {}) {
      const job = jobs.find(item => item.id === id);
      if (!job || controllers.has(id) || !['failed', 'cancelled', 'skipped'].includes(job.status)) return null;
      if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['collision', 'filename'].includes(key))) throw new Error('Retry accepts only collision and filename overrides');
      if (options.collision !== undefined && !['rename', 'ask', 'skip'].includes(options.collision)) throw new Error('Invalid retry collision policy');
      if (options.filename !== undefined && typeof options.filename !== 'string') throw new Error('Retry filename must be text');
      job.options = { ...job.options, ...clone(options) };
      job.status = 'queued'; job.progress = 0; job.error = null; job.output = null;
      emit(job); schedule(); return clone(job);
    },
    list,
    updateSettings(updates = {}) {
      const next = { ...config, ...clone(updates) };
      validateSettings(next);
      config = next;
      if (updates.backendPaths) ready = detectBackends(updates.backendPaths).then(value => { detected = value; return value; });
      schedule();
      return clone(config);
    },
    restore(saved) {
      if (!Array.isArray(saved)) throw new Error('Expected saved jobs array');
      const restored = [];
      for (const original of saved) {
        if (!original || typeof original.input !== 'string' || !path.isAbsolute(original.input) || typeof original.operation !== 'string' || !/^[a-z0-9]+$/.test(original.format || '')) continue;
        const job = { id: typeof original.id === 'string' ? original.id : randomUUID(), input: original.input, name: path.basename(original.input), operation: original.operation, format: original.format, status: ['completed', 'failed', 'cancelled', 'skipped'].includes(original.status) ? original.status : 'failed', progress: original.status === 'completed' ? 100 : 0, output: typeof original.output === 'string' ? original.output : null, error: ['running', 'queued', 'preparing', 'processing'].includes(original.status) ? 'Interrupted; retry to resume' : original.error || null, createdAt: original.createdAt || new Date().toISOString(), options: clone(original.options || {}) };
        if (jobs.some(item => item.id === job.id)) continue;
        jobs.push(job); restored.push(job); emit(job);
      }
      return clone(restored);
    },
  };
}
