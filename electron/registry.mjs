import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

export const documentReaders = { txt: 'markdown+hard_line_breaks-raw_html-raw_tex', md: 'markdown-raw_html-raw_tex', html: 'html-raw_html', docx: 'docx', epub: 'epub', rtf: 'rtf' };
export const documentWriters = { txt: 'plain', md: 'commonmark', html: 'html5', docx: 'docx', epub: 'epub' };

async function probePandoc(command) {
  const [help, readers, writers] = await Promise.all([probe(command, ['--help']), probe(command, ['--list-input-formats']), probe(command, ['--list-output-formats'])]);
  const support = { sandbox: help.ok && help.output.includes('--sandbox'), readers: [], writers: [] };
  if (!support.sandbox || !readers.ok || !writers.ok) return support;
  const directory = await mkdtemp(join(tmpdir(), 'santara-pandoc-probe-'));
  try {
    const input = join(directory, 'input.txt');
    await writeFile(input, 'Santara sandbox probe\n', { mode: 0o600 });
    for (const [ext, writer] of Object.entries(documentWriters)) {
      if (!writers.output.split(/\s+/).includes(writer)) continue;
      const result = await probe(command, ['--sandbox', '--from=markdown-raw_html-raw_tex', `--to=${writer}`, '--output', join(directory, `output.${ext}`), '--', input]);
      if (result.ok) support.writers.push(ext);
    }
    for (const [ext, reader] of Object.entries(documentReaders)) {
      if (!readers.output.split(/\s+/).includes(reader.split(/[+-]/)[0])) continue;
      let source = input;
      if (['docx', 'epub'].includes(ext)) {
        if (!support.writers.includes(ext)) continue;
        source = join(directory, `output.${ext}`);
      } else if (ext === 'rtf') {
        source = join(directory, 'input.rtf');
        await writeFile(source, '{\\rtf1\\ansi Santara sandbox probe}', { mode: 0o600 });
      }
      const result = await probe(command, ['--sandbox', `--from=${reader}`, '--to=plain', '--', source]);
      if (result.ok) support.readers.push(ext);
    }
    return support;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export const categories = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'avif', 'heic'],
  video: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v', 'wmv'],
  audio: ['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'aiff', 'aif', 'wma'],
  subtitle: ['srt', 'vtt'], pdf: ['pdf'],
  document: ['docx', 'odt', 'rtf', 'txt', 'md', 'html', 'epub', 'tex'],
  archive: ['zip', 'tar', 'gz', '7z', 'rar'],
};
export const categoryFor = ext => Object.keys(categories).find(key => categories[key].includes(ext)) || 'other';

export function probe(command, args, timeout = 4000) {
  return new Promise(resolve => {
    let output = '';
    let finished = false;
    let child;
    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ ...result, output });
    };
    const timer = setTimeout(() => { child?.kill('SIGKILL'); finish({ ok: false, error: 'Probe timed out' }); }, timeout);
    try {
      child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const collect = chunk => {
        output += chunk.toString();
        if (output.length > 2_000_000) { child.kill('SIGKILL'); finish({ ok: false, error: 'Probe output limit exceeded' }); }
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.on('error', error => finish({ ok: false, error: error.message }));
      child.on('close', code => finish({ ok: code === 0, error: code === 0 ? null : `Exited ${code}` }));
    } catch (error) { finish({ ok: false, error: error.message }); }
  });
}

export async function detectBackends(overrides = {}) {
  const definitions = {
    ffmpeg: ['ffmpeg', ['-version']], ffprobe: ['ffprobe', ['-version']],
    imagemagick: ['magick', ['-version']], qpdf: ['qpdf', ['--version']],
    poppler: ['pdftoppm', ['-v']], pandoc: ['pandoc', ['--version']],
    libreoffice: ['libreoffice', ['--version']],
  };
  const results = await Promise.all(Object.entries(definitions).map(async ([id, [fallback, args]]) => {
    const override = overrides[id];
    let path = typeof override === 'string' ? override : override?.path || fallback;
    if (path.includes('/') || path.includes('\\')) path = resolve(path);
    if (override === false) return [id, { path, available: false, error: 'Disabled' }];
    let result = await probe(path, args);
    if (!result.ok && id === 'imagemagick' && override === undefined) {
      path = 'convert';
      result = await probe(path, args);
    }
    const version = result.output.split('\n').find(line => /\d+\.\d+/.test(line))?.trim() || '';
    const backend = { path, available: result.ok && Boolean(version), version, error: result.error || (!version ? 'No version reported' : null) };
    const minimum = { ffmpeg: 4, ffprobe: 4, imagemagick: 6, qpdf: 8, poppler: 1, pandoc: 2, libreoffice: 6 }[id];
    const major = Number(version.match(/\b(\d+)\.\d+/)?.[1] || 0);
    if (backend.available && major < minimum) {
      backend.available = false;
      backend.error = `Version below supported baseline ${minimum}.0`;
    }
    if (result.ok && id === 'ffmpeg') {
      const [encoders, muxers, filters, demuxers] = await Promise.all([probe(path, ['-hide_banner', '-encoders']), probe(path, ['-hide_banner', '-muxers']), probe(path, ['-hide_banner', '-filters']), probe(path, ['-hide_banner', '-demuxers'])]);
      backend.encoders = encoders.ok ? encoders.output : '';
      backend.muxers = muxers.ok ? muxers.output : '';
      backend.filters = filters.ok ? filters.output : '';
      backend.demuxers = demuxers.ok ? demuxers.output : '';
    }
    if (result.ok && id === 'imagemagick') {
      const formats = await probe(path, ['-list', 'format']);
      backend.coders = {};
      if (formats.ok) for (const line of formats.output.split('\n')) {
        const match = line.match(/^\s*(\w+)\*?\s+\S+\s+([r-][w-][+-])/);
        if (match) backend.coders[match[1].toLowerCase()] = { read: match[2][0] === 'r', write: match[2][1] === 'w' };
      }
    }
    if (backend.available && id === 'pandoc') {
      try { Object.assign(backend, await probePandoc(path)); }
      catch (error) { backend.sandbox = false; backend.error = `Sandbox probe failed: ${error.message}`; }
    }
    return [id, backend];
  }));
  let sharp;
  if (overrides.sharp === false) sharp = { available: false, error: 'Disabled', inputs: [], outputs: [] };
  else {
    try {
      const images = await import('./images.mjs');
      sharp = { ...images.imageCapabilities(), error: null };
    } catch (error) { sharp = { available: false, error: error.message, inputs: [], outputs: [] }; }
  }
  return { ...Object.fromEntries(results), sharp };
}

export const mediaFormats = {
  mp4: ['libx264', 'mp4'], mkv: ['libx264', 'matroska'], webm: ['libvpx-vp9', 'webm'],
  mov: ['libx264', 'mov'], avi: ['mpeg4', 'avi'], wmv: ['wmv2', 'asf'],
  mp3: ['libmp3lame', 'mp3'], wav: ['pcm_s16le', 'wav'], flac: ['flac', 'flac'],
  aiff: ['pcm_s16be', 'aiff'], aif: ['pcm_s16be', 'aiff'], wma: ['wmav2', 'asf'],
  ogg: ['libvorbis', 'ogg'], opus: ['libopus', 'opus'], m4a: ['aac', 'ipod'], gif: ['gif', 'gif'],
};
export const mediaDemuxers = { mp4: 'mov', mov: 'mov', m4v: 'mov', m4a: 'mov', mkv: 'matroska', webm: 'matroska', avi: 'avi', wmv: 'asf', mp3: 'mp3', wav: 'wav', flac: 'flac', ogg: 'ogg', opus: 'ogg', aac: 'aac', aiff: 'aiff', aif: 'aiff', wma: 'asf' };
export const videoFormats = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv'];
export const audioEncoderFor = format => ({ webm: 'libopus', avi: 'libmp3lame', wmv: 'wmav2' }[format] || 'aac');
const token = (text, value) => new RegExp(`\\b${value}\\b`).test(text || '');

export function getCapabilities(backends = {}, files = []) {
  const registry = [];
  const add = (id, label, category, inputs, outputs, backend, extra = {}) => {
    registry.push({ id, label, category, inputs, outputs, backend, available: backend === 'javascript' || Boolean(backends[backend]?.available), batch: true, preservesMetadata: false, options: {}, ...extra });
  };
  const ffmpeg = backends.ffmpeg || {};
  const outputs = Object.entries(mediaFormats).filter(([format, [encoder, muxer]]) => token(ffmpeg.encoders, encoder) && token(ffmpeg.muxers, muxer) && (!videoFormats.includes(format) || token(ffmpeg.encoders, audioEncoderFor(format)))).map(([format]) => format);
  for (const category of ['video', 'audio']) {
    const inputs = categories[category].filter(ext => token(ffmpeg.demuxers, mediaDemuxers[ext]));
    const supported = outputs.filter(format => category === 'video' ? videoFormats.includes(format) : ![...videoFormats, 'gif'].includes(format));
    for (const operation of ['convert', 'compress', 'trim', 'strip-metadata', ...(category === 'video' ? ['resize', 'crop', 'rotate', 'flip', 'extract-audio', 'gif'] : [])]) {
      const targets = operation === 'gif' ? outputs.filter(format => format === 'gif') : operation === 'extract-audio' ? outputs.filter(format => ![...videoFormats, 'gif'].includes(format)) : supported;
      const filter = { resize: 'scale', crop: 'crop', rotate: 'transpose', flip: 'hflip', gif: 'fps' }[operation];
      add(`${category}:${operation}`, `${operation.replaceAll('-', ' ')} ${category}`, category, inputs, targets, 'ffmpeg', { operation, available: !!ffmpeg.available && inputs.length > 0 && targets.length > 0 && (!filter || token(ffmpeg.filters, filter)) && (operation !== 'flip' || token(ffmpeg.filters, 'vflip')) && (operation !== 'gif' || token(ffmpeg.filters, 'scale')), warning: 'Uses the first video and audio streams. Metadata is removed; output codec tags may remain. Compression may increase size.', options: { quality: { min: 1, max: 100 }, ...(operation === 'trim' ? { start: { min: 0 }, duration: { min: 0.01 } } : {}), ...(operation === 'rotate' ? { angle: [90, 180, 270] } : {}), ...(operation === 'flip' ? { direction: ['horizontal', 'vertical'] } : {}), ...(['resize', 'gif'].includes(operation) ? { width: { min: 2, max: operation === 'gif' ? 2048 : 16384 }, ...(operation === 'resize' ? { height: { min: 2, max: 16384 } } : { fps: { min: 1, max: 60 } }) } : {}) } });
    }
  }
  for (const capability of registry) {
    if (capability.operation === 'crop') capability.available = capability.available && Boolean(backends.ffprobe?.available);
    capability.preservesMetadata = !['strip-metadata', 'gif'].includes(capability.operation);
    capability.warning = capability.operation === 'strip-metadata' ? 'Removes copied metadata and chapters; encoder-generated container tags may remain.' : capability.operation === 'gif' ? 'GIF output does not preserve media metadata.' : 'Copies metadata supported by the output container by default; unsupported tags and extra streams may be lost. stripMetadata removes copied tags. Compression may increase size.';
    capability.options.stripMetadata = { default: false };
    if (capability.operation === 'crop') capability.options = { ...capability.options, width: { min: 2, max: 16384, step: 2 }, height: { min: 2, max: 16384, step: 2 }, x: { min: 0, max: 16384 }, y: { min: 0, max: 16384 } };
  }
  const extraMedia = {
    visualize: { category: 'audio', label: 'Audio wave visualizer', filters: ['showwaves', 'color', 'overlay', 'format'], targets: ['mp4'], options: { width: { min: 2, max: 4096 }, height: { min: 2, max: 4096 }, fps: { min: 1, max: 60 }, style: ['point', 'line', 'p2p', 'cline'], backgroundColor: '#111827', waveColor: '#ff8a3d' } },
    normalize: { category: 'audio', label: 'Normalize audio', filters: ['loudnorm', 'aresample'], options: { loudness: { min: -70, max: -5 }, truePeak: { min: -9, max: 0 }, loudnessRange: { min: 1, max: 50 } } },
    channels: { category: 'audio', label: 'Change audio channels', filters: ['aresample'], options: { channels: [1, 2] } },
    mute: { category: 'video', label: 'Mute video', filters: [], options: {} },
    speed: { category: 'video', label: 'Change video speed', filters: ['setpts', 'atempo'], options: { factor: { min: 0.25, max: 4 } } },
    snapshot: { category: 'video', label: 'Save video frame', filters: [], targets: ['png'], options: { time: { min: 0, max: 604800 } } },
  };
  for (const [operation, definition] of Object.entries(extraMedia)) {
    const inputs = categories[definition.category].filter(ext => token(ffmpeg.demuxers, mediaDemuxers[ext]));
    const targets = definition.targets || outputs.filter(format => definition.category === 'audio' ? ![...videoFormats, 'gif'].includes(format) : videoFormats.includes(format));
    const available = !!ffmpeg.available && inputs.length > 0 && targets.length > 0 && definition.filters.every(filter => token(ffmpeg.filters, filter)) && (operation === 'snapshot' ? token(ffmpeg.encoders, 'png') && token(ffmpeg.muxers, 'image2pipe') : targets.every(format => outputs.includes(format)));
    add(`${definition.category}:${operation}`, definition.label, definition.category, inputs, targets, 'ffmpeg', { operation, available, preservesMetadata: operation !== 'snapshot', options: { ...definition.options, quality: { min: 1, max: 100 } }, warning: operation === 'snapshot' ? 'Exports one frame at the selected time. Metadata is not preserved.' : operation === 'visualize' ? 'Creates an MP4 with an animated waveform and the source audio, entirely locally. Uses H.264/AAC re-encoding. The preview shows the overall envelope; export follows the audio in time.' : 'Re-encodes the first selected media stream. Supported metadata is copied unless removal is selected.' });
  }
  for (const category of ['audio', 'video']) for (const operation of ['split', 'merge']) {
    const inputs = categories[category].filter(ext => token(ffmpeg.demuxers, mediaDemuxers[ext]));
    const targets = outputs.filter(format => category === 'audio' ? ![...videoFormats, 'gif'].includes(format) : videoFormats.includes(format));
    add(`${category}:${operation}`, `${operation === 'split' ? 'Split' : 'Merge'} ${category}`, category, inputs, targets, 'ffmpeg', { operation, available: !!ffmpeg.available && inputs.length > 0 && targets.length > 0 && (operation !== 'merge' || (!!backends.ffprobe?.available && token(ffmpeg.demuxers, 'concat'))), batch: operation === 'split', preservesMetadata: true, options: operation === 'split' ? { segments: '0-5,10-15' } : { reencode: ['true', 'false'] }, warning: operation === 'split' ? 'Enter start-end seconds, separated by commas. Each segment is a separate queued output; clips are re-encoded.' : 'Merges in selection order. Streams are validated before merging; incompatible dimensions or track layouts require preprocessing. Re-encoding is enabled by default; direct copy requires matching codecs and stream parameters.' });
  }
  const coders = backends.imagemagick?.coders || {};
  const coder = ext => coders[ext === 'jpg' ? 'jpeg' : ext === 'tif' ? 'tiff' : ext];
  const imageInputs = categories.image.filter(ext => coder(ext)?.read);
  const sharp = backends.sharp || {};
  const sharpInputs = sharp.available ? categories.image.filter(ext => sharp.inputs?.includes(ext)) : [];
  const sharpOutputs = sharp.available ? categories.image.filter(ext => sharp.outputs?.includes(ext)) : [];
  const useSharp = sharpInputs.length > 0 && sharpOutputs.length > 0;
  const canonicalImage = ext => ({ jpg: 'jpeg', tif: 'tiff' }[ext] || ext);
  const imageOutputs = categories.image.filter(ext => coder(ext)?.write && (!useSharp || !sharpOutputs.some(output => canonicalImage(output) === canonicalImage(ext))));
  const imageBackends = [
    ...(useSharp ? [{ backend: 'sharp', inputs: sharpInputs, outputs: sharpOutputs, available: true, suffix: '' }] : []),
    { backend: 'imagemagick', inputs: imageInputs, outputs: imageOutputs, available: !!backends.imagemagick?.available && imageInputs.length > 0 && imageOutputs.length > 0, suffix: useSharp ? ':imagemagick' : '' },
  ];
  for (const source of imageBackends) for (const operation of ['convert', 'compress', 'resize', 'crop', 'rotate', 'flip', 'strip-metadata']) {
    add(`image:${operation}${source.suffix}`, `${operation.replaceAll('-', ' ')} image`, 'image', source.inputs, source.outputs, source.backend, {
      operation, available: source.available,
      options: {
        stripMetadata: { default: false }, autoOrient: { default: true },
        ...(['resize', 'crop'].includes(operation) ? { width: { min: 1, max: 16384 }, height: { min: 1, max: 16384 }, ...(operation === 'crop' ? { x: { min: 0, max: 16384 }, y: { min: 0, max: 16384 } } : {}) }
          : operation === 'rotate' ? { angle: { min: -360, max: 360 } }
            : operation === 'flip' ? { direction: ['horizontal', 'vertical'] }
              : ['convert', 'compress'].includes(operation) ? { quality: { min: 1, max: 100 } } : {}),
      },
      warning: `${source.backend === 'sharp' ? 'Bundled raster conversion; 40 million pixel limit. ' : ''}Auto-orients by default. JPEG transparency is flattened onto white. Animated inputs use the first frame; metadata preservation is not guaranteed.`,
    });
  }
  for (const operation of ['edit-image', 'background']) add(`image:${operation}`, operation === 'edit-image' ? 'Edit photo' : 'Add background', 'image', sharpInputs, sharpOutputs, 'sharp', {
    operation, available: useSharp, preservesMetadata: true,
    options: { quality: { min: 1, max: 100 }, width: { min: 1, max: 16384 }, height: { min: 1, max: 16384 }, padding: { min: 0, max: 16384 }, backgroundType: ['solid', 'gradient'], backgroundColor: '#fff4e8', backgroundColor2: '#e69b73', fit: ['inside', 'contain', 'cover', 'fill'], brightness: { min: 0, max: 4 }, saturation: { min: 0, max: 4 }, contrast: { min: 0, max: 4 } },
    warning: 'Edits create a new file. Preview is reduced in size; exports use source pixels. Cropping uses oriented source coordinates. Solid and horizontal gradient backgrounds are supported. JPEG flattens transparency. First image frame only; 40 megapixel canvas limit.'
  });
  add('image:svg', 'SVG input', 'image', ['svg', 'svgz'], [], 'imagemagick', { operation: 'convert', available: false, warning: 'SVG input is disabled: external resource isolation is not implemented.' });
  add('subtitle:convert', 'Convert subtitles', 'subtitle', ['srt', 'vtt'], ['srt', 'vtt', 'txt'], 'javascript', { operation: 'convert', warning: 'Cue text and timing retained; styling and cue settings are not preserved. TXT output omits timestamps and markup.' });
  for (const operation of ['compress', 'pdf-extract', 'pdf-merge', 'pdf-rotate']) add(`pdf:${operation}`, operation.replaceAll('-', ' '), 'pdf', ['pdf'], ['pdf'], 'qpdf', { operation, batch: operation !== 'pdf-merge', preservesMetadata: operation !== 'pdf-merge', options: operation === 'pdf-rotate' ? { angle: [90, 180, 270], pages: '1-z' } : operation === 'pdf-extract' ? { pages: '1-z' } : {}, warning: operation === 'pdf-merge' ? 'Document-level metadata is discarded when merging.' : 'PDF compression is structural and may not reduce file size.' });
  add('pdf:render', 'Render PDF pages', 'pdf', ['pdf'], ['png', 'jpg'], 'poppler', { operation: 'render', options: { page: { min: 1, max: 100000 }, dpi: { min: 36, max: 600, default: 300 } }, warning: 'Renders one selected page per job.' });
  add('document:convert', 'Convert documents', 'document', backends.pandoc?.readers || [], backends.pandoc?.writers || [], 'pandoc', { operation: 'convert', available: Boolean(backends.pandoc?.available && backends.pandoc?.sandbox && backends.pandoc?.readers?.length && backends.pandoc?.writers?.length), warning: 'Sandboxed conversion, 16 MiB input limit. Complex layout and metadata may be lost; external resources are blocked. No PDF or filters.' });
  add('office:convert', 'Convert office documents', 'document', ['doc', 'docx', 'odt', 'pptx', 'xlsx'], [], 'libreoffice', { operation: 'convert', available: false, warning: 'Disabled until isolated macro and external-resource handling is available.' });
  add('archive:create', 'Create archive', 'archive', ['*', 'directory', ...new Set(Object.values(categories).flat())], ['zip', 'tar', 'gz'], 'javascript', { operation: 'create-archive', batch: false, warning: '128 MiB total, 64 MiB per file, 10,000 entries. ZIP uses STORE; GZIP accepts one regular file. Symlinks and hardlinks are rejected.' });
  add('archive:extract', 'Extract archive', 'archive', ['zip', 'tar', 'gz'], ['directory'], 'javascript', { operation: 'extract', warning: '128 MiB total, 64 MiB per entry. ZIP STORE/DEFLATE, plain USTAR, and GZIP only; links and unsafe paths are rejected.' });
  add('archive:rar', 'Extract RAR / 7z', 'archive', ['rar', '7z'], [], 'javascript', { operation: 'extract', available: false, warning: 'RAR and 7z are unsupported.' });
  return registry;
}
