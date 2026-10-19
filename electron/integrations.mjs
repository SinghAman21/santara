import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { BrowserWindow, clipboard, dialog, session, shell } from 'electron';

const pathKey = (value) => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);
const samePath = (left, right) => pathKey(left) === pathKey(right);
const inside = (parent, child) => {
  const relative = path.relative(pathKey(parent), pathKey(child));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};
const unchanged = (before, after) => before.ino === after.ino && before.dev === after.dev && before.size === after.size && before.mtimeMs === after.mtimeMs && before.isDirectory() === after.isDirectory() && !after.isSymbolicLink();
const previews = new Set();
const previewChildren = new Set();
let integrationsClosing = false;

export async function closeIntegrations() {
  integrationsClosing = true;
  for (const preview of previews) if (!preview.isDestroyed()) preview.destroy();
  await Promise.all([...previewChildren].map((child) => new Promise((resolve) => {
    child.once('close', resolve);
    child.kill('SIGKILL');
  })));
}

export function absolutePath(value) {
  if (typeof value !== 'string' || value.length > 32768 || /[\x00-\x1f]/.test(value) || !path.isAbsolute(value)) {
    throw new TypeError('Expected an absolute local path');
  }
  if (value.startsWith('\\\\') || value.startsWith('//')) throw new Error('Network paths are unavailable');
  return path.normalize(value);
}

export function pathList(values) {
  if (!Array.isArray(values) || values.length > 1000) throw new TypeError('Expected at most 1000 paths');
  return [...new Set(values.map((value) => absolutePath(typeof value === 'string' ? value : value?.path)))];
}

export function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('Expected an object');
  }
  return value;
}

export function safeData(value, depth = 0) {
  if (depth > 6) throw new TypeError('Options are too deeply nested');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 32768 && !value.includes('\0')) return value;
  if (Array.isArray(value) && value.length <= 100) return value.map((item) => safeData(item, depth + 1));
  plainObject(value);
  const entries = Object.entries(value);
  if (entries.length > 100) throw new TypeError('Too many options');
  return Object.fromEntries(entries.map(([key, item]) => {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      throw new TypeError('Invalid option key');
    }
    return [key, safeData(item, depth + 1)];
  }));
}

export function createStore(directory, report) {
  let pending = Promise.resolve();
  return {
    async read(name, fallback) {
      try {
        const text = await readFile(path.join(directory, `${name}.json`), 'utf8');
        if (text.length > 20_000_000) throw new Error('Saved metadata is too large');
        return JSON.parse(text);
      } catch (error) {
        if (error.code !== 'ENOENT') report(`Cannot read ${name}: ${error.message}`);
        return fallback;
      }
    },
    write(name, value) {
      let serialized;
      try { serialized = JSON.stringify(value, null, 2); } catch (error) { report(error.message); return pending; }
      pending = pending.then(async () => {
        const temporary = path.join(directory, `.${name}-${randomUUID()}.tmp`);
        try {
          await mkdir(directory, { recursive: true, mode: 0o700 });
          const handle = await open(temporary, 'wx', 0o600);
          try { await handle.writeFile(serialized); await handle.sync(); } finally { await handle.close(); }
          await rename(temporary, path.join(directory, `${name}.json`));
        } catch (error) {
          report(`Cannot save ${name}: ${error.message}`);
          await unlink(temporary).catch(() => {});
        }
      }).catch((error) => report(error.message));
      return pending;
    },
    flush: () => pending,
  };
}

export async function knownPath(value, allowed) {
  const candidate = absolutePath(value);
  if (!allowed.has(candidate) && ![...allowed].some((entry) => samePath(entry, candidate))) throw new Error('Select a known file or job output first');
  const info = await lstat(candidate);
  if (info.isSymbolicLink()) throw new Error('Symbolic links are not supported for this action');
  if (!info.isFile() && !info.isDirectory()) throw new Error('Unsupported filesystem entry');
  const canonical = await realpath(candidate);
  if (!samePath(canonical, candidate)) throw new Error('Paths through symbolic links are not supported');
  return { path: candidate, info };
}

export async function revealPath(value, allowed) {
  const target = await knownPath(value, allowed);
  shell.showItemInFolder(target.path);
  return { ok: true };
}

async function rasterizePDF(bytes, backend) {
  if (!backend?.available) throw new Error('PDF preview requires the local Poppler backend (pdftoppm). Use Open or Reveal instead.');
  return new Promise((resolve, reject) => {
    const child = spawn(backend.path, ['-f', '1', '-singlefile', '-scale-to', '1400', '-png', '-'], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    previewChildren.add(child);
    const chunks = [];
    let length = 0;
    let failure;
    let stderr = '';
    const timer = setTimeout(() => { failure = new Error('PDF preview timed out'); child.kill('SIGKILL'); }, 15000);
    child.stdout.on('data', (chunk) => {
      length += chunk.length;
      if (length > 12 * 1024 * 1024) { failure = new Error('Rendered PDF preview exceeds 12 MiB'); child.kill('SIGKILL'); }
      else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.stdin.on('error', () => {});
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      previewChildren.delete(child);
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0 || !length) reject(new Error(`PDF preview could not render: ${stderr || 'Poppler failed'}`));
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.end(bytes);
  });
}

async function quickPreview(target, parent, backends) {
  const types = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
    '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf',
  };
  let mime = types[path.extname(target.path).toLowerCase()];
  if (!target.info.isFile() || !mime) return { ok: false, available: false, reason: 'Quick Preview supports raster images, audio, MP4/WebM video, and PDF files.' };
  const limit = 32 * 1024 * 1024;
  if (target.info.size > limit) return { ok: false, available: false, reason: 'Quick Preview is limited to 32 MiB. Use Open or Reveal for larger files.' };
  if (previews.size >= 4) return { ok: false, reason: 'Close a preview before opening another.' };
  const handle = await open(target.path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  let bytes;
  try {
    const info = await handle.stat();
    if (!unchanged(target.info, info) || !info.isFile()) throw new Error('Preview file changed');
    bytes = Buffer.alloc(info.size);
    let position = 0;
    while (position < bytes.length) {
      const { bytesRead } = await handle.read(bytes, position, bytes.length - position, position);
      if (!bytesRead) throw new Error('Preview file changed');
      position += bytesRead;
    }
    if (!unchanged(info, await handle.stat())) throw new Error('Preview file changed');
  } finally { await handle.close(); }
  const isPDF = mime === 'application/pdf';
  if (isPDF) {
    if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('Not a valid PDF file');
    bytes = await rasterizePDF(bytes, backends?.poppler);
    mime = 'image/png';
  }
  const source = `data:${mime};base64,${bytes.toString('base64')}`;
  const escape = (value) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const title = escape(path.basename(target.path));
  const content = mime.startsWith('image/') ? `<img src="${source}" alt="${title}">`
    : mime.startsWith('audio/') ? `<audio controls src="${source}"></audio>`
      : `<video controls src="${source}"></video>`;
  const policy = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; media-src data:; object-src 'none'; frame-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'";
  const document = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>${title}</title><style>html,body{margin:0;height:100%;background:#faf9f6;color:#36372f}body{display:flex;align-items:center;justify-content:center}img,video{max-width:100%;max-height:100%;object-fit:contain}audio{width:90%}embed{width:100%;height:100%}</style>${content}`;
  const previewSession = session.fromPartition(`santara-preview-${randomUUID()}`);
  if (integrationsClosing || parent.isDestroyed()) throw new Error('Santara is shutting down');
  previewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  previewSession.setPermissionCheckHandler(() => false);
  previewSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !['data:', 'blob:'].includes(new URL(details.url).protocol) }));
  previewSession.on('will-download', (event) => event.preventDefault());
  const preview = new BrowserWindow({
    width: 860, height: 640, parent, alwaysOnTop: true, show: false, autoHideMenuBar: true,
    title: `Quick Preview — ${path.basename(target.path)}`, backgroundColor: '#faf9f6',
    webPreferences: { session: previewSession, sandbox: true, contextIsolation: true, nodeIntegration: false,
      javascript: false, plugins: false, webSecurity: true, webviewTag: false,
      navigateOnDragDrop: false, devTools: false, allowRunningInsecureContent: false },
  });
  previews.add(preview);
  preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  preview.webContents.on('will-navigate', (event) => event.preventDefault());
  preview.webContents.on('will-redirect', (event) => event.preventDefault());
  preview.webContents.on('will-attach-webview', (event) => event.preventDefault());
  preview.on('closed', () => { previews.delete(preview); void previewSession.clearCache().catch(() => {}); });
  try {
    await preview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
    preview.show();
    return { ok: true, reason: isPDF ? 'Quick Preview shows the first PDF page, rendered locally with Poppler.' : 'Quick Preview opened. Playback support depends on the local codec; previews are limited to 32 MiB.' };
  } catch (error) { if (!preview.isDestroyed()) preview.destroy(); throw error; }
}

async function snapshotTree(source) {
  const entries = [];
  const visit = async (current, relative, depth) => {
    if (depth > 64 || entries.length >= 10000) throw new Error('Folder action limit exceeded (10000 entries or 64 levels)');
    const info = await lstat(current);
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory()) || !samePath(await realpath(current), current)) throw new Error(`Unsupported entry or symbolic link: ${current}`);
    entries.push({ source: current, relative, info });
    if (info.isDirectory()) {
      for (const name of (await readdir(current)).sort()) await visit(path.join(current, name), path.join(relative, name), depth + 1);
    }
  };
  await visit(source, '', 0);
  return entries;
}

async function verifyEntry(entry) {
  if (!unchanged(entry.info, await lstat(entry.source)) || !samePath(await realpath(entry.source), entry.source)) throw new Error(`Source changed: ${entry.source}`);
}

async function copyEntry(entry, destination) {
  await verifyEntry(entry);
  if (entry.info.isDirectory()) {
    await mkdir(destination, { mode: 0o700 });
    return;
  }
  const source = await open(entry.source, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (!unchanged(entry.info, await source.stat())) throw new Error('Source changed while opening');
    const output = await open(destination, 'wx', 0o600);
    try {
      const buffer = Buffer.alloc(1024 * 1024);
      let position = 0;
      while (position < entry.info.size) {
        const { bytesRead } = await source.read(buffer, 0, Math.min(buffer.length, entry.info.size - position), position);
        if (!bytesRead) throw new Error('Source changed during copy');
        let written = 0;
        while (written < bytesRead) written += (await output.write(buffer, written, bytesRead - written)).bytesWritten;
        position += bytesRead;
      }
      if (!unchanged(entry.info, await source.stat())) throw new Error('Source changed during copy');
      await output.sync();
    } finally { await output.close(); }
  } finally { await source.close(); }
}

export async function openOutput(value, allowed) {
  const target = await knownPath(value, allowed);
  if (target.info.isFile() && (/\.(exe|com|bat|cmd|ps1|sh|bash|zsh|fish|desktop|appimage|msi|vbs|js|mjs|cjs|jar|scr|lnk|url|hta)$/i.test(target.path) || (process.platform !== 'win32' && (target.info.mode & 0o111)))) {
    throw new Error('Executable outputs cannot be opened');
  }
  const error = await shell.openPath(target.path);
  if (error) throw new Error(error);
  return { ok: true };
}

export async function fileAction(request, { window, allowed, backends }) {
  plainObject(request);
  const actions = ['copy', 'move', 'copy-path', 'copyPath', 'copyPaths', 'clipboard', 'terminal', 'preview', 'share'];
  if (!actions.includes(request.action)) throw new Error('Unsupported file action');
  let paths = pathList(request.files);
  if (['copy', 'move'].includes(request.action)) {
    paths = paths.filter((source) => !paths.some((parent) => !samePath(parent, source) && inside(parent, source)));
  }
  if (!paths.length) throw new Error('Select at least one file');
  const targets = await Promise.all(paths.map((value) => knownPath(value, allowed)));
  if (['copy-path', 'copyPath', 'copyPaths', 'clipboard'].includes(request.action)) {
    clipboard.writeText(paths.join('\n'));
    return { ok: true };
  }
  if (request.action === 'share') {
    return { ok: false, available: false, reason: 'Native sharing is unavailable on this desktop. Use Copy path or Reveal.' };
  }
  if (request.action === 'preview') {
    if (targets.length !== 1) return { ok: false, reason: 'Select one file to preview.' };
    return quickPreview(targets[0], window, backends);
  }
  if (request.action === 'terminal') {
    if (targets.length !== 1) throw new Error('Select one location');
    const cwd = targets[0].info.isDirectory() ? targets[0].path : path.dirname(targets[0].path);
    const executable = process.platform === 'linux' ? 'x-terminal-emulator' : process.platform === 'win32' ? 'wt.exe' : null;
    if (!executable) return { ok: false, available: false, reason: 'Terminal integration is unavailable' };
    return new Promise((resolve) => {
      const child = spawn(executable, process.platform === 'win32' ? ['-d', cwd] : [], { cwd, shell: false, detached: true, stdio: 'ignore' });
      child.once('error', () => resolve({ ok: false, available: false, reason: 'No supported terminal is installed' }));
      child.once('spawn', () => { child.unref(); resolve({ ok: true }); });
    });
  }
  let destination = request.destination;
  if (!destination) {
    const selection = await dialog.showOpenDialog(window, { title: 'Choose destination', properties: ['openDirectory'] });
    if (selection.canceled) return { canceled: true };
    [destination] = selection.filePaths;
  }
  destination = absolutePath(destination);
  const destinationInfo = await lstat(destination);
  if (!destinationInfo.isDirectory() || !samePath(await realpath(destination), destination)) throw new Error('Choose a local directory without symbolic links');
  for (const source of paths) {
    if (inside(source, destination)) throw new Error('Destination cannot be inside a selected source');
    if (paths.some((other) => !samePath(source, other) && inside(source, other))) throw new Error('Select the parent folder or its children, not both');
  }
  const outputPaths = paths.map((source) => path.join(destination, path.basename(source)));
  if (new Set(outputPaths.map(pathKey)).size !== outputPaths.length) throw new Error('Selected entries have duplicate names');
  for (const output of outputPaths) {
    try { await lstat(output); throw new Error(`Destination already exists: ${path.basename(output)}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const trees = await Promise.all(paths.map(snapshotTree));
  const confirmation = await dialog.showMessageBox(window, {
    type: 'warning', title: `Confirm ${request.action}`, message: `${request.action === 'move' ? 'Move' : 'Copy'} ${paths.length} file(s)?`,
    detail: `${paths.join('\n')}\n\nDestination: ${destination}\nExisting files will never be overwritten.`,
    buttons: ['Cancel', request.action === 'move' ? 'Move files' : 'Copy files'], defaultId: 0, cancelId: 0, noLink: true,
  });
  if (confirmation.response !== 1) return { canceled: true };
  const results = [];
  for (const [index, source] of paths.entries()) {
    const output = outputPaths[index];
    try {
      await knownPath(source, allowed);
      if (!samePath(await realpath(destination), destination)) throw new Error('Destination changed');
      const entries = trees[index];
      for (const entry of entries) {
        const target = path.join(output, entry.relative);
        if (!samePath(await realpath(path.dirname(target)), path.dirname(target))) throw new Error('Destination contains a symbolic link');
        await copyEntry(entry, target);
      }
      allowed.add(output);
      if (request.action === 'move') {
        for (const entry of entries) await verifyEntry(entry);
        for (const entry of [...entries].reverse()) {
          if (entry.info.isDirectory()) {
            const current = await lstat(entry.source);
            if (!current.isDirectory() || current.isSymbolicLink() || current.ino !== entry.info.ino || current.dev !== entry.info.dev) throw new Error('Source folder changed; remaining originals retained');
            await rmdir(entry.source);
          } else {
            await verifyEntry(entry);
            await unlink(entry.source);
          }
        }
      }
      results.push({ input: source, output, ok: true });
    } catch (error) { results.push({ input: source, output, ok: false, error: `${error.message}. Any partial destination is retained; existing files were not overwritten.` }); }
  }
  const ok = results.every((result) => result.ok);
  return { ok, results, reason: ok ? `${request.action === 'move' ? 'Moved' : 'Copied'} ${results.length} selected entry(s).` : results.filter((result) => !result.ok).map((result) => result.error).join('\n') };
}
