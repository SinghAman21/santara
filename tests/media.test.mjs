import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mediaMergeArgs, mediaOperationArgs, requiredFilters } from '../electron/media.mjs';

const execute = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const input = path.resolve('audio.wav');
const videoInput = path.resolve('video.mp4');
const output = path.resolve('output.mp4');
const audioOperations = ['visualize', 'normalize', 'channels'];
const formats = { visualize: 'mp4', normalize: 'wav', channels: 'wav', mute: 'mp4', speed: 'mp4', snapshot: 'png' };
const makeJob = (operation, options = {}, format = formats[operation]) => ({ operation, input: audioOperations.includes(operation) ? input : videoInput, format, options });
const argsFor = (operation, options, format) => {
  const job = makeJob(operation, options, format);
  return mediaOperationArgs(job, job.input, output);
};
const valueOf = (args, flag) => args[args.indexOf(flag) + 1];
const audioProbe = { streams: [{ codec_type: 'audio', codec_name: 'pcm_s16le', sample_rate: '48000', channels: 2, sample_fmt: 's16', channel_layout: 'stereo', time_base: '1/48000' }], format: { format_name: 'wav' } };
const videoProbe = {
  streams: [
    { codec_type: 'video', codec_name: 'h264', width: 64, height: 48, pix_fmt: 'yuv420p', time_base: '1/12288', sample_aspect_ratio: '1:1', avg_frame_rate: '24/1', r_frame_rate: '24/1', profile: 'High', level: 10, extradata_size: 42, extradata_hash: `SHA256:${'a'.repeat(64)}` },
    { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2, sample_fmt: 'fltp', channel_layout: 'stereo', time_base: '1/48000', extradata_size: 5, extradata_hash: `SHA256:${'b'.repeat(64)}` },
  ],
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
};
const mergeJob = (options = {}, format = 'wav') => ({ operation: 'merge', input: format === 'wav' || format === 'mp3' ? input : videoInput, format, options });
const mergeArgsFor = (options = {}, metadata = [structuredClone(audioProbe), structuredClone(audioProbe)], format = 'wav') => mediaMergeArgs(mergeJob(options, format), path.resolve('list.ffconcat'), output, metadata);

test('old and unknown operations delegate before validating new-operation options', () => {
  for (const operation of ['convert', 'compress', 'trim', 'resize', 'crop', 'rotate', 'flip', 'extract-audio', 'gif', 'strip-metadata', 'constructor', '__proto__', 'unknown']) {
    assert.equal(mediaOperationArgs({ operation, options: null }), null);
  }
  assert.equal(mediaOperationArgs(), null);
  assert.equal(mediaOperationArgs({ operation: 'merge', options: null }), null);
  assert.equal(mediaMergeArgs({ operation: 'convert', options: null }), null);
  assert.equal(mediaMergeArgs(), null);
});

test('split reencodes audio/video into supported targets without consuming segment strings', () => {
  for (const format of ['wav', 'mp3', 'm4a', 'mp4', 'mkv', 'webm', 'aiff']) {
    const job = { operation: 'split', input: path.resolve(`source.${format}`), format, options: { start: '1.25', duration: '2.5', segments: '0-1;movie=/secret' } };
    const args = mediaOperationArgs(job, job.input, output);
    assert.equal(valueOf(args, '-ss'), '1.25');
    assert.equal(valueOf(args, '-t'), '2.5');
    assert.ok(args.indexOf('-ss') > args.indexOf('-i'));
    assert.ok(!args.includes('-filter_complex') && !args.includes('-vf') && !args.includes('-af'));
    assert.ok(!args.includes('copy'));
    assert.ok(!args.some(value => value.includes('/secret')));
  }
  const job = { operation: 'split', input, format: 'wav' };
  const defaults = mediaOperationArgs(job, input, output);
  assert.equal(valueOf(defaults, '-ss'), '0');
  assert.equal(valueOf(defaults, '-t'), '10');
  for (const name of ['start', 'duration']) for (const value of [null, true, [], {}, '', ' ', '1,volume=0', Infinity, NaN, -1, 604801]) {
    assert.throws(() => mediaOperationArgs({ ...job, options: { [name]: value } }, input, output), /Invalid/);
  }
  assert.throws(() => mediaOperationArgs({ ...job, options: { duration: 0 } }, input, output), /Invalid duration/);
  assert.equal(valueOf(mediaOperationArgs({ ...job, format: 'mp3' }, input, output), '-c:a'), 'libmp3lame');
  assert.equal(valueOf(mediaOperationArgs({ ...job, input: videoInput, format: 'webm' }, videoInput, output), '-c:v'), 'libvpx-vp9');
  assert.throws(() => mediaOperationArgs({ ...job, format: 'mp4' }, input, output), /Unsupported split output format/);
  assert.deepEqual(requiredFilters.split, []);
  assert.deepEqual(requiredFilters.merge, []);
});

test('merge uses a safe concat input and defaults to standard output encoders', () => {
  const args = mergeArgsFor();
  assert.equal(valueOf(args, '-protocol_whitelist'), 'file');
  assert.equal(valueOf(args, '-f'), 'concat');
  assert.equal(valueOf(args, '-safe'), '1');
  assert.equal(valueOf(args, '-i'), path.resolve('list.ffconcat'));
  assert.equal(valueOf(args, '-c:a'), 'pcm_s16le');
  assert.ok(args.includes('-n') && args.includes('-nostdin') && args.includes('-vn'));
  assert.equal(valueOf(args, '-progress'), 'pipe:1');
  assert.equal(args.at(-2), 'wav');
  assert.equal(args.at(-1), output);
  assert.equal(valueOf(mergeArgsFor({}, undefined, 'mp3'), '-c:a'), 'libmp3lame');
  const videoArgs = mergeArgsFor({}, [videoProbe, structuredClone(videoProbe)], 'mp4');
  assert.equal(valueOf(videoArgs, '-c:v'), 'libx264');
  assert.equal(valueOf(videoArgs, '-c:a'), 'aac');
  assert.ok(videoArgs.includes('0:v:0') && videoArgs.includes('0:a:0?'));
  const silent = structuredClone(videoProbe);
  silent.streams.pop();
  assert.ok(mergeArgsFor({}, [silent, structuredClone(silent)], 'mp4').includes('0:a:0?'));
});

test('merge checks every stream even when only the first audio/video stream is mapped', () => {
  for (const reencode of [true, false]) {
    const baseline = structuredClone(videoProbe);
    baseline.streams.push(structuredClone(baseline.streams[1]));
    const changed = structuredClone(baseline);
    changed.streams[2].channels = 1;
    assert.throws(() => mergeArgsFor({ reencode }, [baseline, changed], 'mp4'), /stream 2: channels differs.*convert audio/);
    assert.throws(() => mergeArgsFor({ reencode }, [baseline, videoProbe], 'mp4'), /stream count/);
    const reordered = structuredClone(videoProbe);
    reordered.streams.reverse();
    assert.throws(() => mergeArgsFor({ reencode }, [videoProbe, reordered], 'mp4'), /codec_type differs/);
  }
});

test('concat rejects incompatible geometry, audio settings, source codecs and time bases', () => {
  const changes = [
    [0, 'width', 128], [0, 'height', 96], [0, 'pix_fmt', 'yuv444p'], [0, 'sample_aspect_ratio', '2:1'], [0, 'avg_frame_rate', '30/1'], [0, 'r_frame_rate', '30/1'], [0, 'time_base', '1/90000'], [0, 'codec_name', 'mpeg4'],
    [1, 'sample_rate', '44100'], [1, 'channels', 1], [1, 'sample_fmt', 's16'], [1, 'channel_layout', 'mono'], [1, 'time_base', '1/44100'], [1, 'codec_name', 'mp3'],
  ];
  for (const reencode of [true, false]) for (const [streamIndex, name, value] of changes) {
    const changed = structuredClone(videoProbe);
    changed.streams[streamIndex][name] = value;
    assert.throws(() => mergeArgsFor({ reencode }, [videoProbe, changed], 'mp4'), new RegExp(`${name} differs`));
  }
  const rotated = structuredClone(videoProbe);
  rotated.streams[0].side_data_list = [{ rotation: 90 }];
  assert.throws(() => mergeArgsFor({}, [videoProbe, rotated], 'mp4'), /rotation differs.*resize/);
});

test('copy mode requires verified matching containers, codecs and codec configurations', () => {
  assert.equal(valueOf(mergeArgsFor({ reencode: false }), '-c:a'), 'copy');
  const args = mergeArgsFor({ reencode: false }, [videoProbe, structuredClone(videoProbe)], 'mp4');
  assert.equal(valueOf(args, '-c:v'), 'copy');
  assert.equal(valueOf(args, '-c:a'), 'copy');
  for (const name of ['profile', 'level', 'codec_tag_string', 'extradata_size', 'extradata_hash']) {
    const changed = structuredClone(videoProbe);
    changed.streams[0][name] = name === 'extradata_size' || name === 'level' ? 99 : 'different';
    assert.throws(() => mergeArgsFor({ reencode: false }, [videoProbe, changed], 'mp4'), new RegExp(`${name} differs`));
    assert.ok(mergeArgsFor({ reencode: true }, [videoProbe, changed], 'mp4'));
  }
  const missingHash = structuredClone(videoProbe);
  delete missingHash.streams[0].extradata_hash;
  assert.throws(() => mergeArgsFor({ reencode: false }, [missingHash, missingHash], 'mp4'), /show_data_hash/);
  assert.ok(mergeArgsFor({}, [missingHash, missingHash], 'mp4'));
  delete missingHash.streams[0].extradata_size;
  assert.throws(() => mergeArgsFor({ reencode: false }, [missingHash, missingHash], 'mp4'), /complete ffprobe/);
  assert.ok(mergeArgsFor({}, [missingHash, missingHash], 'mp4'));
  for (const format_name of [undefined, 'flac', 'mov,mp4']) {
    const changed = structuredClone(audioProbe);
    changed.format.format_name = format_name;
    assert.throws(() => mergeArgsFor({ reencode: false }, [audioProbe, changed]), /matching input\/output format/);
  }
  const changed = structuredClone(audioProbe);
  changed.streams[0].codec_name = 'pcm_s32le';
  changed.streams[0].sample_fmt = 's32';
  assert.throws(() => mergeArgsFor({ reencode: false }, [changed, changed]), /codec does not match/);
  assert.equal(valueOf(mergeArgsFor({}, [changed, changed]), '-c:a'), 'pcm_s16le');
});

test('merge rejects incomplete probes and unsafe arguments without interpolating metadata or paths', () => {
  for (const metadata of [undefined, null, [], [audioProbe], Array(2), Array(101).fill(audioProbe), [{}, audioProbe], [{ streams: [] }, audioProbe]]) {
    assert.throws(() => mediaMergeArgs(mergeJob(), input, output, metadata), /metadata|streams/);
  }
  for (const [streamIndex, names] of [[0, ['codec_name', 'codec_type', 'width', 'height', 'pix_fmt', 'time_base']], [1, ['sample_rate', 'channels', 'sample_fmt']]]) {
    for (const name of names) {
      const changed = structuredClone(videoProbe);
      delete changed.streams[streamIndex][name];
      assert.throws(() => mergeArgsFor({}, [changed, changed], 'mp4'), /invalid|audio\/video|Invalid/);
    }
  }
  const unsupported = structuredClone(videoProbe);
  unsupported.streams.push({ codec_type: 'subtitle', codec_name: 'subrip', time_base: '1/1000' });
  assert.throws(() => mergeArgsFor({}, [unsupported, unsupported], 'mp4'), /audio\/video streams only/);
  for (const value of [null, 'true', 'false', 1, 0, [], {}]) assert.throws(() => mergeArgsFor({ reencode: value }), /Invalid reencode/);
  assert.throws(() => mergeArgsFor({ stripMetadata: 'true' }), /Invalid stripMetadata/);
  for (const value of ['https://example.com/list', 'file:/tmp/list', 'concat:foo|bar', '', '\0']) {
    assert.throws(() => mediaMergeArgs(mergeJob(), value, output, [audioProbe, audioProbe]), /local file path/);
    assert.throws(() => mediaMergeArgs(mergeJob(), input, value, [audioProbe, audioProbe]), /local file path/);
  }
  assert.throws(() => mediaMergeArgs(mergeJob(), input, input, [audioProbe, audioProbe]), /differ/);
  const anotherInput = structuredClone(audioProbe);
  anotherInput.format.filename = output;
  assert.throws(() => mergeArgsFor({}, [audioProbe, anotherInput]), /differ from every input/);
  const baseline = structuredClone([audioProbe, audioProbe]);
  assert.deepEqual(mergeArgsFor({ filter: 'movie=/secret', filename: '/secret', inputs: ['/secret'] }, baseline), mergeArgsFor());
  assert.deepEqual(baseline, [audioProbe, audioProbe]);
  assert.equal(valueOf(mergeArgsFor({ stripMetadata: true }), '-map_metadata'), '-1');
});

test('new operations return full args using the staged input and explicit output muxer', () => {
  for (const operation of Object.keys(formats)) {
    const job = makeJob(operation);
    const before = structuredClone(job);
    const staged = path.resolve('staged input with ; quotes\' and [brackets]');
    const target = path.resolve('output with %03d and ; characters');
    const args = mediaOperationArgs(job, staged, target, { width: 64, height: 48 });
    assert.ok(args.every(value => typeof value === 'string'));
    assert.equal(valueOf(args, '-i'), staged);
    assert.equal(valueOf(args, '-f'), audioOperations.includes(operation) ? 'wav' : 'mov');
    assert.equal(args.at(-2), operation === 'snapshot' ? 'image2pipe' : operation === 'normalize' || operation === 'channels' ? 'wav' : 'mp4');
    assert.equal(args.at(-1), target);
    assert.equal(valueOf(args, '-progress'), 'pipe:1');
    assert.equal(valueOf(args, '-protocol_whitelist'), 'file');
    assert.ok(args.includes('-nostdin') && args.includes('-n'));
    for (const flag of ['-filter_complex', '-af', '-vf']) if (args.includes(flag)) {
      assert.ok(!valueOf(args, flag).includes(staged));
      assert.ok(!valueOf(args, flag).includes(target));
    }
    assert.deepEqual(job, before);
  }
});

test('visualize sanitizes UI options, constrains its graph and emits H264/AAC MP4', () => {
  const args = argsFor('visualize', { width: '320', height: '180', fps: '24', backgroundColor: '#123ABC', waveColor: '#Ff8A3D', style: 'cline' });
  const graph = valueOf(args, '-filter_complex');
  assert.match(graph, /color=c=0x123abc:s=320x180:r=24/);
  assert.match(graph, /showwaves=s=320x180:r=24:mode=cline:colors=0xff8a3d/);
  assert.match(graph, /overlay=shortest=1/);
  assert.equal(valueOf(args, '-c:v'), 'libx264');
  assert.equal(valueOf(args, '-c:a'), 'aac');
  assert.ok(args.includes('-shortest'));
});

test('speed chains safe atempo stages and permits a video without audio', () => {
  for (const factor of [0.25, 0.3, 0.5, 1, 1.25, 2, 3, 4]) {
    const args = argsFor('speed', { factor: String(factor) });
    const tempos = valueOf(args, '-af').split(',').map(filter => Number(filter.split('=')[1]));
    assert.ok(tempos.every(tempo => tempo >= 0.5 && tempo <= 2));
    assert.ok(Math.abs(tempos.reduce((product, tempo) => product * tempo, 1) - factor) < 1e-10);
    assert.equal(valueOf(args, '-vf'), `setpts=(PTS-STARTPTS)/${factor}`);
    assert.ok(args.includes('0:a:0?'));
  }
});

test('video redaction uses bounded solid masks with precise time windows', () => {
  const job = { operation: 'redact', input: videoInput, format: 'mp4', options: { masks: [{ x: 4, y: 6, width: 20, height: 12, start: 1.25, end: 3, color: '#12aBcD' }] } };
  const args = mediaOperationArgs(job, videoInput, output, { width: 64, height: 48 });
  assert.equal(valueOf(args, '-vf'), "drawbox=x=4:y=6:w=20:h=12:color=0x12abcd:t=fill:enable='between(t,1.25,3)'");
  assert.equal(valueOf(args, '-c:v'), 'libx264');
  assert.ok(args.includes('0:a:0?'));
  for (const masks of [[], Array(17).fill({ x: 0, y: 0, width: 2, height: 2, start: 0, end: 1 }), [{ x: -1, y: 0, width: 2, height: 2, start: 0, end: 1 }], [{ x: 0, y: 0, width: 2, height: 2, start: 2, end: 1 }], [{ x: 0, y: 0, width: 2, height: 2, start: 0, end: 1, color: 'black:drawbox=1' }]]) {
    assert.throws(() => mediaOperationArgs({ ...job, options: { masks } }, videoInput, output, { width: 64, height: 48 }));
  }
  assert.deepEqual(requiredFilters.redact, ['drawbox']);
});

test('normalize bounds EBU targets and explicitly returns to a supported sample rate', () => {
  const args = argsFor('normalize', { loudness: '-18', truePeak: '-2', loudnessRange: '7' });
  assert.equal(valueOf(args, '-af'), 'loudnorm=I=-18:TP=-2:LRA=7,aresample=48000');
  assert.equal(valueOf(args, '-c:a'), 'pcm_s16le');
});

test('snapshot accepts PNG outside mediaFormats and seeks to a single literal output', () => {
  const args = argsFor('snapshot', { time: '1.25' });
  assert.equal(valueOf(args, '-ss'), '1.25');
  assert.equal(valueOf(args, '-frames:v'), '1');
  assert.equal(valueOf(args, '-c:v'), 'png');
  assert.equal(args.at(-2), 'image2pipe');
  assert.ok(args.includes('-an'));
});

test('channel counts, metadata and format-specific encoders are explicit', () => {
  for (const channels of [1, 2]) assert.equal(valueOf(argsFor('channels', { channels: String(channels) }), '-ac'), String(channels));
  for (const [format, encoder] of Object.entries({ mp3: 'libmp3lame', wav: 'pcm_s16le', flac: 'flac', ogg: 'libvorbis', opus: 'libopus', m4a: 'aac', aiff: 'pcm_s16be', aif: 'pcm_s16be', wma: 'wmav2' })) {
    assert.equal(valueOf(argsFor('normalize', {}, format), '-c:a'), encoder);
    assert.equal(valueOf(argsFor('channels', {}, format), '-c:a'), encoder);
  }
  for (const [format, encoder] of Object.entries({ mp4: 'libx264', mkv: 'libx264', mov: 'libx264', webm: 'libvpx-vp9', avi: 'mpeg4', wmv: 'wmv2' })) {
    const args = argsFor('mute', {}, format);
    assert.equal(valueOf(args, '-c:v'), encoder);
    assert.ok(args.includes('-an') && !args.includes('-c:a'));
  }
  for (const operation of Object.keys(formats)) {
    const stripped = argsFor(operation, { stripMetadata: true });
    assert.equal(valueOf(stripped, '-map_metadata'), '-1');
    assert.equal(valueOf(stripped, '-map_metadata:s'), '-1');
    assert.equal(valueOf(stripped, '-map_chapters'), '-1');
    assert.equal(valueOf(argsFor(operation), '-map_metadata'), '0');
  }
});

test('invalid types, filter expressions and numbers cannot enter generated filters', () => {
  const badNumbers = [null, true, false, [], {}, '', ' ', '1;amovie=/secret', '1,volume=0', '2:evil=1', '0x10', 'NaN', Infinity, NaN];
  const fields = { visualize: ['width', 'height', 'fps'], normalize: ['loudness', 'truePeak', 'loudnessRange'], speed: ['factor'], snapshot: ['time'], channels: ['channels'] };
  for (const [operation, names] of Object.entries(fields)) for (const name of [...names, 'quality', 'bitrate']) for (const value of badNumbers) {
    assert.throws(() => argsFor(operation, { [name]: value }), /Invalid/, `${operation}.${name}=${String(value)}`);
  }
  for (const name of ['backgroundColor', 'waveColor']) for (const value of ['red', '#abc', '#ff0000@0', '#ff0000;movie=/etc/passwd', '0xff0000', '#12zz12', {}, null]) {
    assert.throws(() => argsFor('visualize', { [name]: value }), /Invalid/);
  }
  for (const value of ['line;movie=/secret', 'bars', null, {}, 1]) assert.throws(() => argsFor('visualize', { style: value }), /Invalid/);
  for (const operation of Object.keys(formats)) {
    for (const options of [null, [], 'options']) assert.throws(() => argsFor(operation, options), /Invalid media options/);
    assert.throws(() => argsFor(operation, { stripMetadata: 'false' }), /Invalid stripMetadata/);
  }
});

test('numeric ranges reject excessive work, invalid channels and unsafe dimensions', () => {
  const cases = [
    ['visualize', { width: 3 }], ['visualize', { height: 1 }], ['visualize', { width: 4098 }], ['visualize', { width: 4096, height: 4096 }], ['visualize', { fps: 61 }], ['visualize', { fps: 1.5 }],
    ['normalize', { loudness: -71 }], ['normalize', { loudness: -4 }], ['normalize', { truePeak: 1 }], ['normalize', { truePeak: -10 }], ['normalize', { loudnessRange: 0 }], ['normalize', { loudnessRange: 51 }],
    ['speed', { factor: 0.24 }], ['speed', { factor: 4.01 }], ['snapshot', { time: -1 }], ['snapshot', { time: 604801 }], ['channels', { channels: 0 }], ['channels', { channels: 3 }], ['channels', { channels: 1.5 }],
    ['mute', { quality: 101 }], ['normalize', { bitrate: 513 }], ['normalize', { bitrate: 128.5 }],
  ];
  for (const [operation, options] of cases) assert.throws(() => argsFor(operation, options));
});

test('only supported categories, output formats and local independent paths are accepted', () => {
  for (const operation of Object.keys(formats)) {
    const job = makeJob(operation);
    for (const badPath of ['', ' ', '\0bad', 'bad\npath', 'https://example.com/file', 'file:/tmp/input', 'pipe:0', 'concat:a|b']) {
      assert.throws(() => mediaOperationArgs(job, badPath, output), /local file path/);
      assert.throws(() => mediaOperationArgs(job, job.input, badPath), /local file path/);
      assert.throws(() => mediaOperationArgs({ ...job, input: badPath }, job.input, output), /local file path/);
    }
    assert.throws(() => mediaOperationArgs(job, job.input, job.input), /differ/);
    assert.throws(() => mediaOperationArgs(job, output, output), /differ/);
    assert.throws(() => mediaOperationArgs({ ...job, input: 'playlist.m3u8' }, input, output), /Unsupported media input/);
    assert.throws(() => mediaOperationArgs({ ...job, input: audioOperations.includes(operation) ? videoInput : input }, input, output), /Unsupported .* input/);
    for (const format of ['gif', '__proto__', 'constructor', 'mp4;movie=bad', audioOperations.includes(operation) && operation !== 'visualize' ? 'mp4' : 'wav']) {
      assert.throws(() => argsFor(operation, {}, format), /output/);
    }
  }
});

test('unrelated engine options cannot add paths, arbitrary filters or extra inputs', () => {
  for (const operation of Object.keys(formats)) {
    assert.deepEqual(argsFor(operation, { outputFolder: '/secret', inputs: ['/secret'], filter: 'movie=/secret', filter_complex: 'amovie=/secret', filename: 'https://example.com', autoOrient: true }), argsFor(operation));
  }
  assert.ok(Object.isFrozen(requiredFilters));
  assert.ok(Object.values(requiredFilters).every(Object.isFrozen));
});

async function run(command, args, options = {}) {
  return execute(command, args, { timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, ...options });
}

async function inspect(filename) {
  const { stdout } = await run(ffprobe, ['-v', 'error', ...(filename.endsWith('.png') ? ['-f', 'png_pipe'] : []), '-show_streams', '-show_format', '-show_data_hash', 'sha256', '-of', 'json', filename]);
  return JSON.parse(stdout);
}

test('installed FFmpeg executes media operations with verifiable outputs', { timeout: 120000 }, async context => {
  if (spawnSync(ffmpeg, ['-version'], { timeout: 5000 }).status !== 0 || spawnSync(ffprobe, ['-version'], { timeout: 5000 }).status !== 0) return context.skip('FFmpeg/ffprobe unavailable');
  const { stdout: encoderList } = await run(ffmpeg, ['-hide_banner', '-encoders']);
  const { stdout: filterList } = await run(ffmpeg, ['-hide_banner', '-filters']);
  const hasEncoder = encoder => new RegExp(`\\b${encoder}\\b`).test(encoderList);
  const hasFilters = operation => requiredFilters[operation].every(filter => new RegExp(`\\b${filter}\\b`).test(filterList));
  const root = await mkdtemp(path.join(os.tmpdir(), 'santara-media-test-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const tone = path.join(root, 'tone.wav');
  await run(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4', '-ac', '2', '-c:a', 'pcm_s16le', '-metadata', 'title=Santara media test', tone]);
  const convert = async (operation, source, target, options = {}, format = formats[operation]) => {
    await run(ffmpeg, mediaOperationArgs({ operation, input: source, options, format }, source, target));
    return inspect(target);
  };
  const merge = async (sources, format, options = {}) => {
    const manifest = path.join(root, `merge-${format}-${options.reencode === false ? 'copy' : 'encode'}.ffconcat`);
    const safeNames = sources.map((source, index) => `merge-${index}${path.extname(source)}`);
    for (const [index, source] of sources.entries()) await copyFile(source, path.join(root, safeNames[index]));
    await writeFile(manifest, `ffconcat version 1.0\n${safeNames.map(name => `file '${name}'`).join('\n')}\n`);
    const metadata = await Promise.all(safeNames.map(name => inspect(path.join(root, name))));
    const target = `${manifest}.${format}`;
    const args = mediaMergeArgs({ operation: 'merge', input: sources[0], format, options }, manifest, target, metadata);
    await run(ffmpeg, args);
    return { target, info: await inspect(target), args };
  };

  await context.test('split accurately trims audio and can reencode to another audio format', async () => {
    const target = path.join(root, 'audio-segment.wav');
    const info = await convert('split', tone, target, { start: '0.375', duration: '0.625' }, 'wav');
    assert.equal(info.streams.length, 1);
    assert.ok(Math.abs(Number(info.format.duration) - 0.625) < 0.01);
    if (hasEncoder('libmp3lame')) {
      const compressed = await convert('split', tone, path.join(root, 'audio-segment.mp3'), { start: 0.5, duration: 1 }, 'mp3');
      assert.equal(compressed.streams[0].codec_name, 'mp3');
      assert.ok(Math.abs(Number(compressed.format.duration) - 1) < 0.1);
    }
  });

  await context.test('merge preserves sample order and samples when copying compatible WAV inputs', async () => {
    const second = path.join(root, 'other-tone.wav');
    await run(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=1', '-ac', '2', '-c:a', 'pcm_s16le', second]);
    const { target, info } = await merge([tone, second], 'wav', { reencode: false });
    assert.equal(info.streams[0].codec_name, 'pcm_s16le');
    assert.ok(Math.abs(Number(info.format.duration) - 5) < 0.01);
    const decode = async filename => (await run(ffmpeg, ['-v', 'error', '-i', filename, '-map', '0:a:0', '-f', 's16le', '-c:a', 'pcm_s16le', 'pipe:1'], { encoding: 'buffer' })).stdout;
    assert.deepEqual(await decode(target), Buffer.concat([await decode(tone), await decode(second)]));
  });

  await context.test('merge defaults to reencoding into the requested audio codec', async child => {
    if (!hasEncoder('libmp3lame')) return child.skip('MP3 encoder unavailable');
    const { info } = await merge([tone, tone], 'mp3');
    assert.equal(info.streams[0].codec_name, 'mp3');
    assert.ok(Math.abs(Number(info.format.duration) - 8) < 0.15);
  });

  await context.test('safe concat rejects traversal and protocol filenames even with compatible metadata', async () => {
    for (const filename of ['../tone.wav', 'file:tone.wav', 'https://example.invalid/audio.wav']) {
      const manifest = path.join(root, 'unsafe.ffconcat');
      await writeFile(manifest, `file '${filename}'\nfile 'tone.wav'\n`);
      const metadata = await inspect(tone);
      const args = mediaMergeArgs({ operation: 'merge', input: tone, format: 'wav' }, manifest, path.join(root, 'unsafe-output.wav'), [metadata, metadata]);
      await assert.rejects(run(ffmpeg, args), /Unsafe file name|Protocol|Invalid/);
    }
  });

  await context.test('normalize reaches its loudness target without retaining 192kHz output', async child => {
    if (!hasFilters('normalize')) return child.skip('Normalization filters unavailable');
    const target = path.join(root, 'normalized.wav');
    const info = await convert('normalize', tone, target);
    assert.equal(info.streams.length, 1);
    assert.equal(info.streams[0].sample_rate, '48000');
    assert.equal(info.format.tags.title, 'Santara media test');
    const { stderr } = await run(ffmpeg, ['-nostdin', '-hide_banner', '-i', target, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']);
    const measurements = JSON.parse(stderr.match(/\{\s*"input_i"[\s\S]*?\}/)[0]);
    assert.ok(Math.abs(Number(measurements.input_i) + 16) < 1, stderr);
    assert.ok(Number(measurements.input_tp) <= -1.2, stderr);
    await convert('normalize', tone, path.join(root, 'stripped.wav'), { stripMetadata: true });
    assert.equal((await inspect(path.join(root, 'stripped.wav'))).format.tags?.title, undefined);
  });

  await context.test('channels downmixes stereo and upmixes mono', async child => {
    if (!hasFilters('channels')) return child.skip('Resampling filter unavailable');
    const mono = path.join(root, 'mono.wav');
    assert.equal((await convert('channels', tone, mono, { channels: '1' })).streams[0].channels, 1);
    assert.equal((await convert('channels', mono, path.join(root, 'stereo.wav'), { channels: 2 })).streams[0].channels, 2);
  });

  await context.test('audio output formats encode successfully with normalization sample rates', async child => {
    if (!hasFilters('normalize')) return child.skip('Normalization filters unavailable');
    for (const [format, encoder] of Object.entries({ mp3: 'libmp3lame', flac: 'flac', ogg: 'libvorbis', opus: 'libopus', m4a: 'aac', aiff: 'pcm_s16be', wma: 'wmav2' })) {
      if (!hasEncoder(encoder)) continue;
      const info = await convert('normalize', tone, path.join(root, `normalized.${format}`), {}, format);
      assert.equal(info.streams[0].codec_type, 'audio', format);
    }
  });

  await context.test('visualize produces a finite MP4 with the requested solid background and waveform', async child => {
    if (!hasEncoder('libx264') || !hasEncoder('aac') || !hasFilters('visualize')) return child.skip('Waveform codecs/filters unavailable');
    const target = path.join(root, 'wave.mp4');
    const info = await convert('visualize', tone, target, { width: '160', height: '96', fps: '24', waveColor: '#ff0000', backgroundColor: '#123456', style: 'cline', quality: 95 });
    const video = info.streams.find(stream => stream.codec_type === 'video');
    assert.equal(video.codec_name, 'h264');
    assert.equal(video.width, 160);
    assert.equal(video.height, 96);
    assert.equal(info.streams.find(stream => stream.codec_type === 'audio').codec_name, 'aac');
    assert.ok(Math.abs(Number(info.format.duration) - 4) < 0.25, info.format.duration);
    const { stdout: pixels } = await run(ffmpeg, ['-v', 'error', '-ss', '0.5', '-i', target, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer' });
    assert.ok(Math.abs(pixels[0] - 18) < 12 && Math.abs(pixels[1] - 52) < 12 && Math.abs(pixels[2] - 86) < 12, `background pixel ${[...pixels.subarray(0, 3)]}`);
    let redPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 3) if (pixels[offset] > pixels[offset + 1] + 50 && pixels[offset] > pixels[offset + 2] + 50) redPixels++;
    assert.ok(redPixels > 20, `Only ${redPixels} waveform pixels`);
  });

  if (!hasEncoder('libx264') || !hasEncoder('aac')) return;
  const movie = path.join(root, 'movie.mp4');
  const silent = path.join(root, 'silent.mp4');
  await run(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x48:r=24:d=2', '-i', tone, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-metadata', 'title=Original movie', movie]);
  await run(ffmpeg, ['-nostdin', '-v', 'error', '-i', movie, '-map', '0:v:0', '-c:v', 'copy', '-an', silent]);

  await context.test('split trims video at a nonkeyframe start and supports silent video', async () => {
    const info = await convert('split', movie, path.join(root, 'video-segment.mp4'), { start: 0.375, duration: 0.625 }, 'mp4');
    assert.equal(info.streams.find(stream => stream.codec_type === 'video').codec_name, 'h264');
    assert.ok(info.streams.some(stream => stream.codec_type === 'audio'));
    assert.ok(Math.abs(Number(info.format.duration) - 0.625) < 0.1);
    const withoutAudio = await convert('split', silent, path.join(root, 'silent-segment.mp4'), { start: 0.5, duration: 1 }, 'mp4');
    assert.deepEqual(withoutAudio.streams.map(stream => stream.codec_type), ['video']);
    if (hasEncoder('libvpx-vp9') && hasEncoder('libopus')) {
      const webm = await convert('split', movie, path.join(root, 'video-segment.webm'), { start: 0.5, duration: 1 }, 'webm');
      assert.equal(webm.streams.find(stream => stream.codec_type === 'video').codec_name, 'vp9');
    }
  });

  await context.test('merge copies compatible H264/AAC and reencodes compatible silent video', async () => {
    const copied = await merge([movie, movie], 'mp4', { reencode: false });
    assert.deepEqual(copied.info.streams.map(stream => stream.codec_name), ['h264', 'aac']);
    assert.ok(Math.abs(Number(copied.info.format.duration) - 4) < 0.2);
    const encoded = await merge([silent, silent], 'mp4');
    assert.deepEqual(encoded.info.streams.map(stream => stream.codec_type), ['video']);
    assert.ok(Math.abs(Number(encoded.info.format.duration) - 4) < 0.15);
    if (hasEncoder('libvpx-vp9') && hasEncoder('libopus')) {
      const webm = await merge([movie, movie], 'webm');
      assert.deepEqual(webm.info.streams.map(stream => stream.codec_name), ['vp9', 'opus']);
    }
  });

  await context.test('mute removes audio while preserving video duration', async () => {
    const info = await convert('mute', movie, path.join(root, 'muted.mp4'));
    assert.deepEqual(info.streams.map(stream => stream.codec_type), ['video']);
    assert.ok(Math.abs(Number(info.format.duration) - 2) < 0.15);
    assert.equal(info.format.tags.title, 'Original movie');
    assert.equal((await convert('mute', silent, path.join(root, 'muted-silent.mp4'))).streams.length, 1);
  });

  await context.test('speed changes audio and video durations together, including silent inputs', async child => {
    if (!hasFilters('speed')) return child.skip('Speed filters unavailable');
    for (const factor of [0.25, 0.5, 1.5, 2, 4]) {
      const info = await convert('speed', movie, path.join(root, `speed-${factor}.mp4`), { factor: String(factor) });
      const expected = 2 / factor;
      for (const stream of info.streams) assert.ok(Math.abs(Number(stream.duration) - expected) < Math.max(0.2, expected * 0.05), `${factor}x ${stream.codec_type}: ${stream.duration}, expected ${expected}`);
    }
    const info = await convert('speed', silent, path.join(root, 'speed-silent.mp4'), { factor: 2 });
    assert.deepEqual(info.streams.map(stream => stream.codec_type), ['video']);
    assert.ok(Math.abs(Number(info.format.duration) - 1) < 0.2);
  });

  await context.test('snapshot creates exactly one PNG with literal percent characters in the filename', async child => {
    if (!hasEncoder('png')) return child.skip('PNG encoder unavailable');
    const target = path.join(root, 'snapshot-%03d.png');
    const before = await readdir(root);
    const info = await convert('snapshot', movie, target, { time: '0.5' });
    assert.equal(info.streams[0].codec_name, 'png');
    assert.equal(info.streams[0].width, 64);
    assert.equal(info.streams[0].height, 48);
    assert.deepEqual((await readFile(target)).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.deepEqual((await readdir(root)).filter(filename => !before.includes(filename)), [path.basename(target)]);
  });

  await context.test('redaction writes solid masks only during the selected time range', async child => {
    if (!hasFilters('redact')) return child.skip('drawbox filter unavailable');
    const target = path.join(root, 'redacted.mp4');
    const args = mediaOperationArgs({ operation: 'redact', input: movie, format: 'mp4', options: { masks: [{ x: 16, y: 12, width: 20, height: 20, start: 0.5, end: 1.25, color: '#000000' }] } }, movie, target, { width: 64, height: 48 });
    await run(ffmpeg, args);
    const sample = async time => (await run(ffmpeg, ['-v', 'error', '-ss', String(time), '-i', target, '-vf', 'crop=2:2:24:20', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer' })).stdout.subarray(0, 3);
    const before = await sample(0.25), inside = await sample(0.75), after = await sample(1.5);
    assert.ok(before[2] > 150 && before[0] < 80, `Expected original blue before mask: ${[...before]}`);
    assert.ok(inside.every(channel => channel < 35), `Expected black mask during range: ${[...inside]}`);
    assert.ok(after[2] > 150 && after[0] < 80, `Expected original blue after mask: ${[...after]}`);
  });

  await context.test('FFmpeg refuses an existing output without replacing its contents', async () => {
    for (const operation of Object.keys(formats)) {
      if (!hasFilters(operation) || (operation === 'snapshot' && !hasEncoder('png'))) continue;
      const source = audioOperations.includes(operation) ? tone : movie;
      const target = path.join(root, `existing-${operation}.${formats[operation]}`);
      await writeFile(target, 'existing output');
      await run(ffmpeg, mediaOperationArgs({ operation, input: source, options: {}, format: formats[operation] }, source, target)).catch(error => assert.ok(error.code));
      assert.equal(await readFile(target, 'utf8'), 'existing output', operation);
    }
  });
});
