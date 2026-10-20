import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { createPreviewService } from '../electron/previews.mjs';

const exec = promisify(execFile);

function wav({ seconds = 1, sampleRate = 8000 } = {}) {
  const samples = seconds * sampleRate;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let sample = Math.floor(samples / 2); sample < samples; sample++) bytes.writeInt16LE(sample % 2 ? 16384 : -16384, 44 + sample * 2);
  return bytes;
}

async function fixture(context, backends = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'santara-previews-test-'));
  const input = path.join(root, 'input.wav');
  const bytes = wav();
  await fs.writeFile(input, bytes);
  const allowed = new Set([input]);
  const service = createPreviewService({ backends, allowed });
  context.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, input, bytes, allowed, service };
}

async function installed(context, name) {
  try {
    await exec(name, [name === 'pdftoppm' ? '-v' : '-version'], { timeout: 3000, maxBuffer: 1024 * 1024, shell: false });
    return { available: true, path: name };
  } catch { context.skip(`${name} unavailable`); return null; }
}

function pngBytes(result) {
  assert.match(result.url, /^data:image\/png;base64,/);
  return Buffer.from(result.url.split(',')[1], 'base64');
}

function pdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 50] /Contents 4 0 R >>',
    '<< /Length 27 >>\nstream\n1 0 0 rg 0 0 100 50 re f\nendstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 50] /Contents 6 0 R >>',
    '<< /Length 27 >>\nstream\n0 0 1 rg 0 0 100 50 re f\nendstream',
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(document);
  document += `xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return document;
}

async function fakeBackend(context, root, source) {
  if (process.platform === 'win32') { context.skip('Executable script fixture requires POSIX'); return null; }
  const executable = path.join(root, 'backend');
  await fs.writeFile(executable, `#!${process.execPath}\n${source}\n`, { mode: 0o700 });
  return { available: true, path: executable };
}

test('prepares opaque UUID URLs and streams exact bytes with safe response headers', async context => {
  const { service, input, bytes } = await fixture(context);
  const result = await service.prepare(input);
  assert.match(result.url, /^santara-media:\/\/preview\/[\da-f-]{36}$/);
  assert.ok(!result.url.includes(input));
  assert.deepEqual(Object.keys(result), ['url']);
  const response = await service.respond(new Request(result.url));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/wav');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('content-length'), String(bytes.length));
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /sandbox/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});

test('invalid tokens, arbitrary paths, authorities, queries and non-media schemes fail closed', async context => {
  const { service, input } = await fixture(context);
  const { url } = await service.prepare(input);
  for (const candidate of [
    `santara-media://preview/${randomUUID()}`, 'santara-media://preview/not-a-token',
    'santara-media://preview/etc/passwd', `santara-media://preview/${encodeURIComponent(input)}`,
    url.replace('preview/', 'elsewhere/'), url.replace('preview/', 'preview:42/'),
    `${url}?path=${input}`, `${url}#fragment`, `${url}/more`,
    url.replace('santara-media:', 'https:'), `file://${input}`,
  ]) assert.equal((await service.respond(new Request(candidate))).status, 404, candidate);
  assert.throws(() => new Request(url.replace('preview/', 'user@preview/')), /credentials/);
  assert.equal((await service.respond(new Request(url, { method: 'POST' }))).status, 405);
  const head = await service.respond(new Request(url, { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('content-length'), '16044');
});

test('only inspected absolute local regular files may be prepared', async context => {
  const { service, input, root, allowed } = await fixture(context);
  assert.throws(() => createPreviewService({ allowed: [] }), /Set/);
  for (const candidate of ['input.wav', 'https://example.com/test.wav', null, `${input}\0`]) await assert.rejects(service.prepare(candidate), /absolute local path/);
  const unknown = path.join(root, 'unknown.wav');
  await fs.copyFile(input, unknown);
  await assert.rejects(service.prepare(unknown), /inspect/);
  const directory = path.join(root, 'directory.wav');
  await fs.mkdir(directory);
  allowed.add(directory);
  await assert.rejects(service.prepare(directory), /regular file/);
  const network = `/${input}`;
  allowed.add(network);
  await assert.rejects(service.prepare(network), /Network paths/);
});

test('rejects leaf and ancestor symlinks both when preparing and responding', async context => {
  if (process.platform === 'win32') return context.skip('Symlink fixture requires POSIX');
  const { service, input, root, allowed } = await fixture(context);
  const link = path.join(root, 'link.wav');
  await fs.symlink(input, link);
  allowed.add(link);
  await assert.rejects(service.prepare(link), /[Ss]ymbolic links/);
  const directoryLink = path.join(root, 'linked');
  await fs.symlink(root, directoryLink, 'dir');
  const throughLink = path.join(directoryLink, 'input.wav');
  allowed.add(throughLink);
  await assert.rejects(service.prepare(throughLink), /symbolic links/);
  const { url } = await service.prepare(input);
  const replacement = path.join(root, 'replacement.wav');
  await fs.rename(input, replacement);
  await fs.symlink(replacement, input);
  assert.equal((await service.respond(new Request(url))).status, 403);
  assert.equal((await service.respond(new Request(url))).status, 404);
});

test('tokens cannot read a replaced file or a revoked allowed path', async context => {
  const { service, input, root, bytes, allowed } = await fixture(context);
  const revoked = await service.prepare(input);
  allowed.delete(input);
  assert.equal((await service.respond(new Request(revoked.url))).status, 403);
  allowed.add(input);
  const replaced = await service.prepare(input);
  await fs.rename(input, path.join(root, 'original.wav'));
  await fs.writeFile(input, bytes);
  assert.equal((await service.respond(new Request(replaced.url))).status, 403);
});

test('respond rejects an ancestor replaced by a symlink after preparation', async context => {
  if (process.platform === 'win32') return context.skip('Symlink fixture requires POSIX');
  const { service, root, allowed } = await fixture(context);
  const directory = path.join(root, 'folder');
  const moved = path.join(root, 'moved');
  const input = path.join(directory, 'track.wav');
  await fs.mkdir(directory);
  await fs.writeFile(input, wav());
  allowed.add(input);
  const { url } = await service.prepare(input);
  await fs.rename(directory, moved);
  await fs.symlink(moved, directory, 'dir');
  assert.equal((await service.respond(new Request(url))).status, 403);
});

test('handles closed, open-ended, suffix, clamped, and HEAD byte ranges', async context => {
  const { service, input, bytes } = await fixture(context);
  const { url } = await service.prepare(input);
  for (const [range, start, end] of [
    ['bytes=0-0', 0, 0], ['bytes=8-11', 8, 11], ['bytes=16040-', 16040, 16043],
    ['bytes=-4', 16040, 16043], ['bytes=16040-999999', 16040, 16043], ['bytes=-999999', 0, 16043],
  ]) {
    const response = await service.respond(new Request(url, { headers: { Range: range } }));
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`);
    assert.equal(response.headers.get('content-length'), String(end - start + 1));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1));
  }
  const head = await service.respond(new Request(url, { method: 'HEAD', headers: { Range: 'bytes=2-8' } }));
  assert.equal(head.status, 206);
  assert.equal(head.headers.get('content-length'), '7');
  assert.equal(await head.text(), '');
});

test('rejects malformed, multiple, unsafe, reversed and unsatisfiable ranges', async context => {
  const { service, input, bytes } = await fixture(context);
  const { url } = await service.prepare(input);
  for (const range of ['bytes=16044-', 'bytes=999999-9999999', 'bytes=5-4', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'items=0-1', 'bytes=NaN-4', 'bytes=0.5-4', 'bytes=+1-4', 'bytes=9007199254740992-', 'bytes=-9007199254740992', 'bytes=1-9007199254740992']) {
    const response = await service.respond(new Request(url, { headers: { Range: range } }));
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('content-range'), `bytes */${bytes.length}`);
    assert.equal(await response.text(), '');
  }
});

test('expires tokens after ten minutes and evicts the oldest above 32', async context => {
  const { service, input } = await fixture(context);
  context.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const urls = [];
  for (let index = 0; index < 33; index++) urls.push((await service.prepare(input)).url);
  assert.equal((await service.respond(new Request(urls[0]))).status, 404);
  assert.equal((await service.respond(new Request(urls[1], { method: 'HEAD' }))).status, 200);
  context.mock.timers.tick(10 * 60 * 1000);
  assert.equal((await service.respond(new Request(urls[32]))).status, 404);
});

test('rejects active content, extension spoofing and oversized regular files', async context => {
  const { service, root, allowed } = await fixture(context);
  for (const extension of ['svg', 'html', 'm3u8', 'mpd', 'png', 'mp3', 'pdf', 'aiff', 'aif', 'wma']) {
    const input = path.join(root, `unsafe.${extension}`);
    await fs.writeFile(input, '<svg><image href="https://example.com/private"/></svg>');
    allowed.add(input);
    await assert.rejects(service.prepare(input), /Preview supports|signature.*HTML.*SVG/);
  }
  for (const [extension, size] of [['wav', 2 * 1024 * 1024 * 1024 + 1], ['png', 128 * 1024 * 1024 + 1]]) {
    const input = path.join(root, `large.${extension}`);
    const handle = await fs.open(input, 'w');
    await handle.truncate(size);
    await handle.close();
    allowed.add(input);
    await assert.rejects(service.prepare(input), /exceeds.*MiB/);
  }
});

test('images produce bounded first-frame PNG thumbnails with orientation and stripped metadata', async context => {
  const { service, root, allowed } = await fixture(context);
  const input = path.join(root, 'photo.jpg');
  await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#ff0000' } }).withMetadata({ orientation: 6 }).jpeg().toFile(input);
  allowed.add(input);
  const result = await service.prepare(input);
  assert.equal(result.width, 1000);
  assert.equal(result.height, 2000);
  assert.equal(result.previewWidth, 700);
  assert.equal(result.previewHeight, 1400);
  const metadata = await sharp(pngBytes(result)).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 700);
  assert.equal(metadata.height, 1400);
  assert.equal(metadata.exif, undefined);
  const animated = path.join(root, 'animated.webp');
  const pixels = Buffer.from([...Array(4).fill([255, 0, 0]).flat(), ...Array(4).fill([0, 0, 255]).flat()]);
  await sharp(pixels, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ lossless: true, delay: [100, 100] }).toFile(animated);
  allowed.add(animated);
  const firstFrame = await service.prepare(animated);
  assert.equal(firstFrame.width, 2);
  assert.equal(firstFrame.height, 2);
  assert.deepEqual([...await sharp(pngBytes(firstFrame)).raw().toBuffer()].slice(0, 3), [255, 0, 0]);
});

test('large image source crop coordinates retain original dimensions for every EXIF axis swap', async context => {
  const { service, root, allowed } = await fixture(context);
  for (const orientation of [1, 5, 6, 7, 8]) {
    const input = path.join(root, `large-${orientation}.jpg`);
    await sharp({ create: { width: 3200, height: 1800, channels: 3, background: 'orange' } }).withMetadata({ orientation }).jpeg().toFile(input);
    allowed.add(input);
    const result = await service.prepare(input);
    assert.equal(result.width, orientation === 1 ? 3200 : 1800);
    assert.equal(result.height, orientation === 1 ? 1800 : 3200);
    const metadata = await sharp(pngBytes(result)).metadata();
    assert.equal(result.previewWidth, metadata.width);
    assert.equal(result.previewHeight, metadata.height);
    assert.ok(metadata.width <= 1400 && metadata.height <= 1400);
    assert.ok(result.width > metadata.width && result.height > metadata.height);
  }
});

test('oversized image dimensions fail before decoding or publishing a preview', async context => {
  const { service, root, allowed } = await fixture(context);
  const input = path.join(root, 'oversized.jpg');
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).jpeg().toBuffer();
  const marker = bytes.indexOf(Buffer.from([255, 192]));
  assert.ok(marker >= 0);
  bytes.writeUInt16BE(10000, marker + 5);
  bytes.writeUInt16BE(5000, marker + 7);
  await fs.writeFile(input, bytes);
  allowed.add(input);
  await assert.rejects(service.prepare(input), /pixel limit|megapixel/i);
});

test('missing PDF backend returns actionable guidance', async context => {
  const { service, root, allowed } = await fixture(context);
  const input = path.join(root, 'input.pdf');
  await fs.writeFile(input, pdf());
  allowed.add(input);
  await assert.rejects(service.prepare(input), /Poppler.*pdftoppm.*Install.*Open or Reveal/);
});

test('installed Poppler renders only the first PDF page as a bounded PNG', async context => {
  const poppler = await installed(context, 'pdftoppm');
  if (!poppler) return;
  const { service, root, allowed } = await fixture(context, { poppler });
  const input = path.join(root, 'two pages;$(never-execute).pdf');
  await fs.writeFile(input, pdf());
  allowed.add(input);
  const result = await service.prepare(input);
  assert.equal(result.width, 1400);
  assert.equal(result.height, 700);
  const pixels = await sharp(pngBytes(result)).removeAlpha().raw().toBuffer();
  assert.ok(pixels[0] > 240);
  assert.ok(pixels[1] < 15);
  assert.ok(pixels[2] < 15);
});

test('installed ffprobe and FFmpeg return actual silent and audible waveform bins', async context => {
  const ffmpeg = await installed(context, 'ffmpeg');
  const ffprobe = await installed(context, 'ffprobe');
  if (!ffmpeg || !ffprobe) return;
  const { service, input } = await fixture(context, { ffmpeg, ffprobe });
  const result = await service.prepare(input);
  assert.equal(result.duration, 1);
  assert.equal(result.waveform.length, 200);
  assert.equal(result.waveformDuration, 1);
  assert.ok(result.waveform.slice(0, 100).every(value => value === 0));
  assert.ok(result.waveform.slice(100).every(value => value === 0.5));
  const response = await service.respond(new Request(result.url, { headers: { Range: 'bytes=0-3' } }));
  assert.equal(await response.text(), 'RIFF');
});

test('waveform decoding is bounded to the first ten minutes', async context => {
  const ffmpeg = await installed(context, 'ffmpeg');
  if (!ffmpeg) return;
  const { service, input } = await fixture(context, { ffmpeg });
  const bytes = wav({ seconds: 601 });
  bytes.fill(0, 44);
  for (let sample = 600 * 8000; sample < 601 * 8000; sample++) bytes.writeInt16LE(30000, 44 + sample * 2);
  await fs.writeFile(input, bytes);
  const result = await service.prepare(input);
  assert.equal(result.waveform.length, 200);
  assert.equal(result.waveformDuration, 600);
  assert.ok(result.waveform.every(value => value === 0));
});

test('AIFF, AIF, AIFF-C and WMA inputs have checked signatures, real waveforms and safe media types', async context => {
  const ffmpeg = await installed(context, 'ffmpeg');
  const ffprobe = await installed(context, 'ffprobe');
  if (!ffmpeg || !ffprobe) return;
  const { service, input, root, allowed } = await fixture(context, { ffmpeg, ffprobe });
  for (const [name, codec, format, type] of [
    ['track.aiff', 'pcm_s16be', 'aiff', 'audio/aiff'],
    ['track.aif', 'pcm_s16be', 'aiff', 'audio/aiff'],
    ['compressed.aiff', 'pcm_s16le', 'aiff', 'audio/aiff'],
    ['track.wma', 'wmav2', 'asf', 'audio/x-ms-wma'],
  ]) {
    const output = path.join(root, name);
    await exec('ffmpeg', ['-nostdin', '-v', 'error', '-i', input, '-c:a', codec, '-f', format, output], { timeout: 10000, shell: false });
    allowed.add(output);
    if (name === 'compressed.aiff') assert.equal((await fs.readFile(output)).toString('latin1', 8, 12), 'AIFC');
    const result = await service.prepare(output);
    assert.ok(result.duration > 0);
    assert.equal(result.waveform.length, 200);
    assert.ok(result.waveform.some(value => value > 0));
    assert.equal(result.waveformDuration, Math.min(result.duration, 600));
    const response = await service.respond(new Request(result.url, { method: 'HEAD' }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), type);
  }
});

test('native Electron cross-origin fetch and decodeAudioData work without FFmpeg', { skip: process.env.SANTARA_PREVIEW_NATIVE !== '1' }, async context => {
  const { root, input } = await fixture(context);
  const { default: electron } = await import('electron');
  const script = path.join(root, 'native-preview.mjs');
  const serviceModule = new URL('../electron/previews.mjs', import.meta.url).href;
  const electronModule = new URL('../node_modules/electron/index.js', import.meta.url).href;
  await fs.writeFile(script, `
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(electronModule)});
const { app, BrowserWindow, protocol } = require('electron');
import { createPreviewService } from ${JSON.stringify(serviceModule)};
app.setPath('userData', ${JSON.stringify(path.join(root, 'native-profile'))});
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{ scheme: 'santara-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const service = createPreviewService({ backends: {}, allowed: new Set([${JSON.stringify(input)}]) });
void (async () => {
try {
  await app.whenReady();
  protocol.handle('santara-media', request => service.respond(request));
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  protocol.handle('http', () => new Response('<title>Local preview CORS check</title>', { headers: { 'Content-Type': 'text/html' } }));
  await window.loadURL('http://127.0.0.1/');
  const { url } = await service.prepare(${JSON.stringify(input)});
  const result = await window.webContents.executeJavaScript('(' + (async function(url) {
      try {
        const response = await fetch(url);
        const bytes = await response.arrayBuffer();
        const audio = new OfflineAudioContext(1, 1, 8000);
        const decoded = await audio.decodeAudioData(bytes);
        return { ok: true, duration: decoded.duration, origin: location.origin, allowOrigin: response.headers.get('Access-Control-Allow-Origin') };
      } catch (error) { return { ok: false, error: error.message }; }
    }).toString() + ')(' + JSON.stringify(url) + ')');
  console.log('PREVIEW_NATIVE_RESULT=' + JSON.stringify(result));
  window.destroy();
  await service.close();
  app.exit(0);
} catch (error) { console.error(error); await service.close(); app.exit(1); }
})();
`);
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const { stdout } = await exec(electron, [script], { timeout: 20000, maxBuffer: 2 * 1024 * 1024, shell: false, env: environment }).catch(error => {
    throw new Error(`Native preview check failed: ${error.message}\n${error.stdout || ''}`, { cause: error });
  });
  const line = stdout.split('\n').find(value => value.startsWith('PREVIEW_NATIVE_RESULT='));
  assert.ok(line, stdout);
  const result = JSON.parse(line.slice('PREVIEW_NATIVE_RESULT='.length));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.origin, 'http://127.0.0.1');
  assert.equal(result.allowOrigin, null);
  assert.equal(result.duration, 1);
});

test('installed video backend returns dimensions and duration without inventing an audio waveform', async context => {
  const ffmpeg = await installed(context, 'ffmpeg');
  const ffprobe = await installed(context, 'ffprobe');
  if (!ffmpeg || !ffprobe) return;
  const { service, root, allowed } = await fixture(context, { ffmpeg, ffprobe });
  const input = path.join(root, 'video.webm');
  await exec('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x48:d=0.5', '-c:v', 'libvpx', '-threads', '1', input], { timeout: 10000, shell: false });
  allowed.add(input);
  const result = await service.prepare(input);
  assert.equal(result.width, 64);
  assert.equal(result.height, 48);
  assert.ok(result.duration > 0);
  assert.equal(result.waveform, undefined);
});

test('MP4 probing and waveform extraction work with the restricted MOV demuxer', async context => {
  const ffmpeg = await installed(context, 'ffmpeg');
  const ffprobe = await installed(context, 'ffprobe');
  if (!ffmpeg || !ffprobe) return;
  const { service, root, allowed } = await fixture(context, { ffmpeg, ffprobe });
  const input = path.join(root, 'video.mp4');
  await exec('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x48:d=0.5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-c:v', 'mpeg4', '-c:a', 'aac', '-threads', '1', '-shortest', input], { timeout: 10000, shell: false });
  allowed.add(input);
  const result = await service.prepare(input);
  assert.equal(result.width, 64);
  assert.equal(result.height, 48);
  assert.ok(result.duration > 0);
  assert.equal(result.waveform.length, 200);
  assert.ok(result.waveform.some(value => value > 0));
  const response = await service.respond(new Request(result.url, { method: 'HEAD' }));
  assert.equal(response.headers.get('content-type'), 'video/mp4');
});

test('subprocesses receive private snapshots, file-only input protocols and explicit demuxers', async context => {
  const { service, input, root, allowed } = await fixture(context);
  await service.close();
  const log = path.join(root, 'arguments.json');
  const ffprobe = await fakeBackend(context, root, `const fs = require('node:fs'); const args = process.argv.slice(2); fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args, cwd: process.cwd() })); console.log(JSON.stringify({ format: { duration: '2' }, streams: [{ codec_type: 'audio' }] }));`);
  if (!ffprobe) return;
  const checked = createPreviewService({ backends: { ffprobe }, allowed });
  context.after(() => checked.close());
  const result = await checked.prepare(input);
  assert.equal(result.duration, 2);
  const { args, cwd } = JSON.parse(await fs.readFile(log, 'utf8'));
  assert.equal(args[args.indexOf('-protocol_whitelist') + 1], 'file');
  assert.equal(args[args.indexOf('-format_whitelist') + 1], 'wav');
  assert.equal(args[args.indexOf('-f') + 1], 'wav');
  assert.notEqual(args.at(-1), input);
  assert.equal(path.dirname(args.at(-1)), cwd);
  assert.match(path.basename(cwd), /^santara-preview-/);
  await assert.rejects(fs.stat(cwd), /ENOENT/);
});

test('close cancels subprocesses, removes temporary snapshots and invalidates streams and tokens', async context => {
  const { input, root, allowed, service } = await fixture(context);
  const { url } = await service.prepare(input);
  const response = await service.respond(new Request(url));
  await response.body.cancel();
  const ready = path.join(root, 'ready');
  const poppler = await fakeBackend(context, root, `require('node:fs').writeFileSync(${JSON.stringify(ready)}, process.cwd()); setInterval(() => {}, 1000);`);
  if (!poppler) return;
  const checked = createPreviewService({ backends: { poppler }, allowed });
  context.after(() => checked.close());
  const document = path.join(root, 'input.pdf');
  await fs.writeFile(document, pdf());
  allowed.add(document);
  const pending = checked.prepare(document);
  const rejected = assert.rejects(pending, /preview failed|closed/i);
  let temporary;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { temporary = await fs.readFile(ready, 'utf8'); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(temporary, 'backend must start before cancellation');
  await checked.close();
  await rejected;
  await assert.rejects(fs.stat(temporary), /ENOENT/);
  await service.close();
  await service.close();
  assert.equal((await service.respond(new Request(url))).status, 410);
  await assert.rejects(service.prepare(input), /closed/);
});

test('failed subprocesses clean up snapshots and return actionable errors', async context => {
  const { root, input, allowed } = await fixture(context);
  const log = path.join(root, 'failed-directory');
  const ffprobe = await fakeBackend(context, root, `require('node:fs').writeFileSync(${JSON.stringify(log)}, process.cwd()); process.exit(1);`);
  if (!ffprobe) return;
  const service = createPreviewService({ backends: { ffprobe }, allowed });
  context.after(() => service.close());
  await assert.rejects(service.prepare(input), /ffprobe preview failed.*Check.*Open or Reveal/);
  await assert.rejects(fs.stat(await fs.readFile(log, 'utf8')), /ENOENT/);
});

test('bounds concurrent preparations and closes an active response stream', async context => {
  const { service, input } = await fixture(context);
  const pending = Array.from({ length: 4 }, () => service.prepare(input));
  await assert.rejects(service.prepare(input), /Too many pending previews/);
  const prepared = await Promise.all(pending);
  await fs.writeFile(input, wav({ seconds: 100 }));
  const { url } = await service.prepare(input);
  const response = await service.respond(new Request(url));
  const reader = response.body.getReader();
  await reader.read();
  await service.close();
  await assert.rejects(async () => { while (!(await reader.read()).done) {} }, /closed|premature|aborted/i);
  assert.equal((await service.respond(new Request(prepared[0].url))).status, 410);
});
