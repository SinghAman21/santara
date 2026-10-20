import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron, expect } from '@playwright/test';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'santara-smoke-'));
const screenshot = process.env.SANTARA_SMOKE_SCREENSHOT || path.join(os.tmpdir(), `santara-electron-smoke-${Date.now()}.png`);
const environment = { ...process.env, XDG_CONFIG_HOME: path.join(temporary, 'config'), DISPLAY: process.env.DISPLAY || ':0' };
delete environment.SANTARA_DEV_URL;
delete environment.VITE_DEV_SERVER_URL;
delete environment.ELECTRON_RUN_AS_NODE;
let desktop;
let originalClipboard;
const liveClipboard = process.env.SANTARA_LIVE_CLIPBOARD === '1';
const clipboardMode = liveClipboard ? 'live OS clipboard' : 'Electron writeText boundary only; OS clipboard not exercised';

async function terminalJob(renderer, selection) {
  let observed;
  await expect.poll(async () => {
    const snapshot = await renderer.evaluate(() => window.santara.bootstrap());
    observed = snapshot.jobs.find((job) => Object.entries(selection).every(([key, value]) => job[key] === value));
    return Boolean(observed && ['completed', 'failed', 'cancelled', 'skipped'].includes(observed.status));
  }, { timeout: 30000, message: `Wait for current terminal job: ${JSON.stringify(selection)}` }).toBe(true);
  return observed;
}

try {
  if (!process.env.SANTARA_EXECUTABLE) await readFile(path.join(root, 'dist/index.html'));
  const input = path.join(temporary, 'sample.srt');
  await writeFile(input, '1\n00:00:01,000 --> 00:00:03,000\nSantara native smoke\n');
  desktop = await _electron.launch({ executablePath: process.env.SANTARA_EXECUTABLE || undefined, args: process.env.SANTARA_EXECUTABLE ? [] : [root], cwd: root, env: environment, timeout: 60000 });
  const renderer = await desktop.firstWindow({ timeout: 60000 });
  await renderer.waitForFunction(() => typeof window.santara?.bootstrap === 'function');
  assert.match(renderer.url(), /^file:/);
  const snapshot = await renderer.evaluate(() => window.santara.bootstrap());
  assert.equal(snapshot.platform, process.platform);
  assert.ok(snapshot.backends && typeof snapshot.backends === 'object');
  assert.equal(snapshot.backends.sharp?.available, true, snapshot.backends.sharp?.error || 'Bundled sharp backend is unavailable');
  assert.ok(Array.isArray(snapshot.capabilities));
  assert.equal(snapshot.files.length, 0);

  const jpeg = path.join(temporary, 'native-image.jpg');
  await sharp({ create: { width: 96, height: 72, channels: 3, background: { r: 238, g: 138, b: 62 } } }).jpeg().toFile(jpeg);
  await renderer.evaluate((filename) => window.santara.inspectPaths([filename]), jpeg);
  const dragData = await renderer.evaluateHandle(() => new DataTransfer());
  try {
    await renderer.locator('.file-row').filter({ hasText: 'native-image.jpg' }).dispatchEvent('dragstart', { dataTransfer: dragData, clientX: 620, clientY: 350 });
    await renderer.locator('.app').dispatchEvent('dragenter', { dataTransfer: dragData, clientX: 620, clientY: 350 });
    await renderer.locator('.app').dispatchEvent('dragover', { dataTransfer: dragData, altKey: true, clientX: 620, clientY: 350 });
    const toolWheel = renderer.getByRole('menu', { name: 'Tools', exact: true });
    await expect(toolWheel).toBeVisible();
    const resizeSlice = toolWheel.getByRole('menuitem', { name: /^Resize/ });
    await resizeSlice.dispatchEvent('dragenter', { dataTransfer: dragData });
    await expect(resizeSlice).toHaveClass(/chosen/);
    await resizeSlice.dispatchEvent('drop', { dataTransfer: dragData });
    await expect(renderer.locator('.output-card')).toContainText(/resize image/i);
    await renderer.getByRole('button', { name: 'Clear operation' }).click();
  } finally {
    await dragData.dispose();
  }
  await renderer.getByRole('button', { name: /^native-image\.jpg/ }).click();
  await renderer.getByRole('dialog').getByRole('button', { name: /^convert image · PNG\b/i }).click();
  await renderer.getByRole('button', { name: 'Run operation', exact: true }).click();
  const imageConversion = await terminalJob(renderer, { input: jpeg, operation: 'convert', format: 'png' });
  assert.equal(imageConversion.status, 'completed', imageConversion.error);
  assert.deepEqual((await readFile(imageConversion.output)).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  await renderer.getByRole('button', { name: 'Converter', exact: true }).click();
  await renderer.getByRole('button', { name: /^native-image\.jpg/ }).click();
  await renderer.getByRole('tab', { name: /^Tools/ }).click();
  await renderer.getByRole('dialog').getByRole('button', { name: /^resize image\b/i }).click();
  await renderer.locator('.output-card select').first().selectOption('png');
  await expect(renderer.getByLabel('Width (px)', { exact: true })).toHaveValue('1280');
  await expect(renderer.getByLabel('Height (px)', { exact: true })).toHaveValue('720');
  await renderer.getByLabel('Width (px)', { exact: true }).fill('32');
  await renderer.getByLabel('Height (px)', { exact: true }).fill('24');
  await renderer.getByRole('button', { name: 'Run operation', exact: true }).click();
  const imageResize = await terminalJob(renderer, { input: jpeg, operation: 'resize', format: 'png' });
  assert.equal(imageResize.status, 'completed', imageResize.error);
  const resizedMetadata = await sharp(imageResize.output).metadata();
  assert.equal(resizedMetadata.width, 32);
  assert.equal(resizedMetadata.height, 24);
  await renderer.getByRole('button', { name: 'Converter', exact: true }).click();

  const selected = await renderer.evaluate((filename) => window.santara.inspectPaths([filename]), input);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].category, 'subtitle');
  await renderer.evaluate(() => {
    window.smokeUpdates = [];
    window.smokeUnsubscribe = window.santara.onUpdate((update) => {
      if (update.jobs) window.smokeUpdates.push(...update.jobs);
    });
  });
  const enqueued = await renderer.evaluate((files) => window.santara.enqueue({ files, operation: 'convert', format: 'vtt', options: {} }), selected);
  assert.equal(enqueued.length, 1);
  await renderer.waitForFunction((id) => window.smokeUpdates.some((job) => job.id === id && ['completed', 'failed', 'cancelled'].includes(job.status)), enqueued[0].id, { timeout: 30000 });
  const finished = await terminalJob(renderer, { id: enqueued[0].id });
  assert.equal(finished.status, 'completed', finished.error || 'Conversion did not complete');
  assert.match(await readFile(finished.output, 'utf8'), /^WEBVTT/);
  await renderer.evaluate(() => window.smokeUnsubscribe());

  for (const response of [0, 1, 2]) {
    const [collisionJob] = await renderer.evaluate((files) => window.santara.enqueue({ files, operation: 'convert', format: 'vtt', options: { collision: 'ask' } }), selected);
    const failedCollision = await terminalJob(renderer, { id: collisionJob.id });
    assert.equal(failedCollision.status, 'failed');
    assert.match(failedCollision.error, /Output exists/i);
    await desktop.evaluate(({ dialog }, response) => {
      globalThis.smokeCollisionDialog = dialog.showMessageBox;
      dialog.showMessageBox = async (_window, options) => {
        globalThis.smokeCollisionButtons = options.buttons;
        return { response, checkboxChecked: false };
      };
    }, response);
    const retried = await renderer.evaluate((id) => window.santara.retry(id), collisionJob.id);
    const buttons = await desktop.evaluate(({ dialog }) => {
      dialog.showMessageBox = globalThis.smokeCollisionDialog;
      delete globalThis.smokeCollisionDialog;
      return globalThis.smokeCollisionButtons;
    });
    assert.deepEqual(buttons, ['Cancel', 'Keep both (auto-rename)', 'Skip']);
    if (response === 0) {
      assert.equal(retried, null);
    } else {
      const expected = response === 1 ? 'completed' : 'skipped';
      const resolved = await terminalJob(renderer, { id: collisionJob.id });
      assert.equal(resolved.status, expected, resolved.error);
      assert.equal(resolved.options.collision, response === 1 ? 'rename' : 'skip');
      if (response === 1) assert.notEqual(resolved.output, finished.output);
    }
    assert.match(await readFile(finished.output, 'utf8'), /^WEBVTT/);
  }

  if (liveClipboard) {
    console.log('Live clipboard verification enabled: desktop clipboard managers may replace contents and cause this opt-in check to fail.');
    originalClipboard = await desktop.evaluate(({ clipboard }) => clipboard.readText());
  } else {
    await desktop.evaluate(({ clipboard }) => {
      globalThis.smokeClipboardWriteText = clipboard.writeText;
      globalThis.smokeClipboardValue = undefined;
      clipboard.writeText = (value) => { globalThis.smokeClipboardValue = value; };
    });
  }
  try {
    const copied = await renderer.evaluate((files) => window.santara.fileAction({ action: 'copy-path', files }), selected);
    assert.equal(copied.ok, true, copied.reason);
    const clipboardMatches = await desktop.evaluate(({ clipboard }, { expected, live }) => (live ? clipboard.readText() : globalThis.smokeClipboardValue) === expected, { expected: input, live: liveClipboard });
    assert.ok(clipboardMatches, liveClipboard ? 'Clipboard path not observed; an external clipboard manager may have replaced it' : 'Clipboard writeText boundary did not receive the expected path');
  } finally {
    if (liveClipboard) {
      if (originalClipboard !== undefined) {
        await desktop.evaluate(({ clipboard }, value) => clipboard.writeText(value), originalClipboard);
        originalClipboard = undefined;
      }
    } else {
      await desktop.evaluate(({ clipboard }) => {
        clipboard.writeText = globalThis.smokeClipboardWriteText;
        delete globalThis.smokeClipboardWriteText;
        delete globalThis.smokeClipboardValue;
      });
    }
  }

  const network = await renderer.evaluate(async () => {
    try { await fetch('https://example.com/santara-offline-smoke'); return true; } catch { return false; }
  });
  assert.equal(network, false, 'Renderer unexpectedly allowed an external network request');
  assert.equal(await renderer.evaluate(() => typeof window.require), 'undefined');
  const mainPreferences = await desktop.evaluate(({ BrowserWindow }) => {
    const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration };
  });
  assert.deepEqual(mainPreferences, { sandbox: true, contextIsolation: true, nodeIntegration: false });

  const picture = path.join(temporary, 'preview.png');
  await writeFile(picture, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
  const previewFiles = await renderer.evaluate((filename) => window.santara.inspectPaths([filename]), picture);
  const previewResult = await renderer.evaluate((files) => window.santara.fileAction({ action: 'preview', files }), previewFiles);
  assert.equal(previewResult.ok, true, previewResult.reason);
  const previewPreferences = await desktop.evaluate(({ BrowserWindow }) => {
    const preview = BrowserWindow.getAllWindows().find((candidate) => candidate.isAlwaysOnTop());
    const preferences = preview.webContents.getLastWebPreferences();
    const result = { javascript: preferences.javascript, sandbox: preferences.sandbox, nodeIntegration: preferences.nodeIntegration };
    preview.close();
    return result;
  });
  assert.deepEqual(previewPreferences, { javascript: false, sandbox: true, nodeIntegration: false });

  const pdf = path.join(temporary, 'preview.pdf');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = 'BT /F1 22 Tf 40 200 Td (Santara PDF preview) Tj ET';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdfText = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdfText)); pdfText += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdfText);
  pdfText += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  await writeFile(pdf, pdfText);
  const pdfFiles = await renderer.evaluate((filename) => window.santara.inspectPaths([filename]), pdf);
  const pdfResult = await renderer.evaluate((files) => window.santara.fileAction({ action: 'preview', files }), pdfFiles);
  assert.equal(pdfResult.ok, true, pdfResult.reason);
  const pdfWindow = desktop.windows().find((candidate) => candidate !== renderer);
  await pdfWindow.waitForFunction(() => document.querySelector('img')?.naturalWidth > 0);
  await pdfWindow.screenshot({ path: screenshot.replace(/\.png$/, '-pdf.png') });
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((candidate) => candidate.isAlwaysOnTop()).close());

  const folder = path.join(temporary, 'folder');
  const destination = path.join(temporary, 'destination');
  const movedDestination = path.join(temporary, 'moved');
  await mkdir(path.join(folder, 'nested'), { recursive: true });
  await mkdir(destination);
  await mkdir(movedDestination);
  await writeFile(path.join(folder, 'immediate.txt'), 'Immediate file');
  await writeFile(path.join(folder, 'nested', 'deep.txt'), 'Nested file');
  const folderSelection = await renderer.evaluate((filename) => window.santara.inspectPaths([filename], false), folder);
  assert.equal(folderSelection.length, 2, 'Nonrecursive inspection must retain the folder and its immediate files');
  assert.ok(folderSelection.some((file) => file.isDirectory));
  const archiveJobs = await renderer.evaluate((files) => window.santara.enqueue({ files, operation: 'create-archive', format: 'zip', options: {} }), folderSelection);
  assert.equal(archiveJobs.length, 1, 'Folder and its selected children must create one archive');
  const archiveJob = await terminalJob(renderer, { id: archiveJobs[0].id });
  assert.equal(archiveJob.status, 'completed', archiveJob.error);
  assert.deepEqual(archiveJob.options.inputs, [folder]);
  const archiveBytes = await readFile(archiveJob.output);
  assert.equal(archiveBytes.readUInt32LE(0), 0x04034b50);
  const archiveText = archiveBytes.toString('latin1');
  for (const entry of ['folder/immediate.txt', 'folder/nested/deep.txt']) {
    assert.equal(archiveText.split(entry).length - 1, 2, 'Each archived file must occur once in the local header and once in the central directory');
  }
  if (process.platform !== 'win32') {
    const link = path.join(folder, 'nested', 'symlink.txt');
    await symlink(input, link);
    const symlinkCopy = await renderer.evaluate(({ files, destination }) => window.santara.fileAction({ action: 'copy', files, destination }), { files: folderSelection, destination });
    assert.equal(symlinkCopy.ok, false);
    assert.match(symlinkCopy.reason, /symbolic link/);
    await unlink(link);
  }
  await desktop.evaluate(({ dialog }) => {
    globalThis.smokeMessageBox = dialog.showMessageBox;
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  const folderCopy = await renderer.evaluate(({ files, destination }) => window.santara.fileAction({ action: 'copy', files, destination }), { files: folderSelection, destination });
  assert.equal(folderCopy.ok, true, folderCopy.reason);
  assert.equal(folderCopy.results.length, 1, 'Folder descendants must not be copied twice');
  assert.equal(await readFile(path.join(destination, 'folder', 'nested', 'deep.txt'), 'utf8'), 'Nested file');
  const collision = await renderer.evaluate(({ files, destination }) => window.santara.fileAction({ action: 'copy', files, destination }), { files: folderSelection, destination });
  assert.equal(collision.ok, false);
  assert.match(collision.reason, /already exists/);
  const cycle = await renderer.evaluate(({ files, destination }) => window.santara.fileAction({ action: 'copy', files, destination }), { files: folderSelection, destination: path.join(folder, 'nested') });
  assert.equal(cycle.ok, false);
  assert.match(cycle.reason, /inside/);
  const folderMove = await renderer.evaluate(({ files, destination }) => window.santara.fileAction({ action: 'move', files, destination }), { files: folderSelection, destination: movedDestination });
  assert.equal(folderMove.ok, true, folderMove.reason);
  assert.equal(await readFile(path.join(movedDestination, 'folder', 'nested', 'deep.txt'), 'utf8'), 'Nested file');
  await assert.rejects(readFile(path.join(folder, 'immediate.txt')), { code: 'ENOENT' });
  await desktop.evaluate(({ dialog }) => { dialog.showMessageBox = globalThis.smokeMessageBox; delete globalThis.smokeMessageBox; });

  await renderer.evaluate(async () => {
    await window.santara.saveSettings({ shortcuts: { convert: 'Ctrl+Shift', tools: 'Alt', actions: 'Control' } });
  });
  await mkdir(path.dirname(screenshot), { recursive: true });
  await renderer.screenshot({ path: screenshot, fullPage: true });
  console.log(JSON.stringify({ ok: true, executable: process.env.SANTARA_EXECUTABLE || 'development Electron', platform: snapshot.platform, backends: Object.keys(snapshot.backends), clipboardMode, imageConversion: imageConversion.status, imageResize: imageResize.status, converted: finished.status, screenshot }, null, 2));
} finally {
  if (desktop) {
    if (originalClipboard !== undefined) await desktop.evaluate(({ clipboard }, value) => clipboard.writeText(value), originalClipboard).catch(() => {});
    await desktop.close();
  }
  await rm(temporary, { recursive: true, force: true });
}
