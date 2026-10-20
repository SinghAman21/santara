import { constants } from 'node:fs';
import { lstat, open, realpath, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { Readable } from 'node:stream';
import sharp from 'sharp';

const imageLimit = 128 * 1024 * 1024;
const mediaLimit = 2 * 1024 * 1024 * 1024;
const pixelLimit = 40_000_000;
const pngLimit = 12 * 1024 * 1024;
const tokenLifetime = 10 * 60 * 1000;
const sampleLimit = 600 * 8000;
const images = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.heic', '.heif', '.tif', '.tiff', '.bmp']);
const media = {
  '.mp3': ['audio/mpeg', 'mp3'], '.wav': ['audio/wav', 'wav'],
  '.ogg': ['audio/ogg', 'ogg'], '.opus': ['audio/ogg', 'ogg'],
  '.flac': ['audio/flac', 'flac'], '.m4a': ['audio/mp4', 'mov'], '.aac': ['audio/aac', 'aac'],
  '.aiff': ['audio/aiff', 'aiff'], '.aif': ['audio/aiff', 'aiff'], '.wma': ['audio/x-ms-wma', 'asf'],
  '.mp4': ['video/mp4', 'mov'], '.m4v': ['video/mp4', 'mov'], '.mov': ['video/quicktime', 'mov'],
  '.webm': ['video/webm', 'matroska'], '.mkv': ['video/x-matroska', 'matroska'], '.avi': ['video/x-msvideo', 'avi'],
};
const pathKey = value => process.platform === 'win32' ? value.toLowerCase() : value;
const unchanged = (before, after) => after.isFile() && !after.isSymbolicLink()
  && before.dev === after.dev && before.ino === after.ino && before.size === after.size
  && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
const supported = 'Preview supports raster images, PDF, and local audio/video files. Use Open or Reveal for other formats.';

function inputPath(value, allowed) {
  if (typeof value !== 'string' || value.length > 32768 || /[\x00-\x1f]/.test(value) || !path.isAbsolute(value)) {
    throw new Error('Preview requires an inspected absolute local path');
  }
  if (/^(?:\\\\|\/\/)/.test(value) || (process.platform === 'win32' && value.slice(2).includes(':'))) throw new Error('Network paths and alternate data streams cannot be previewed');
  const filename = path.normalize(value);
  if (!allowed.has(filename)) throw new Error('Select and inspect this file before previewing it');
  return filename;
}

async function checkedOpen(filename, limit, expected) {
  const before = await lstat(filename);
  if (before.isSymbolicLink()) throw new Error('Symbolic links cannot be previewed');
  if (!before.isFile()) throw new Error('Preview requires a regular file');
  if (before.size > limit) throw new Error(`Preview file exceeds the ${limit / 1024 / 1024} MiB limit. Use Open or Reveal.`);
  if (pathKey(await realpath(filename)) !== pathKey(filename)) throw new Error('Paths through symbolic links cannot be previewed');
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const info = await handle.stat();
    if (!unchanged(before, info) || (expected && !unchanged(expected, info))
      || !unchanged(info, await lstat(filename)) || pathKey(await realpath(filename)) !== pathKey(filename)) {
      throw new Error('Preview file changed. Inspect the file again.');
    }
    return { handle, info };
  } catch (error) { await handle.close(); throw error; }
}

function signature(bytes, extension) {
  const ascii = (start, end) => bytes.toString('latin1', start, end);
  const prefix = value => bytes.subarray(0, value.length).equals(Buffer.from(value));
  const png = prefix([137, 80, 78, 71, 13, 10, 26, 10]);
  const jpeg = prefix([255, 216, 255]);
  const gif = ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
  const webp = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  const tiff = ['49492a00', '4d4d002a', '49492b00', '4d4d002b'].includes(bytes.subarray(0, 4).toString('hex'));
  const iso = ascii(4, 8) === 'ftyp';
  if (['.aiff', '.aif'].includes(extension)) {
    if (prefix('FORM') && ['AIFF', 'AIFC'].includes(ascii(8, 12))) return;
    throw new Error('File signature does not match AIFF/AIFC; HTML, SVG, and external-resource formats are disabled.');
  }
  if (extension === '.wma') {
    if (bytes.subarray(0, 16).equals(Buffer.from('3026b2758e66cf11a6d900aa0062ce6c', 'hex'))) return;
    throw new Error('File signature does not match WMA/ASF; HTML, SVG, and external-resource formats are disabled.');
  }
  const valid = extension === '.pdf' ? prefix('%PDF-')
    : ['.jpg', '.jpeg'].includes(extension) ? jpeg
      : extension === '.png' ? png : extension === '.gif' ? gif : extension === '.webp' ? webp
        : ['.tif', '.tiff'].includes(extension) ? tiff : extension === '.bmp' ? prefix('BM')
          : ['.avif', '.heic', '.heif'].includes(extension) ? iso && /avif|avis|heic|heix|hevc|hevx|mif1|msf1/.test(ascii(8, 64))
            : extension === '.wav' ? ['RIFF', 'RF64'].includes(ascii(0, 4)) && ascii(8, 12) === 'WAVE'
              : extension === '.avi' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'AVI '
                : extension === '.flac' ? prefix('fLaC') : ['.ogg', '.opus'].includes(extension) ? prefix('OggS')
                  : ['.webm', '.mkv'].includes(extension) ? prefix([26, 69, 223, 163])
                    : extension === '.mp3' ? prefix('ID3') || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0)
                      : extension === '.aac' ? bytes[0] === 255 && (bytes[1] & 0xf6) === 0xf0
                        : extension === '.mov' ? iso || ['moov', 'mdat', 'wide', 'free'].includes(ascii(4, 8))
                          : ['.mp4', '.m4v', '.m4a'].includes(extension) && iso;
  if (!valid) throw new Error(`File signature does not match ${extension}; HTML, SVG, and external-resource formats are disabled.`);
}

async function readBounded(handle, info, signal) {
  const bytes = Buffer.alloc(info.size);
  let position = 0;
  while (position < bytes.length) {
    signal.throwIfAborted();
    const { bytesRead } = await handle.read(bytes, position, Math.min(1024 * 1024, bytes.length - position), position);
    if (!bytesRead) throw new Error('Preview file changed while reading');
    position += bytesRead;
  }
  if (!unchanged(info, await handle.stat())) throw new Error('Preview file changed while reading');
  return bytes;
}

async function snapshot(handle, info, filename, signal) {
  const output = await open(filename, 'wx', 0o600);
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    while (position < info.size) {
      signal.throwIfAborted();
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, info.size - position), position);
      if (!bytesRead) throw new Error('Preview file changed while copying');
      let written = 0;
      while (written < bytesRead) written += (await output.write(buffer, written, bytesRead - written)).bytesWritten;
      position += bytesRead;
    }
    if (!unchanged(info, await handle.stat())) throw new Error('Preview file changed while copying');
  } finally { await output.close(); }
}

function ranges(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || !size) return null;
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if ((first !== undefined && !Number.isSafeInteger(first)) || (last !== undefined && !Number.isSafeInteger(last))) return null;
  if (first === undefined) return last > 0 ? [Math.max(0, size - last), size - 1] : null;
  if (first >= size || (last !== undefined && last < first)) return null;
  return [first, Math.min(last ?? size - 1, size - 1)];
}

function waveform(bytes) {
  if (bytes.length % 2 || bytes.length > sampleLimit * 2) throw new Error('FFmpeg returned invalid or excessive waveform samples');
  const samples = bytes.length / 2;
  if (!samples) throw new Error('FFmpeg decoded no audio samples. The audio codec may be unsupported.');
  const count = Math.min(200, samples);
  return Array.from({ length: count }, (_, index) => {
    let peak = 0;
    const end = Math.floor((index + 1) * samples / count);
    for (let sample = Math.floor(index * samples / count); sample < end; sample++) peak = Math.max(peak, Math.abs(bytes.readInt16LE(sample * 2)) / 32768);
    return peak;
  });
}

export function createPreviewService({ backends = {}, allowed } = {}) {
  if (!(allowed instanceof Set)) throw new TypeError('Preview allowed paths must be a Set of inspected absolute paths');
  const tokens = new Map();
  const pending = new Set();
  const children = new Set();
  const streams = new Set();
  const controller = new AbortController();
  let preparations = 0;
  let closing;
  const { signal } = controller;
  const active = () => { if (signal.aborted) throw new Error('Preview service is closed'); };
  const backend = name => backends[name]?.available && typeof backends[name].path === 'string' && backends[name].path;
  const prune = () => { for (const [token, entry] of tokens) if (entry.expires <= Date.now()) tokens.delete(token); };

  function run(name, args, { timeout = 15000, maxBuffer = 1024 * 1024, cwd } = {}) {
    active();
    const executable = backend(name);
    if (!executable) throw new Error(`Preview requires the local ${name} backend. Install or configure it, or use Open or Reveal.`);
    return new Promise((resolve, reject) => {
      const child = execFile(executable, args, { shell: false, windowsHide: true, encoding: 'buffer', signal, timeout, maxBuffer, killSignal: 'SIGKILL', cwd }, (error, stdout) => {
        if (error) reject(new Error(`${name} preview failed${error.killed ? ' (timeout or output limit)' : ''}. Check the local backend and file codec, or use Open or Reveal.`, { cause: error }));
        else resolve(stdout);
      });
      children.add(child);
      child.once('close', () => children.delete(child));
    });
  }

  async function thumbnail(bytes) {
    active();
    const pipeline = sharp(bytes, { limitInputPixels: pixelLimit, animated: false, pages: 1, failOn: 'warning' })
      .autoOrient().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).png().timeout({ seconds: 15 });
    const abort = () => pipeline.destroy();
    signal.addEventListener('abort', abort, { once: true });
    try {
      const metadata = await pipeline.metadata();
      active();
      const sourceWidth = metadata.width;
      const sourceHeight = metadata.pageHeight || metadata.height;
      if (!Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight) || sourceWidth < 1 || sourceHeight < 1 || sourceWidth * sourceHeight > pixelLimit) {
        throw new Error('Image exceeds 40 megapixel decode limit');
      }
      const swapped = [5, 6, 7, 8].includes(metadata.orientation);
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
      active();
      if (data.length > pngLimit) throw new Error('Preview thumbnail exceeds 12 MiB');
      return {
        url: `data:image/png;base64,${data.toString('base64')}`,
        width: swapped ? sourceHeight : sourceWidth, height: swapped ? sourceWidth : sourceHeight,
        previewWidth: info.width, previewHeight: info.height,
      };
    } catch (error) { throw new Error(`Image preview failed: ${error.message}. Use Open or Reveal.`, { cause: error }); }
    finally { signal.removeEventListener('abort', abort); pipeline.destroy(); }
  }

  async function prepareFile(value) {
    active();
    const filename = inputPath(value, allowed);
    const extension = path.extname(filename).toLowerCase();
    if (!images.has(extension) && extension !== '.pdf' && !media[extension]) throw new Error(supported);
    const { handle, info } = await checkedOpen(filename, media[extension] ? mediaLimit : imageLimit);
    let temporary;
    try {
      active();
      const header = Buffer.alloc(64);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      signature(header.subarray(0, bytesRead), extension);
      if (images.has(extension)) return await thumbnail(await readBounded(handle, info, signal));
      if (extension === '.pdf' && !backend('poppler')) throw new Error('PDF preview requires the local Poppler backend (pdftoppm). Install or configure it, or use Open or Reveal.');
      let details = {};
      if (extension === '.pdf' || backend('ffprobe') || backend('ffmpeg')) {
        temporary = await mkdtemp(path.join(os.tmpdir(), 'santara-preview-'));
        const input = path.join(temporary, `input${extension}`);
        await snapshot(handle, info, input, signal);
        if (extension === '.pdf') {
          const png = await run('poppler', ['-f', '1', '-l', '1', '-singlefile', '-scale-to', '1400', '-png', input], { cwd: temporary, maxBuffer: pngLimit });
          signature(png, '.png');
          return await thumbnail(png);
        }
        const demuxer = media[extension][1];
        const restrictions = ['-protocol_whitelist', 'file', '-format_whitelist', demuxer, '-f', demuxer];
        if (demuxer === 'mov') restrictions.push('-enable_drefs', '0', '-use_absolute_path', '0');
        let hasAudio = media[extension][0].startsWith('audio/');
        if (backend('ffprobe')) {
          const bytes = await run('ffprobe', ['-v', 'error', ...restrictions, '-probesize', '5000000', '-analyzeduration', '5000000', '-show_entries', 'format=duration:stream=codec_type,width,height,duration:stream_side_data=rotation', '-of', 'json', input], { cwd: temporary, timeout: 10000 });
          let metadata;
          try { metadata = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('ffprobe returned invalid metadata. Check the local backend.'); }
          const tracks = Array.isArray(metadata?.streams) ? metadata.streams : [];
          const video = tracks.find(track => track.codec_type === 'video');
          hasAudio = tracks.some(track => track.codec_type === 'audio');
          const duration = Number(metadata?.format?.duration ?? tracks.find(track => track.duration)?.duration);
          if (Number.isFinite(duration) && duration >= 0) details.duration = duration;
          if (Number.isSafeInteger(video?.width) && Number.isSafeInteger(video?.height) && video.width > 0 && video.height > 0 && video.width <= 65536 && video.height <= 65536) {
            const rotation = Number(video.side_data_list?.find(item => item.rotation !== undefined)?.rotation ?? 0);
            const swapped = Math.abs(rotation % 180) === 90;
            details.width = swapped ? video.height : video.width;
            details.height = swapped ? video.width : video.height;
          }
        }
        if (backend('ffmpeg') && hasAudio) {
          const pcm = await run('ffmpeg', ['-nostdin', '-v', 'error', '-threads', '1', ...restrictions, '-probesize', '5000000', '-analyzeduration', '5000000', '-i', input, '-map', '0:a:0', '-vn', '-sn', '-dn', '-t', '600', '-ac', '1', '-ar', '8000', '-c:a', 'pcm_s16le', '-threads', '1', '-f', 's16le', '-protocol_whitelist', 'pipe', 'pipe:1'], { cwd: temporary, timeout: 20000, maxBuffer: sampleLimit * 2 });
          details.waveform = waveform(pcm);
          details.waveformDuration = Math.min(details.duration ?? pcm.length / 2 / 8000, 600);
        }
      }
      active();
      inputPath(filename, allowed);
      if (!unchanged(info, await handle.stat())) throw new Error('Preview file changed. Inspect the file again.');
      prune();
      while (tokens.size >= 32) tokens.delete(tokens.keys().next().value);
      const token = randomUUID();
      tokens.set(token, { filename, info, type: media[extension][0], expires: Date.now() + tokenLifetime });
      return { url: `santara-media://preview/${token}`, ...details };
    } finally {
      await handle.close();
      if (temporary) await rm(temporary, { recursive: true, force: true });
    }
  }

  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" };
  const failure = (status, extra = {}) => new Response(null, { status, headers: { ...headers, ...extra } });

  async function respondFile(request) {
    if (signal.aborted) return failure(410);
    const match = /^santara-media:\/\/preview\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(request.url);
    if (!match) return failure(404);
    prune();
    const entry = tokens.get(match[1]);
    if (!entry) return failure(404);
    if (!['GET', 'HEAD'].includes(request.method)) return failure(405, { Allow: 'GET, HEAD' });
    let handle;
    try {
      active();
      request.signal?.throwIfAborted();
      inputPath(entry.filename, allowed);
      const opened = await checkedOpen(entry.filename, mediaLimit, entry.info);
      handle = opened.handle;
      active();
      request.signal?.throwIfAborted();
      const size = opened.info.size;
      const range = request.headers.get('range');
      const selected = range === null ? [0, size - 1] : ranges(range, size);
      if (!selected) return failure(416, { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' });
      const [start, end] = selected;
      const responseHeaders = { ...headers, 'Content-Type': entry.type, 'Accept-Ranges': 'bytes', 'Content-Length': String(Math.max(0, end - start + 1)) };
      if (range !== null) responseHeaders['Content-Range'] = `bytes ${start}-${end}/${size}`;
      if (request.method === 'HEAD' || !size) return new Response(null, { status: range === null ? 200 : 206, headers: responseHeaders });
      if (streams.size >= 32) return failure(429);
      const stream = handle.createReadStream({ start, end, autoClose: true, highWaterMark: 64 * 1024, signal: request.signal });
      streams.add(stream);
      stream.once('close', () => streams.delete(stream));
      const body = Readable.toWeb(stream, { strategy: { highWaterMark: 64 * 1024, size: chunk => chunk.byteLength } });
      handle = undefined;
      return new Response(body, { status: range === null ? 200 : 206, headers: responseHeaders });
    } catch {
      tokens.delete(match[1]);
      return failure(signal.aborted ? 410 : 403);
    } finally { if (handle) await handle.close(); }
  }

  function track(operation) {
    pending.add(operation);
    operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  }

  return {
    prepare(value) {
      if (preparations >= 4) return Promise.reject(new Error('Too many pending previews. Wait for a preview to finish.'));
      preparations++;
      return track(prepareFile(value).finally(() => { preparations--; }));
    },
    respond: request => signal.aborted ? Promise.resolve(failure(410))
      : pending.size >= 32 || streams.size >= 32 ? Promise.resolve(failure(429)) : track(respondFile(request)),
    close() {
      if (!closing) {
        const stopped = [...children].map(child => new Promise(resolve => child.once('close', resolve)));
        const drained = [...streams].map(stream => new Promise(resolve => stream.once('close', resolve)));
        controller.abort();
        tokens.clear();
        for (const stream of streams) stream.destroy();
        closing = Promise.allSettled([...pending, ...stopped, ...drained]).then(() => {});
      }
      return closing;
    },
  };
}
