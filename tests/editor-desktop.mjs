import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { _electron, expect } from '@playwright/test';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execute = promisify(execFile);
const temporary = await mkdtemp(path.join(os.tmpdir(), 'santara-editor-desktop-'));
const artifacts = process.env.SANTARA_EDITOR_SMOKE_ARTIFACTS
  ? path.resolve(process.env.SANTARA_EDITOR_SMOKE_ARTIFACTS)
  : await mkdtemp(path.join(os.tmpdir(), 'santara-editor-evidence-'));
const environment = { ...process.env, XDG_CONFIG_HOME: path.join(temporary, 'config'), XDG_CACHE_HOME: path.join(temporary, 'cache'), XDG_DATA_HOME: path.join(temporary, 'data'), DISPLAY: process.env.DISPLAY || ':0' };
delete environment.SANTARA_DEV_URL;
delete environment.VITE_DEV_SERVER_URL;
delete environment.ELECTRON_RUN_AS_NODE;
const report = { ok: false, command: 'node tests/editor-desktop.mjs', artifacts, checks: {}, screenshots: [], diagnostics: [] };
const originals = new Map();
let desktop;
let renderer;
let stage = 'setup';

function sourcePixel(column, row) {
  return [32 + column * 2, 40 + row * 2, (column * 3 + row * 5) % 256, 255];
}

async function imageFixture(filename, transparent = false) {
  const pixels = Buffer.alloc(96 * 64 * 4);
  for (let row = 0; row < 64; row++) {
    for (let column = 0; column < 96; column++) {
      const pixel = sourcePixel(column, row);
      if (transparent && (column < 8 || row < 8 || column >= 88 || row >= 56)) pixel[3] = 0;
      pixels.set(pixel, (row * 96 + column) * 4);
    }
  }
  await sharp(pixels, { raw: { width: 96, height: 64, channels: 4 } }).png().toFile(filename);
  originals.set(filename, await readFile(filename));
}

function toneFixture() {
  const rate = 8000;
  const samples = rate * 2;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let sample = 0; sample < samples; sample++) {
    const amplitude = sample < rate ? 0 : Math.round(Math.sin(sample / rate * 440 * Math.PI * 2) * 16000);
    bytes.writeInt16LE(amplitude, 44 + sample * 2);
  }
  return bytes;
}

async function screenshot(name) {
  const filename = path.join(artifacts, `${name}.png`);
  await renderer.screenshot({ path: filename, fullPage: true });
  report.screenshots.push(filename);
}

async function inspect(filename, category) {
  const files = await renderer.evaluate(filename => window.santara.inspectPaths([filename]), filename);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, filename);
  assert.equal(files[0].category, category);
  await expect(renderer.locator('.file-name').filter({ hasText: path.basename(filename) })).toBeVisible();
  return files[0];
}

async function toolsPicker(filename) {
  await renderer.getByRole('button', { name: 'Converter', exact: true }).click();
  await renderer.locator('.file-name').filter({ hasText: path.basename(filename) }).click();
  const picker = renderer.getByRole('dialog');
  await expect(picker).toBeVisible();
  await picker.getByRole('tab', { name: /^Tools/ }).click();
  await expect(picker.getByRole('tab', { name: /^Tools/ })).toHaveAttribute('aria-selected', 'true');
  return picker;
}

async function wheelItem(picker, label) {
  const item = picker.getByRole('menu', { name: 'Tools', exact: true }).getByRole('menuitem', { name: label });
  for (let page = 0; page < 10; page++) {
    if (await item.count()) return item;
    const next = picker.getByRole('button', { name: 'More operations', exact: true });
    assert.ok(await next.count() && await next.isEnabled(), `Missing tool wheel item: ${label}`);
    await next.click();
  }
  throw new Error(`Tool wheel pagination did not reach ${label}`);
}

async function openEditor(filename, label) {
  const picker = await toolsPicker(filename);
  const item = await wheelItem(picker, label);
  await item.focus();
  await renderer.keyboard.press('Home');
  await expect(picker.getByRole('menuitem').first()).toBeFocused();
  await renderer.keyboard.press('ArrowRight');
  const count = await picker.getByRole('menuitem').count();
  await expect(picker.getByRole('menuitem').nth(count > 1 ? 1 : 0)).toBeFocused();
  await item.click();
  const editor = renderer.getByRole('dialog');
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('tab', { name: /^Tools/ })).toHaveCount(0);
  return editor;
}

async function dragToEditor(filename, label) {
  await renderer.getByRole('button', { name: 'Converter', exact: true }).click();
  await renderer.locator('.file-name').filter({ hasText: path.basename(filename) }).click();
  await renderer.keyboard.press('Escape');
  await expect(renderer.getByRole('dialog')).toHaveCount(0);
  const transfer = await renderer.evaluateHandle(() => new DataTransfer());
  try {
    const row = renderer.locator('.file-row').filter({ hasText: path.basename(filename) });
    await row.dispatchEvent('dragstart', { dataTransfer: transfer, clientX: 700, clientY: 400 });
    await renderer.locator('.app').dispatchEvent('dragover', { dataTransfer: transfer, clientX: 700, clientY: 400, altKey: true });
    await renderer.locator('.app').dispatchEvent('dragover', { dataTransfer: transfer, clientX: 710, clientY: 420, altKey: false });
    const wheel = renderer.getByRole('menu', { name: 'Tools', exact: true });
    await expect(wheel).toBeVisible();
    const item = wheel.getByRole('menuitem', { name: label });
    await item.dispatchEvent('dragenter', { dataTransfer: transfer });
    await expect(item).toHaveClass(/chosen/);
    await screenshot('drag-tools-wheel');
    await item.dispatchEvent('drop', { dataTransfer: transfer, clientX: 710, clientY: 420 });
    await expect(renderer.locator('.drag-overlay')).toHaveCount(0);
    await expect(renderer.getByRole('dialog')).toBeVisible();
  } finally {
    await transfer.dispose();
  }
}

async function fill(editor, label, value) {
  const control = editor.getByLabel(label, { exact: true });
  await expect(control).toBeVisible();
  await control.fill(String(value));
}

async function exportJob(editor, input, operation, format) {
  const before = await renderer.evaluate(async () => (await window.santara.bootstrap()).jobs.map(job => job.id));
  await editor.getByRole('button', { name: /^Export/ }).click();
  let observed;
  await expect.poll(async () => {
    const snapshot = await renderer.evaluate(() => window.santara.bootstrap());
    observed = snapshot.jobs.find(job => !before.includes(job.id) && job.input === input && job.operation === operation && job.format === format);
    return observed && ['completed', 'failed', 'cancelled', 'skipped'].includes(observed.status);
  }, { timeout: 60000, message: `Wait for new ${operation} ${format} export` }).toBe(true);
  assert.equal(observed.status, 'completed', observed.error || JSON.stringify(observed));
  assert.notEqual(observed.output, input, 'Editor must export to a new file');
  assert.equal(path.dirname(observed.output), path.dirname(input));
  await expect(renderer.getByRole('dialog')).toHaveCount(0);
  return observed;
}

async function decodedImage(input, width, height) {
  const metadata = await sharp(input).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  return data;
}

async function checkOriginals() {
  for (const [filename, original] of originals) assert.deepEqual(await readFile(filename), original, `Original changed: ${filename}`);
}

try {
  await mkdir(artifacts, { recursive: true });
  if (!process.env.SANTARA_EXECUTABLE) await readFile(path.join(root, 'dist/index.html'));
  const photo = path.join(temporary, 'editor photo.png');
  const transparent = path.join(temporary, 'editor transparent.png');
  const tone = path.join(temporary, 'editor tone.wav');
  await imageFixture(photo);
  await imageFixture(transparent, true);
  await writeFile(tone, toneFixture());
  originals.set(tone, await readFile(tone));
  for (const [filename, bytes] of originals) await writeFile(path.join(artifacts, path.basename(filename)), bytes);

  stage = 'native launch';
  desktop = await _electron.launch({ executablePath: process.env.SANTARA_EXECUTABLE || undefined, args: process.env.SANTARA_EXECUTABLE ? [] : [root], cwd: root, env: environment, timeout: 60000 });
  renderer = await desktop.firstWindow({ timeout: 60000 });
  renderer.setDefaultTimeout(15000);
  renderer.on('pageerror', error => report.diagnostics.push({ kind: 'pageerror', message: error.message }));
  desktop.process().stderr?.on('data', chunk => {
    report.diagnostics.push({ kind: 'electron', message: chunk.toString().slice(-4000) });
    if (report.diagnostics.length > 80) report.diagnostics.shift();
  });
  await renderer.waitForFunction(() => typeof window.santara?.bootstrap === 'function');
  assert.match(renderer.url(), /^file:/, 'Smoke must exercise the production renderer');
  const snapshot = await renderer.evaluate(() => window.santara.bootstrap());
  assert.equal(snapshot.platform, process.platform);
  assert.equal(snapshot.backends.sharp?.available, true, snapshot.backends.sharp?.error);
  assert.deepEqual(snapshot.files, [], 'Temporary profile must start without selected files');
  assert.deepEqual(snapshot.jobs, [], 'Temporary profile must start without jobs');
  const native = await desktop.evaluate(({ app, BrowserWindow }) => {
    const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { userData: app.getPath('userData'), sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration, arguments: app.commandLine.hasSwitch('no-sandbox') };
  });
  assert.equal(native.sandbox, true);
  assert.equal(native.contextIsolation, true);
  assert.equal(native.nodeIntegration, false);
  assert.equal(native.arguments, false);
  if (process.platform === 'linux') assert.equal(native.userData, path.join(environment.XDG_CONFIG_HOME, 'santara'));
  assert.equal(await renderer.evaluate(() => typeof window.require), 'undefined');
  report.checks.native = native;
  await renderer.evaluate(() => window.santara.saveSettings({ tray: false, collision: 'rename', concurrency: 1, stripMetadata: true }));

  stage = 'native image preview RPC';
  await inspect(photo, 'image');
  await inspect(transparent, 'image');
  await inspect(tone, 'audio');
  const preview = await renderer.evaluate(filename => window.santara.preview(filename), photo);
  assert.equal(preview.width, 96);
  assert.equal(preview.height, 64);
  assert.match(preview.url, /^data:image\/png;base64,/);
  const originalPreview = await decodedImage(Buffer.from(preview.url.split(',')[1], 'base64'), 96, 64);
  assert.deepEqual([...originalPreview.subarray((11 * 96 + 17) * 4, (11 * 96 + 17) * 4 + 4)], sourcePixel(17, 11));
  const recipe = { cropX: '8', cropY: '6', cropWidth: '32', cropHeight: '20', angle: '90', flipHorizontal: 'true', padding: '3', backgroundType: 'solid', backgroundColor: '#234567' };
  const editedPreview = await renderer.evaluate(({ filename, options }) => window.santara.imagePreview(filename, 'edit-image', options), { filename: photo, options: recipe });
  assert.equal(editedPreview.width, 26);
  assert.equal(editedPreview.height, 38);
  assert.match(editedPreview.url, /^data:image\/png;base64,/);
  const previewPixels = await decodedImage(Buffer.from(editedPreview.url.split(',')[1], 'base64'), 26, 38);
  for (let row = 0; row < 38; row++) {
    for (let column = 0; column < 26; column++) {
      const expected = column < 3 || row < 3 || column >= 23 || row >= 35 ? [35, 69, 103, 255] : sourcePixel(row - 3 + 8, column - 3 + 6);
      const offset = (row * 26 + column) * 4;
      assert.deepEqual([...previewPixels.subarray(offset, offset + 4)], expected, `Preview pixel ${column},${row}`);
    }
  }
  await writeFile(path.join(artifacts, 'image-preview-rpc.png'), Buffer.from(editedPreview.url.split(',')[1], 'base64'));
  report.checks.imagePreview = { width: 26, height: 38, exactPixels: 26 * 38 };

  stage = 'native media URL ranges and offline policy';
  const media = await renderer.evaluate(filename => window.santara.preview(filename), tone);
  assert.match(media.url, /^santara-media:\/\/preview\//);
  const rangeResults = await renderer.evaluate(async ({ url, size }) => {
    const results = [];
    for (const request of [{ range: 'bytes=0-43', start: 0, end: 43 }, { range: 'bytes=44-59', start: 44, end: 59 }, { range: 'bytes=-16', start: size - 16, end: size - 1 }]) {
      const response = await fetch(url, { headers: { Range: request.range } });
      results.push({ ...request, status: response.status, contentRange: response.headers.get('content-range'), type: response.headers.get('content-type'), bytes: [...new Uint8Array(await response.arrayBuffer())] });
    }
    const head = await fetch(url, { method: 'HEAD', headers: { Range: 'bytes=0-43' } });
    const invalid = await fetch(url, { headers: { Range: `bytes=${size}-` } });
    let external = 'blocked';
    try { await fetch('https://example.com/santara-editor-offline-smoke', { signal: AbortSignal.timeout(5000) }); external = 'allowed'; } catch {}
    return { results, head: { status: head.status, length: head.headers.get('content-length'), bytes: (await head.arrayBuffer()).byteLength }, invalid: { status: invalid.status, range: invalid.headers.get('content-range') }, external };
  }, { url: media.url, size: originals.get(tone).length });
  for (const result of rangeResults.results) {
    assert.equal(result.status, 206);
    assert.equal(result.contentRange, `bytes ${result.start}-${result.end}/${originals.get(tone).length}`);
    assert.match(result.type, /^audio\//);
    assert.deepEqual(Buffer.from(result.bytes), originals.get(tone).subarray(result.start, result.end + 1));
  }
  assert.deepEqual(rangeResults.head, { status: 206, length: '44', bytes: 0 });
  assert.deepEqual(rangeResults.invalid, { status: 416, range: `bytes */${originals.get(tone).length}` });
  assert.equal(rangeResults.external, 'blocked');
  report.checks.mediaPreview = rangeResults;

  stage = 'native selection drag to tools wheel';
  await dragToEditor(photo, /^Edit photo\b/);
  await screenshot('drag-photo-editor');
  await renderer.keyboard.press('Escape');
  await expect(renderer.getByRole('dialog')).toHaveCount(0);
  report.checks.dragWheel = { source: 'inspected native file', modifierReleased: true, openedEditor: true };

  stage = 'photo editor UI';
  const photoEditor = await openEditor(photo, /^Edit photo\b/);
  await expect(photoEditor.locator('img').first()).toBeVisible();
  await photoEditor.locator('img').first().evaluate(image => image.decode());
  await fill(photoEditor, 'Crop left (px)', 8);
  await fill(photoEditor, 'Crop top (px)', 6);
  await fill(photoEditor, 'Crop width (px)', 32);
  await fill(photoEditor, 'Crop height (px)', 20);
  await photoEditor.getByLabel('Output format', { exact: true }).selectOption('png');
  await screenshot('photo-editor');
  const edited = await exportJob(photoEditor, photo, 'edit-image', 'png');
  const outputPixels = await decodedImage(edited.output, 32, 20);
  for (let row = 0; row < 20; row++) {
    for (let column = 0; column < 32; column++) {
      const offset = (row * 32 + column) * 4;
      assert.deepEqual([...outputPixels.subarray(offset, offset + 4)], sourcePixel(column + 8, row + 6), `Photo export pixel ${column},${row}`);
    }
  }
  await writeFile(path.join(artifacts, 'photo-export.png'), await readFile(edited.output));
  report.checks.photo = { status: edited.status, width: 32, height: 20, exactPixels: 640 };
  await checkOriginals();

  stage = 'background editor UI';
  const backgroundEditor = await openEditor(transparent, /^Add background\b/);
  await backgroundEditor.getByLabel('Background type', { exact: true }).selectOption('solid');
  await fill(backgroundEditor, 'Background color', '#234567');
  await fill(backgroundEditor, 'Padding (px)', 4);
  await backgroundEditor.getByLabel('Output format', { exact: true }).selectOption('png');
  await screenshot('background-editor');
  const background = await exportJob(backgroundEditor, transparent, 'background', 'png');
  const backgroundPixels = await decodedImage(background.output, 104, 72);
  for (let row = 0; row < 72; row++) {
    for (let column = 0; column < 104; column++) {
      const sourceColumn = column - 4;
      const sourceRow = row - 4;
      const expected = sourceColumn < 8 || sourceRow < 8 || sourceColumn >= 88 || sourceRow >= 56 ? [35, 69, 103, 255] : sourcePixel(sourceColumn, sourceRow);
      const offset = (row * 104 + column) * 4;
      assert.deepEqual([...backgroundPixels.subarray(offset, offset + 4)], expected, `Background export pixel ${column},${row}`);
    }
  }
  await writeFile(path.join(artifacts, 'background-export.png'), await readFile(background.output));
  report.checks.background = { status: background.status, width: 104, height: 72, exactPixels: 104 * 72 };

  stage = 'audio visualizer UI';
  const visualizer = snapshot.capabilities.find(capability => capability.id === 'audio:visualize');
  if (!visualizer?.available || !visualizer.inputs.includes('wav') || !visualizer.outputs.includes('mp4')) {
    report.checks.visualize = { skipped: true, reason: 'Optional FFmpeg WAV-to-MP4 visualizer codecs, demuxer, or filters unavailable', capability: visualizer || null };
  } else {
    assert.equal(snapshot.backends.ffmpeg?.available, true);
    assert.ok(media.waveform?.some(value => value > 0), 'Real tone preview must have a nonzero waveform');
    assert.ok(media.waveform.slice(0, 100).every(value => value === 0), 'Silent first second must produce zero waveform bins');
    assert.ok(media.waveform.slice(100).some(value => value > 0), 'Audible second must produce nonzero waveform bins');
    const audioEditor = await openEditor(tone, /^Visualize\b/);
    await fill(audioEditor, 'Width (px)', 320);
    await fill(audioEditor, 'Height (px)', 180);
    await fill(audioEditor, 'Frames per second', 12);
    await screenshot('audio-visualizer');
    const visualization = await exportJob(audioEditor, tone, 'visualize', 'mp4');
    const bytes = await readFile(visualization.output);
    assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
    const { stdout: frame } = await execute(snapshot.backends.ffmpeg.path || 'ffmpeg', ['-nostdin', '-v', 'error', '-ss', '1.5', '-i', visualization.output, '-map', '0:v:0', '-frames:v', '1', '-c:v', 'png', '-threads', '1', '-f', 'image2pipe', 'pipe:1'], { timeout: 15000, maxBuffer: 4 * 1024 * 1024, encoding: 'buffer', shell: false });
    const framePixels = await decodedImage(frame, 320, 180);
    const firstPixel = framePixels.subarray(0, 4);
    assert.ok(framePixels.some((value, index) => value !== firstPixel[index % 4]), 'Audible frame must contain a visible waveform');
    report.checks.visualize = { status: visualization.status, width: 320, height: 180, decodedFrame: true };
    if (snapshot.backends.ffprobe?.available) {
      const { stdout } = await execute(snapshot.backends.ffprobe.path || 'ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', visualization.output], { timeout: 15000, maxBuffer: 2 * 1024 * 1024, shell: false });
      const probe = JSON.parse(stdout);
      const video = probe.streams.find(stream => stream.codec_type === 'video');
      const audio = probe.streams.find(stream => stream.codec_type === 'audio');
      assert.ok(video, 'Visualizer export needs a video stream');
      assert.ok(audio, 'Visualizer export must retain source audio');
      assert.equal(video.width, 320);
      assert.equal(video.height, 180);
      assert.equal(video.codec_name, 'h264');
      assert.equal(audio.codec_name, 'aac');
      assert.ok(Number(probe.format.duration) >= 1.8 && Number(probe.format.duration) <= 2.5, probe.format.duration);
      await writeFile(path.join(artifacts, 'visualizer-ffprobe.json'), stdout);
      Object.assign(report.checks.visualize, { duration: probe.format.duration, video: video.codec_name, audio: audio.codec_name });
    } else {
      report.checks.visualize.ffprobe = 'unavailable; dimensions verified by decoding a real frame with FFmpeg';
    }
    await writeFile(path.join(artifacts, 'visualizer-export.mp4'), bytes);
    await writeFile(path.join(artifacts, 'visualizer-frame.png'), frame);
  }
  await checkOriginals();
  report.checks.originals = { count: originals.size, unchanged: true };
  await screenshot('editor-exports-complete');
  assert.deepEqual(report.diagnostics.filter(diagnostic => diagnostic.kind === 'pageerror'), []);
  report.ok = true;
} catch (error) {
  report.stage = stage;
  report.error = error.stack || String(error);
  if (renderer && !renderer.isClosed()) await screenshot('failure').catch(() => {});
  throw error;
} finally {
  try {
    if (desktop) await desktop.close();
  } finally {
    await mkdir(artifacts, { recursive: true });
    await writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    await rm(temporary, { recursive: true, force: true });
  }
}
