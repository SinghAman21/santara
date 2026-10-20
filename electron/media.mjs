import path from 'node:path';
import { audioEncoderFor, categoryFor, mediaDemuxers, mediaFormats, videoFormats } from './registry.mjs';

export const requiredFilters = Object.freeze(Object.fromEntries(Object.entries({
  visualize: ['showwaves', 'color', 'overlay', 'format'],
  normalize: ['loudnorm', 'aresample'],
  mute: [],
  speed: ['setpts', 'atempo'],
  snapshot: [],
  channels: ['aresample'],
  split: [],
  merge: [],
}).map(([operation, filters]) => [operation, Object.freeze(filters)])));

function number(value, fallback, name, minimum, maximum, integer = false) {
  if (value === undefined) value = fallback;
  if (typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) value = Number(value);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`Invalid ${name}: expected ${integer ? 'integer' : 'number'} ${minimum}–${maximum}`);
  }
  return value;
}

function color(value, fallback, name) {
  if (value === undefined) value = fallback;
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error(`Invalid ${name}: expected #RRGGBB`);
  return `0x${value.slice(1).toLowerCase()}`;
}

function localPath(value, name) {
  if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f]/.test(value) || (/^[a-z][\da-z+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value))) {
    throw new Error(`Invalid ${name}: expected local file path`);
  }
  return path.resolve(value);
}

function samePath(first, second) {
  return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
}

function videoEncodingArgs(encoder, quality) {
  if (encoder === 'libx264') return ['-pix_fmt', 'yuv420p', '-crf', String(Math.round(51 - quality * 0.5))];
  if (encoder === 'libvpx-vp9') return ['-b:v', '0', '-crf', String(Math.round(63 - quality * 0.6))];
  if (['mpeg4', 'wmv2'].includes(encoder)) return ['-q:v', String(Math.max(2, Math.round(32 - quality * 0.3)))];
  return [];
}

function metadataArgs(stripMetadata) {
  return stripMetadata ? ['-map_metadata', '-1', '-map_metadata:s', '-1', '-map_chapters', '-1'] : ['-map_metadata', '0', '-map_chapters', '0'];
}

function tempoFilters(factor) {
  const filters = [];
  while (factor < 0.5) { filters.push('atempo=0.5'); factor /= 0.5; }
  while (factor > 2) { filters.push('atempo=2'); factor /= 2; }
  filters.push(`atempo=${factor}`);
  return filters.join(',');
}

export function mediaOperationArgs(job, input, output, dimensions) {
  if (!Object.hasOwn(requiredFilters, job?.operation) || job.operation === 'merge') return null;
  const operation = job.operation;
  const options = job.options === undefined ? {} : job.options;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid media options');
  const original = localPath(job.input, 'job input');
  input = localPath(input, 'input');
  output = localPath(output, 'output');
  if (samePath(input, output) || samePath(original, output)) throw new Error('Media output must differ from input');
  const extension = path.extname(original).slice(1).toLowerCase();
  const category = categoryFor(extension);
  if (!Object.hasOwn(mediaDemuxers, extension)) throw new Error('Unsupported media input');
  const audioOperation = ['visualize', 'normalize', 'channels'].includes(operation) || (operation === 'split' && category === 'audio');
  if (category !== (audioOperation ? 'audio' : 'video')) throw new Error(`Unsupported ${operation} input`);
  const format = job.format;
  if (operation === 'snapshot') {
    if (format !== 'png') throw new Error('Snapshot output must be png');
  } else {
    const supported = Object.hasOwn(mediaFormats, format) && format !== 'gif' && (operation === 'visualize' ? format === 'mp4' : audioOperation ? !videoFormats.includes(format) : videoFormats.includes(format));
    if (!supported) throw new Error(`Unsupported ${operation} output format`);
  }
  const quality = number(options.quality, 75, 'quality', 1, 100);
  const bitrate = number(options.bitrate, 128, 'bitrate', 16, 512, true);
  if (options.stripMetadata !== undefined && typeof options.stripMetadata !== 'boolean') throw new Error('Invalid stripMetadata');
  const args = ['-hide_banner', '-nostdin', '-v', 'error', '-n', '-protocol_whitelist', 'file', '-f', mediaDemuxers[extension], '-i', input];
  if (operation === 'split') args.push('-ss', String(number(options.start, 0, 'start', 0, 604800)), '-t', String(number(options.duration, 10, 'duration', 0.01, 604800)));

  if (operation === 'visualize') {
    const width = number(options.width, 1280, 'width', 2, 4096, true);
    const height = number(options.height, 720, 'height', 2, 4096, true);
    if (width % 2 || height % 2 || width * height > 8_294_400) throw new Error('Waveform dimensions must be even and at most 8294400 pixels');
    const fps = number(options.fps, 30, 'fps', 1, 60, true);
    const background = color(options.backgroundColor, '#111827', 'backgroundColor');
    const wave = color(options.waveColor, '#ff8a3d', 'waveColor');
    const style = options.style === undefined ? 'line' : options.style;
    if (!['point', 'line', 'p2p', 'cline'].includes(style)) throw new Error('Invalid waveform style');
    const graph = `color=c=${background}:s=${width}x${height}:r=${fps}[background];[0:a:0]showwaves=s=${width}x${height}:r=${fps}:mode=${style}:colors=${wave}:draw=full,format=rgba[wave];[background][wave]overlay=shortest=1:format=auto,format=yuv420p[video]`;
    args.push('-filter_complex', graph, '-map', '[video]', '-map', '0:a:0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(Math.round(51 - quality * 0.5)), '-c:a', 'aac', '-b:a', `${bitrate}k`, '-shortest', '-movflags', '+faststart');
  } else if (operation === 'snapshot') {
    const time = number(options.time, 0, 'time', 0, 604800);
    args.push('-ss', String(time), '-map', '0:v:0', '-frames:v', '1', '-an', '-sn', '-dn', '-c:v', 'png');
  } else if (audioOperation) {
    args.push('-map', '0:a:0', '-vn', '-sn', '-dn', '-c:a', mediaFormats[format][0]);
    if (operation === 'normalize') {
      const loudness = number(options.loudness, -16, 'loudness', -70, -5);
      const truePeak = number(options.truePeak, -1.5, 'truePeak', -9, 0);
      const loudnessRange = number(options.loudnessRange, 11, 'loudnessRange', 1, 50);
      args.push('-af', `loudnorm=I=${loudness}:TP=${truePeak}:LRA=${loudnessRange},aresample=48000`);
    } else if (operation === 'channels') {
      const channels = number(options.channels, 1, 'channels', 1, 2, true);
      args.push('-af', 'aresample', '-ac', String(channels));
    }
    if (['mp3', 'ogg', 'opus', 'm4a', 'wma'].includes(format)) args.push('-b:a', `${bitrate}k`);
  } else {
    const encoder = mediaFormats[format][0];
    args.push('-map', '0:v:0', '-c:v', encoder, '-sn', '-dn');
    if (operation === 'mute') args.push('-an');
    else {
      if (operation === 'speed') {
        const factor = number(options.factor, 1, 'factor', 0.25, 4);
        args.push('-vf', `setpts=(PTS-STARTPTS)/${factor}`, '-af', tempoFilters(factor));
      }
      args.push('-map', '0:a:0?', '-c:a', audioEncoderFor(format), '-b:a', `${bitrate}k`);
    }
    args.push(...videoEncodingArgs(encoder, quality));
  }
  args.push(...metadataArgs(options.stripMetadata));
  args.push('-progress', 'pipe:1', '-f', operation === 'snapshot' ? 'image2pipe' : mediaFormats[format][1], output);
  return args;
}

function streamProperties(stream, reencode) {
  if (!stream || typeof stream !== 'object' || Array.isArray(stream) || !['video', 'audio'].includes(stream.codec_type)) throw new Error('Merge supports audio/video streams only');
  if (typeof stream.codec_name !== 'string' || !/^[a-z0-9_]+$/.test(stream.codec_name) || stream.codec_name === 'unknown') throw new Error('Missing or invalid merge codec_name');
  if (typeof stream.time_base !== 'string' || !/^[1-9]\d*\/[1-9]\d*$/.test(stream.time_base)) throw new Error('Missing or invalid merge time_base');
  const properties = { codec_type: stream.codec_type, codec_name: stream.codec_name, time_base: stream.time_base };
  const text = name => {
    if (typeof stream[name] !== 'string' || !stream[name] || stream[name] === 'unknown') throw new Error(`Missing or invalid merge ${name}`);
    properties[name] = stream[name];
  };
  const fields = stream.codec_type === 'video'
    ? ['sample_aspect_ratio', 'r_frame_rate', 'avg_frame_rate', 'field_order', 'color_range', 'color_space', 'color_transfer', 'color_primaries', 'chroma_location', 'coded_width', 'coded_height', 'has_b_frames', 'bits_per_raw_sample']
    : ['channel_layout', 'bits_per_sample', 'bits_per_raw_sample', 'initial_padding', 'trailing_padding', 'seek_preroll', 'block_align', 'frame_size'];
  if (stream.codec_type === 'video') {
    properties.width = number(stream.width, undefined, 'merge width', 1, 16384, true);
    properties.height = number(stream.height, undefined, 'merge height', 1, 16384, true);
    text('pix_fmt');
    properties.rotation = stream.side_data_list?.find(item => item.rotation !== undefined)?.rotation ?? 0;
    properties.attached_pic = stream.disposition?.attached_pic ?? 0;
  } else {
    properties.sample_rate = number(stream.sample_rate, undefined, 'merge sample_rate', 1, 768000, true);
    properties.channels = number(stream.channels, undefined, 'merge channels', 1, 64, true);
    text('sample_fmt');
  }
  if (!reencode) fields.push('profile', 'level', 'codec_tag_string', 'codec_tag', 'extradata_size', 'is_avc', 'nal_length_size');
  for (const field of fields) properties[field] = stream[field] ?? null;
  if (!reencode) {
    if (['h264', 'aac', 'vorbis', 'opus', 'mpeg4', 'flac', 'wmav2'].includes(stream.codec_name) && stream.extradata_size === undefined) throw new Error('Copy merge requires complete ffprobe -show_streams codec configuration; enable reencode otherwise');
    if (stream.extradata_size !== undefined) number(stream.extradata_size, undefined, 'merge extradata_size', 0, 16 * 1024 * 1024, true);
    if (stream.extradata_size > 0 && !stream.extradata_hash && !stream.extradata) throw new Error('Copy merge requires ffprobe -show_data_hash sha256 (or -show_data) to compare codec configuration; enable reencode otherwise');
    properties.extradata_hash = stream.extradata_hash ?? null;
    properties.extradata = stream.extradata ?? null;
  }
  return properties;
}

export function mediaMergeArgs(job, manifestPath, output, metadataArray) {
  if (job?.operation !== 'merge') return null;
  const options = job.options === undefined ? {} : job.options;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid media options');
  if (options.reencode !== undefined && typeof options.reencode !== 'boolean') throw new Error('Invalid reencode: expected boolean');
  if (options.stripMetadata !== undefined && typeof options.stripMetadata !== 'boolean') throw new Error('Invalid stripMetadata');
  const reencode = options.reencode !== false;
  const quality = number(options.quality, 75, 'quality', 1, 100);
  const bitrate = number(options.bitrate, 128, 'bitrate', 16, 512, true);
  const original = localPath(job.input, 'job input');
  manifestPath = localPath(manifestPath, 'manifest');
  output = localPath(output, 'output');
  if (samePath(manifestPath, output) || samePath(original, output)) throw new Error('Merge output must differ from input and manifest');
  const extension = path.extname(original).slice(1).toLowerCase();
  const category = categoryFor(extension);
  if (!Object.hasOwn(mediaDemuxers, extension) || !['audio', 'video'].includes(category)) throw new Error('Unsupported merge input');
  const format = job.format;
  if (!Object.hasOwn(mediaFormats, format) || format === 'gif' || videoFormats.includes(format) !== (category === 'video')) throw new Error('Unsupported merge output format');
  if (!Array.isArray(metadataArray) || metadataArray.length < 2 || metadataArray.length > 100) throw new Error('Merge requires metadata for 2–100 inputs');
  const allStreams = Array.from(metadataArray, (metadata, index) => {
    if (!metadata || !Array.isArray(metadata.streams) || !metadata.streams.length) throw new Error(`Missing merge streams for input ${index + 1}`);
    if (metadata.format?.filename) {
      localPath(metadata.format.filename, 'probed input');
      if (samePath(path.resolve(path.dirname(manifestPath), metadata.format.filename), output)) throw new Error('Merge output must differ from every input');
    }
    return metadata.streams.map(stream => streamProperties(stream, reencode));
  });
  const first = allStreams[0];
  const hasVideo = first.some(stream => stream.codec_type === 'video');
  const hasAudio = first.some(stream => stream.codec_type === 'audio');
  if (category === 'video' ? !hasVideo : !hasAudio || hasVideo) throw new Error('Merge input streams do not match the audio/video category');
  for (let index = 1; index < allStreams.length; index++) {
    const streams = allStreams[index];
    if (streams.length !== first.length) throw new Error(`Merge input ${index + 1} has a different stream count; convert inputs to matching streams first`);
    for (let streamIndex = 0; streamIndex < first.length; streamIndex++) {
      for (const [field, value] of Object.entries(first[streamIndex])) {
        if (streams[streamIndex][field] !== value) {
          const action = field === 'codec_name' || field === 'time_base' ? 'normalize inputs to the same codec and time base before concat' : 'resize video or convert audio to matching stream settings first';
          throw new Error(`Incompatible merge input ${index + 1}, stream ${streamIndex}: ${field} differs; ${action}${reencode ? '' : ', or enable reencode for codec configuration differences'}`);
        }
      }
    }
  }
  const [encoder, muxer] = mediaFormats[format];
  if (!reencode) {
    const expectedContainer = mediaDemuxers[format];
    let container;
    for (const metadata of metadataArray) {
      const actual = metadata.format?.format_name;
      if (typeof actual !== 'string' || !actual.split(',').includes(expectedContainer) || (container !== undefined && container !== actual)) throw new Error('Copy merge requires the same supported matching input/output format; include ffprobe format.format_name or enable reencode');
      container = actual;
    }
    const codecFor = name => ({ libx264: 'h264', 'libvpx-vp9': 'vp9', libmp3lame: 'mp3', libvorbis: 'vorbis', libopus: 'opus' }[name] || name);
    const video = first.find(stream => stream.codec_type === 'video');
    const audio = first.find(stream => stream.codec_type === 'audio');
    if ((video && video.codec_name !== codecFor(encoder)) || (audio && audio.codec_name !== codecFor(category === 'video' ? audioEncoderFor(format) : encoder))) throw new Error('Copy merge codec does not match the supported output format; enable reencode');
  }
  const args = ['-hide_banner', '-nostdin', '-v', 'error', '-n', '-protocol_whitelist', 'file', '-f', 'concat', '-safe', '1', '-i', manifestPath];
  if (category === 'video') {
    args.push('-map', '0:v:0', '-map', '0:a:0?', '-c:v', reencode ? encoder : 'copy', '-c:a', reencode ? audioEncoderFor(format) : 'copy');
    if (reencode) args.push(...videoEncodingArgs(encoder, quality), '-b:a', `${bitrate}k`);
  } else {
    args.push('-map', '0:a:0', '-vn', '-c:a', reencode ? encoder : 'copy');
    if (reencode && ['mp3', 'ogg', 'opus', 'm4a', 'wma'].includes(format)) args.push('-b:a', `${bitrate}k`);
  }
  args.push('-sn', '-dn', ...metadataArgs(options.stripMetadata), '-progress', 'pipe:1', '-f', muxer, output);
  return args;
}
