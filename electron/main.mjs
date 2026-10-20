import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, protocol, screen, session, Tray } from 'electron';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { absolutePath, closeIntegrations, createStore, fileAction, openOutput, pathList, plainObject, revealPath, safeData } from './integrations.mjs';
import { createEngine, detectBackends, getCapabilities, inspectFiles, normalizeImageOptions } from './engine.mjs';
import { createPreviewService } from './previews.mjs';

protocol.registerSchemesAsPrivileged([{ scheme: 'santara-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

const directory = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(directory, '../dist/index.html');
const productionURL = pathToFileURL(indexPath).href;
const developmentURL = !app.isPackaged ? (process.env.SANTARA_DEV_URL || process.env.VITE_DEV_SERVER_URL || null) : null;
if (developmentURL) {
  const parsed = new URL(developmentURL);
  if (parsed.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error('Development server must use a local HTTP URL');
  }
}

app.setName('Santara');
if (process.platform === 'linux') {
  const configHome = process.env.XDG_CONFIG_HOME;
  const configDirectory = path.join(configHome && path.isAbsolute(configHome) ? configHome : path.join(os.homedir(), '.config'), 'santara');
  try {
    mkdirSync(configDirectory, { recursive: true, mode: 0o700 });
    app.setPath('userData', configDirectory);
  } catch (error) { console.error('Santara settings directory unavailable:', error.message); }
}

let window;
let globalWheelWindow;
let imageToolWindow;
let imageToolContext;
let globalWheelPosition;
let globalWheelMode;
let globalWheelRequestedVisible = false;
let mainWindowHiddenForWheel = false;
let nativeWatcher;
let tray;
let engine;
let previews;
const imagePreviewControllers = new Set();
let backends = {};
let settings = {
  outputFolder: '', collision: 'rename', concurrency: 2, theme: 'system', tray: false,
  recursive: false, quality: 85, stripMetadata: false, preserveStructure: false,
  namingPattern: '{name}-converted', shortcuts: { convert: 'Shift', tools: 'Alt', actions: 'Control' }, backendPaths: {},
};
let files = [];
let quitting = false;
let flushed = false;
let shutdown;
let initialized = false;
let queue = Promise.resolve();
let persistenceTimer;
const pendingPaths = [];
const allowed = new Set();
const trustedContents = new Set();
const persistenceErrors = [];
const jobNotificationState = new Map();
const store = createStore(app.getPath('userData'), (message) => {
  console.error(message);
  persistenceErrors.push(message);
  if (persistenceErrors.length > 20) persistenceErrors.shift();
  send({ persistenceError: message });
});

function send(update) {
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('santara:update', update);
}

function jobs() { return engine ? engine.list() : []; }

function outputs() {
  const paths = new Set();
  for (const job of jobs()) {
    if (typeof job.output === 'string' && path.isAbsolute(job.output)) paths.add(path.normalize(job.output));
  }
  return paths;
}

function registerPaths() {
  for (const file of files) allowed.add(path.normalize(file.path));
  for (const output of outputs()) allowed.add(output);
}

function persistJobs() {
  if (quitting) return;
  clearTimeout(persistenceTimer);
  persistenceTimer = setTimeout(() => { void store.write('jobs', jobs()); }, 200);
}

function updateFromEngine(changedJob) {
  registerPaths();
  send({ jobs: jobs() });
  persistJobs();
  if (changedJob && ['completed', 'failed', 'cancelled'].includes(changedJob.status) && jobNotificationState.get(changedJob.id) !== changedJob.status) {
    jobNotificationState.set(changedJob.id, changedJob.status);
    if (Notification.isSupported()) {
      const complete = changedJob.status === 'completed';
      const imageJob = /\.(?:jpg|jpeg|png|webp|tif|tiff|avif|bmp|heic)$/i.test(changedJob.input || '');
      const notification = new Notification({
        title: complete ? (imageJob ? 'Image ready' : 'File ready') : changedJob.status === 'failed' ? 'Conversion failed' : 'Conversion cancelled',
        body: complete ? path.basename(changedJob.output || changedJob.name || 'Your file') : `${changedJob.name || 'File job'} · ${changedJob.error || changedJob.status}`,
      });
      if (complete && changedJob.output) notification.on('click', () => { void openOutput(changedJob.output, outputs()); });
      notification.show();
    }
  }
}

function validateSettings(patch) {
  plainObject(patch);
  const accepted = {};
  for (const [key, value] of Object.entries(patch)) {
    if (['tray', 'minimizeToTray', 'recursive', 'preserveMetadata', 'keepOriginals', 'stripMetadata', 'preserveStructure'].includes(key)) {
      if (typeof value !== 'boolean') throw new TypeError(`Invalid ${key}`);
    } else if (['outputDir', 'outputDirectory', 'outputFolder'].includes(key)) {
      if (value !== '') absolutePath(value);
    } else if (['concurrency', 'maxConcurrent'].includes(key)) {
      if (!Number.isInteger(value) || value < 1 || value > 8) throw new TypeError('Concurrency must be 1–8');
    } else if (key === 'theme') {
      if (!['light', 'dark', 'system'].includes(value)) throw new TypeError('Invalid theme');
    } else if (key === 'collision') {
      if (!['skip', 'autorenaming', 'rename', 'ask'].includes(value)) throw new TypeError('Invalid collision policy');
    } else if (key === 'quality') {
      if (!Number.isFinite(value) || value < 1 || value > 100) throw new TypeError('Invalid quality');
    } else if (key === 'namingPattern') {
      if (typeof value !== 'string' || value.length > 200 || /[\\/\x00-\x1f]/.test(value)) throw new TypeError('Invalid naming pattern');
    } else if (key === 'shortcuts') {
      plainObject(value);
      for (const [action, shortcut] of Object.entries(value)) {
        if (!['convert', 'tools', 'actions'].includes(action) || !['Shift', 'Alt', 'Control', 'Ctrl', 'Ctrl+Shift'].includes(shortcut)) throw new TypeError('Invalid shortcut');
      }
    } else if (['backendOverrides', 'backendPaths'].includes(key)) {
      plainObject(value);
      for (const [name, executable] of Object.entries(value)) {
        if (!['ffmpeg', 'ffprobe', 'imagemagick', 'qpdf', 'poppler', 'pandoc', 'libreoffice'].includes(name)) throw new TypeError('Invalid backend');
        if (executable !== '' && executable !== false) absolutePath(executable);
      }
    } else { throw new TypeError(`Unknown setting: ${key}`); }
    accepted[key] = value;
  }
  return accepted;
}

async function capabilities() { return getCapabilities(backends, files); }

function engineSettings(value) {
  return { ...value, outputDirectory: value.outputFolder || value.outputDirectory || value.outputDir || '' };
}

function backendOverrides(value) {
  return Object.fromEntries(Object.entries(value.backendPaths || value.backendOverrides || {}).filter(([, executable]) => executable !== ''));
}

async function addPaths(paths, recursive = false) {
  if (typeof recursive !== 'boolean') throw new TypeError('Recursive must be boolean');
  const selected = pathList(paths);
  const roots = await inspectFiles(selected, { recursive: false });
  const discovered = [...roots];
  for (const folder of roots.filter((entry) => entry.isDirectory)) {
    if (recursive) {
      discovered.push(...await inspectFiles([folder.path], { recursive: true }));
    } else {
      const children = (await readdir(folder.path, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => path.join(folder.path, entry.name));
      if (children.length) discovered.push(...await inspectFiles(children, { recursive: false }));
    }
  }
  const inspected = [...new Map(discovered.map((entry) => [entry.path, entry])).values()];
  if (!Array.isArray(inspected)) throw new Error('Inspector returned invalid files');
  const combined = new Map(files.map((file) => [file.path, file]));
  for (const file of inspected) {
    absolutePath(file.path);
    combined.set(file.path, file);
  }
  if (combined.size > 10000) throw new Error('At most 10000 files may be selected');
  files = [...combined.values()];
  registerPaths();
  send({ files: inspected, capabilities: await capabilities() });
  return inspected;
}

function queueOpen(argv, cwd = process.cwd(), initial = false) {
  const argumentsToRead = argv.slice(initial ? (process.defaultApp ? 2 : 1) : (process.defaultApp ? 2 : 1));
  for (const argument of argumentsToRead) {
    if (typeof argument !== 'string' || argument.startsWith('-') || argument.includes('://')) continue;
    try { pendingPaths.push(absolutePath(path.resolve(cwd, argument))); } catch {}
  }
  if (initialized) void drainOpenQueue();
}

async function drainOpenQueue() {
  queue = queue.then(async () => {
    const paths = pendingPaths.splice(0, 1000);
    if (paths.length) {
      try { await addPaths(paths, false); } catch (error) { send({ error: `Cannot add open-with files: ${error.message}` }); }
    }
  }).catch((error) => console.error(error));
  await queue;
}

function focusWindow() {
  if (!window || window.isDestroyed()) createWindow({ showOnReady: false });
}

function wheelRequest(argv) {
  const dedicated = argv.find((value) => value.startsWith('--santara-global-wheel='))?.split('=')[1];
  const dedicatedAction = argv.find((value) => value.startsWith('--santara-wheel-action='))?.split('=').slice(1).join('=');
  const actionIndex = argv.indexOf('--wheel');
  const action = actionIndex >= 0 ? argv[actionIndex + 1] : undefined;
  const argument = (key) => {
    const equals = argv.find((value) => value.startsWith(`--${key}=`))?.split('=').slice(1).join('=');
    const index = argv.indexOf(`--${key}`);
    return equals ?? (index >= 0 ? argv[index + 1] : undefined);
  };
  const mode = dedicated || argument('mode');
  const requestedAction = dedicatedAction || action;
  if (!['convert', 'tools', 'actions'].includes(mode) && requestedAction !== 'hide') return null;
  const coordinate = (key) => {
    const value = argv.find((argument) => argument.startsWith(`--santara-wheel-${key}=`))?.split('=')[1];
    const number = Number(value ?? argument(key));
    return Number.isFinite(number) ? Math.round(number) : undefined;
  };
  return { mode: requestedAction === 'hide' ? 'hide' : mode, x: coordinate('x'), y: coordinate('y') };
}

function placeWheel(x, y) {
  if (!globalWheelWindow || globalWheelWindow.isDestroyed()) return;
  const pointer = screen.getCursorScreenPoint();
  const point = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : pointer;
  const display = screen.getDisplayNearestPoint(point);
  const [width, height] = globalWheelWindow.getSize();
  const bounds = display.workArea;
  const left = Math.max(bounds.x, Math.min(point.x - width / 2, bounds.x + bounds.width - width));
  const top = Math.max(bounds.y, Math.min(point.y - height / 2, bounds.y + bounds.height - height));
  globalWheelWindow.setPosition(Math.round(left), Math.round(top), false);
}

function showGlobalWheel(mode, x, y) {
  if (!initialized || !['convert', 'tools', 'actions'].includes(mode)) return;
  const newDrag = !globalWheelRequestedVisible;
  globalWheelPosition = { x, y };
  globalWheelMode = mode;
  globalWheelRequestedVisible = true;
  if (!globalWheelWindow || globalWheelWindow.isDestroyed()) {
    globalWheelWindow = new BrowserWindow({
      width: 420, height: 540, frame: false, transparent: true, backgroundColor: '#00000000',
      resizable: false, movable: false, minimizable: false, maximizable: false,
      focusable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
      webPreferences: {
        preload: path.join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true,
        nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false,
        webviewTag: false, partition: 'santara', navigateOnDragDrop: false,
      },
    });
    const wheelWindow = globalWheelWindow;
    const wheelContents = globalWheelWindow.webContents;
    trustedContents.add(wheelContents);
    globalWheelWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    globalWheelWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    globalWheelWindow.webContents.on('will-redirect', (event) => event.preventDefault());
    globalWheelWindow.once('ready-to-show', () => {
      if (!globalWheelRequestedVisible || wheelWindow.isDestroyed()) return;
      wheelWindow.setAlwaysOnTop(true, 'screen-saver');
      placeWheel(globalWheelPosition?.x, globalWheelPosition?.y);
      wheelWindow.webContents.send('santara:wheel-mode', globalWheelMode, newDrag);
      wheelWindow.showInactive();
    });
    wheelWindow.on('closed', () => {
      trustedContents.delete(wheelContents);
      if (globalWheelWindow === wheelWindow) {
        globalWheelWindow = undefined;
        globalWheelPosition = undefined;
        globalWheelMode = undefined;
        globalWheelRequestedVisible = false;
      }
    });
    const query = { 'santara-wheel': '1', mode };
    const loading = developmentURL ? globalWheelWindow.loadURL(`${developmentURL}/?${new URLSearchParams(query)}`) : globalWheelWindow.loadFile(indexPath, { query });
    loading.catch((error) => console.error('Cannot load global wheel:', error.message));
    return;
  }
  placeWheel(x, y);
  globalWheelWindow.webContents.send('santara:wheel-mode', mode, newDrag);
  if (!globalWheelWindow.isVisible()) globalWheelWindow.showInactive();
}

function hideGlobalWheel({ restoreMain = true } = {}) {
  globalWheelRequestedVisible = false;
  if (globalWheelWindow && !globalWheelWindow.isDestroyed()) globalWheelWindow.hide();
  globalWheelPosition = undefined;
  globalWheelMode = undefined;
  if (mainWindowHiddenForWheel && restoreMain) {
    mainWindowHiddenForWheel = false;
    focusWindow();
  } else if (mainWindowHiddenForWheel) {
    mainWindowHiddenForWheel = false;
  }
}

function openImageToolWindow(context) {
  if (imageToolWindow && !imageToolWindow.isDestroyed()) imageToolWindow.close();
  imageToolContext = context;
  const editor = new BrowserWindow({
    width: 900, height: 700, minWidth: 680, minHeight: 540, show: false,
    title: `Santara · ${context.capability.label}`, backgroundColor: '#f6f5f1',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true,
      nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false, partition: 'santara', navigateOnDragDrop: false,
    },
  });
  imageToolWindow = editor;
  const contents = editor.webContents;
  trustedContents.add(contents);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.on('will-redirect', (event) => event.preventDefault());
  editor.once('ready-to-show', () => { if (!editor.isDestroyed()) editor.show(); });
  editor.on('closed', () => {
    trustedContents.delete(contents);
    if (imageToolWindow === editor) {
      imageToolWindow = undefined;
      imageToolContext = undefined;
    }
  });
  const query = { 'santara-image-tool': '1' };
  const loading = developmentURL ? editor.loadURL(`${developmentURL}/?${new URLSearchParams(query)}`) : editor.loadFile(indexPath, { query });
  loading.catch((error) => console.error('Cannot load image editor:', error.message));
}

function startWindowsWatcher() {
  if (process.platform !== 'win32' || nativeWatcher) return;
  const executable = app.isPackaged
    ? path.join(process.resourcesPath, 'native', 'santara-drag-watcher.exe')
    : path.join(directory, '../native/windows/build/santara-drag-watcher.exe');
  try {
    nativeWatcher = spawn(executable, [], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    createInterface({ input: nativeWatcher.stdout }).on('line', (line) => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'show' || event.type === 'move') showGlobalWheel(event.mode, event.x, event.y);
        else if (event.type === 'hide') hideGlobalWheel();
      } catch (error) { console.error('Invalid drag watcher message:', error.message); }
    });
    nativeWatcher.stderr.on('data', (chunk) => console.error(`[drag watcher] ${String(chunk).trim()}`));
    nativeWatcher.on('error', (error) => { nativeWatcher = undefined; console.error('Global drag watcher unavailable:', error.message); });
    nativeWatcher.on('exit', () => { nativeWatcher = undefined; });
  } catch (error) { console.error('Global drag watcher unavailable:', error.message); }
}

function syncTray() {
  if (tray) return;
  try {
    const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVQ4T2P8z8Dwn4ECwESJ5lEDRg0YNQAAX+0CHvQjZJAAAAAASUVORK5CYII=');
    tray = new Tray(icon);
    tray.setToolTip('Santara — offline converter');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Santara is running', enabled: false }, { type: 'separator' }, { label: 'Quit', click: () => app.quit() }]));
  } catch (error) {
    tray = undefined;
    send({ error: `Tray unavailable: ${error.message}` });
  }
}

function createWindow({ showOnReady = true } = {}) {
  window = new BrowserWindow({
    width: 1280, height: 840, minWidth: 900, minHeight: 620, show: false,
    title: 'Santara', backgroundColor: '#faf9f6', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true,
      nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false, partition: 'santara', navigateOnDragDrop: false,
    },
  });
  const mainWindow = window;
  const mainContents = window.webContents;
  trustedContents.add(mainContents);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-redirect', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => { if (showOnReady && !mainWindow.isDestroyed()) mainWindow.show(); });
  mainWindow.on('close', (event) => {
    if (!quitting && tray && settings.minimizeToTray) { event.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => {
    trustedContents.delete(mainContents);
    if (window === mainWindow) window = undefined;
  });
  const loading = developmentURL ? mainWindow.loadURL(developmentURL) : mainWindow.loadFile(indexPath);
  loading.catch((error) => { console.error('Cannot load Santara:', error.message); dialog.showErrorBox('Santara could not start', error.message); app.quit(); });
}

function validateSender(event) {
  if (!trustedContents.has(event.sender) || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Untrusted IPC sender');
  }
  const frameURL = new URL(event.senderFrame.url);
  if (developmentURL) {
    if (event.senderFrame.origin !== new URL(developmentURL).origin) throw new Error('Untrusted IPC origin');
  } else {
    frameURL.hash = '';
    frameURL.search = '';
    if (frameURL.href !== productionURL) throw new Error('Untrusted IPC document');
  }
}

function handle(name, handler) {
  ipcMain.handle(`santara:${name}`, async (event, ...args) => {
    validateSender(event);
    if (!initialized || quitting) throw new Error(quitting ? 'Santara is shutting down' : 'Santara is starting');
    return handler(...args);
  });
}

function handleFromSender(name, handler) {
  ipcMain.handle(`santara:${name}`, async (event, ...args) => {
    validateSender(event);
    if (!initialized || quitting) throw new Error(quitting ? 'Santara is shutting down' : 'Santara is starting');
    return handler(event, ...args);
  });
}

function jobId(value) {
  if (typeof value !== 'string' || value.length > 200 || !jobs().some((job) => job.id === value)) throw new Error('Unknown job');
  return value;
}

function registerIPC() {
  handle('bootstrap', async () => ({ files, jobs: jobs(), settings, backends, capabilities: await capabilities(), platform: process.platform, persistenceErrors: [...persistenceErrors] }));
  handle('addFiles', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'] });
    return result.canceled ? [] : addPaths(result.filePaths);
  });
  handle('addFolder', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    return result.canceled ? [] : addPaths(result.filePaths, settings.recursive);
  });
  handle('inspectPaths', addPaths);
  handle('droppedPaths', (paths) => addPaths(paths, settings.recursive));
  handle('enqueue', async (request) => {
    plainObject(request);
    const selected = pathList(request.files);
    if (!selected.length) throw new Error('Select input files');
    const inputs = selected.map((input) => {
      const file = files.find((entry) => entry.path === input);
      if (!file) throw new Error('Inspect input files before enqueueing');
      return file;
    }).filter((file) => request.operation === 'create-archive' || !file.isDirectory);
    if (!inputs.length) throw new Error('Choose regular files inside the selected folder to convert');
    for (const key of ['operation', 'format']) {
      if (typeof request[key] !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.+-]{0,63}$/.test(request[key])) throw new TypeError(`Invalid ${key}`);
    }
    const options = safeData(request.options ?? {});
    plainObject(options);
    for (const key of ['outputFolder', 'outputDirectory', 'outputDir']) {
      if (options[key] !== undefined && options[key] !== '') absolutePath(options[key]);
    }
    if (options.outputFolder) options.outputDirectory = options.outputFolder;
    if (typeof options.reencode === 'string') {
      if (!['true', 'false'].includes(options.reencode)) throw new Error('Invalid re-encode preference');
      options.reencode = options.reencode === 'true';
    }
    if (options.inputs !== undefined) throw new TypeError('Merge inputs must come from selected files');
    const result = await engine.enqueue({ files: inputs, operation: request.operation, format: request.format, options });
    updateFromEngine({});
    return result;
  });
  handle('cancel', async (id) => { const result = await engine.cancel(jobId(id)); updateFromEngine({}); return result; });
  handle('retry', async (id) => {
    const validatedId = jobId(id);
    const job = jobs().find((entry) => entry.id === validatedId);
    let options = {};
    if (job.status === 'failed' && /Output exists/i.test(job.error || '')) {
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning', title: 'Output already exists', message: 'Choose how to retry this conversion.',
        detail: `${job.error}\nOriginal files and existing outputs will not be replaced.`,
        buttons: ['Cancel', 'Keep both (auto-rename)', 'Skip'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (response !== 1 && response !== 2) return null;
      if (quitting) return null;
      options = { collision: response === 1 ? 'rename' : 'skip' };
    }
    const result = await engine.retry(validatedId, options);
    updateFromEngine({});
    return result;
  });
  handle('saveSettings', async (patch) => {
    const validated = validateSettings(patch);
    const next = { ...settings, ...validated };
    if (validated.backendOverrides) next.backendPaths = validated.backendOverrides;
    const changingBackends = validated.backendOverrides || validated.backendPaths;
    if (changingBackends && Object.values(changingBackends).some((value) => typeof value === 'string' && value !== '')) {
      const confirmation = await dialog.showMessageBox(window, {
        type: 'warning', title: 'Change conversion backends', message: 'Allow these local programs to run as conversion backends?',
        detail: Object.entries(changingBackends).map(([name, executable]) => `${name}: ${executable || 'Automatic'}`).join('\n'),
        buttons: ['Cancel', 'Allow programs'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (confirmation.response !== 1) return settings;
    }
    const nextBackends = changingBackends ? await detectBackends(backendOverrides(next)) : backends;
    await engine.updateSettings(engineSettings(next));
    settings = next;
    Object.assign(backends, nextBackends);
    await store.write('settings', settings);
    syncTray();
    send({ settings, backends, capabilities: await capabilities() });
    return settings;
  });
  handle('pickOutput', async () => {
    const result = await dialog.showOpenDialog(window, { title: 'Choose output folder', properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled) return null;
    const output = absolutePath(result.filePaths[0]);
    allowed.add(output);
    return output;
  });
  handle('reveal', (value) => { registerPaths(); return revealPath(value, allowed); });
  handle('openOutput', (value) => openOutput(value, outputs()));
  handle('fileAction', async (request) => {
    registerPaths();
    try { return await fileAction(request, { window, allowed, backends }); }
    catch (error) { return { ok: false, reason: error.message }; }
  });
  handle('finishGlobalWheel', async (page = 'converter') => {
    if (!['converter', 'activity', 'background'].includes(page)) throw new Error('Invalid destination page');
    hideGlobalWheel({ restoreMain: false });
    if (page === 'activity' && window && !window.isDestroyed()) window.webContents.send('santara:global-page', page);
  });
  handle('openImageTool', async (request) => {
    plainObject(request);
    if (typeof request.capabilityId !== 'string' || typeof request.format !== 'string') throw new TypeError('Invalid image operation');
    const selected = pathList(request.files);
    const inspected = selected.map((input) => files.find((file) => file.path === input)).filter(Boolean);
    if (!inspected.length || inspected.length !== selected.length || inspected.some((file) => file.isDirectory || file.category !== 'image')) throw new Error('Select inspected image files first');
    const capability = (await capabilities()).find((entry) => entry.id === request.capabilityId && entry.available && entry.category === 'image');
    const operation = capability?.operation || capability?.id.split(':').pop();
    if (!capability || !['compress', 'crop', 'resize', 'rotate', 'flip', 'background', 'edit-image', 'metadata', 'strip-metadata'].includes(operation)) throw new Error('Image tool is unavailable');
    if (!inspected.every((file) => capability.inputs.includes(file.ext))) throw new Error('The selected tool does not support every image');
    const format = request.format || capability.outputs.find((output) => output === inspected[0].ext) || capability.outputs[0];
    if (!capability.outputs.includes(format)) throw new Error('Unsupported image output format');
    const images = await import('./images.mjs');
    const options = Object.fromEntries(Object.entries(normalizeImageOptions(safeData(request.options || {}), images.imageOptionNames)).map(([key, value]) => [key, String(value)]));
    openImageToolWindow({ capability, files: inspected, format, options });
    return { opened: true };
  });
  handleFromSender('imageToolContext', (event) => {
    if (!imageToolWindow || imageToolWindow.isDestroyed() || event.sender !== imageToolWindow.webContents || !imageToolContext) throw new Error('Image editor is no longer available');
    return imageToolContext;
  });
  handleFromSender('applyImageTool', async (event, request) => {
    if (!imageToolWindow || imageToolWindow.isDestroyed() || event.sender !== imageToolWindow.webContents || !imageToolContext) throw new Error('Image editor is no longer available');
    plainObject(request);
    const images = await import('./images.mjs');
    const recipe = normalizeImageOptions(safeData(request.options || {}), images.imageOptionNames);
    const options = {
      quality: settings.quality, stripMetadata: settings.stripMetadata,
      outputFolder: settings.outputFolder, collision: settings.collision,
      ...imageToolContext.options, ...recipe,
    };
    const result = await engine.enqueue({
      files: imageToolContext.files, operation: imageToolContext.capability.operation,
      format: imageToolContext.format, options,
    });
    updateFromEngine();
    imageToolWindow.close();
    return result;
  });
  handleFromSender('closeImageTool', (event) => {
    if (!imageToolWindow || imageToolWindow.isDestroyed() || event.sender !== imageToolWindow.webContents) return false;
    imageToolWindow.close();
    return true;
  });
  handle('selectGlobalOperation', async (request) => {
    plainObject(request);
    if (typeof request.capabilityId !== 'string' || typeof request.format !== 'string') throw new TypeError('Invalid operation');
    const selected = pathList(request.files);
    const inspected = selected.map((input) => files.find((file) => file.path === input)).filter(Boolean);
    if (!inspected.length || inspected.length !== selected.length) throw new Error('Inspect dropped files before selecting an operation');
    const available = (await capabilities()).find((entry) => entry.id === request.capabilityId && entry.available);
    if (!available || !available.inputs.some((input) => input === '*' || inspected.some((file) => input === (file.isDirectory ? 'directory' : file.ext.toLowerCase())))) throw new Error('Operation is not available for this selection');
    if ((available.outputs.length && !available.outputs.includes(request.format)) || (!available.outputs.length && request.format !== '')) throw new Error('Invalid output for this operation');
    if (available.category === 'image' && available.operation !== 'convert') {
      const images = await import('./images.mjs');
      const operationOptions = normalizeImageOptions({}, images.imageOptionNames);
      const target = request.format || inspected[0].ext;
      if (!available.outputs.includes(target)) throw new Error('Unsupported image output format');
      openImageToolWindow({ capability: available, files: inspected.filter((file) => available.inputs.includes(file.ext)), format: target, options: operationOptions });
      hideGlobalWheel({ restoreMain: false });
      return { opened: true };
    }
    hideGlobalWheel({ restoreMain: false });
    if (Notification.isSupported()) new Notification({ title: 'Operation unavailable in wheel mode', body: 'This operation is not implemented in the citrus wheel yet.' }).show();
  });
  handle('preview', async (value) => {
    registerPaths();
    return previews.prepare(absolutePath(value));
  });
  handle('imagePreview', async (request) => {
    plainObject(request);
    const input = absolutePath(request.path);
    if (!allowed.has(input)) throw new Error('Select this image before previewing it');
    if (!['edit-image', 'background', 'crop', 'resize', 'rotate', 'flip', 'compress', 'metadata', 'strip-metadata'].includes(request.operation)) throw new Error('Unsupported image preview operation');
    if (imagePreviewControllers.size >= 2) throw new Error('Preview is busy. Try again in a moment.');
    const controller = new AbortController();
    imagePreviewControllers.add(controller);
    try {
      const images = await import('./images.mjs');
      const options = normalizeImageOptions(safeData(request.options || {}), images.imageOptionNames);
      const preview = await images.previewImage({ input, operation: request.operation, options, signal: controller.signal });
      return { url: preview.dataURL, width: preview.width, height: preview.height };
    } finally { imagePreviewControllers.delete(controller); }
  });
}

function secureSession() {
  const desktopSession = session.fromPartition('santara');
  previews = createPreviewService({ backends, allowed });
  desktopSession.protocol.handle('santara-media', (request) => previews.respond(request));
  desktopSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  desktopSession.setPermissionCheckHandler(() => false);
  desktopSession.on('will-download', (event) => event.preventDefault());
  desktopSession.webRequest.onBeforeRequest((details, callback) => {
    const protocol = new URL(details.url).protocol;
    callback({ cancel: !developmentURL && !['file:', 'data:', 'blob:', 'devtools:', 'santara-media:'].includes(protocol) });
  });
  desktopSession.webRequest.onHeadersReceived((details, callback) => {
    const policy = !developmentURL
      ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: santara-media:; connect-src santara-media:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
      : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: santara-media:; connect-src 'self' santara-media: ws://localhost:* ws://127.0.0.1:*; object-src 'none'; frame-src 'none'";
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] } });
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  queueOpen(process.argv, process.cwd(), true);
  app.on('second-instance', (_event, argv, cwd) => {
    const request = wheelRequest(argv);
    if (request?.mode) {
      if (request.mode === 'hide') hideGlobalWheel();
      else showGlobalWheel(request.mode, request.x, request.y);
      return;
    }
    queueOpen(argv, cwd);
    if (initialized) void drainOpenQueue();
  });
  app.on('window-all-closed', () => { if (!tray) app.quit(); });
  app.on('activate', () => {});
  app.on('before-quit', (event) => {
    nativeWatcher?.kill();
    quitting = true;
    if (!initialized || flushed) return;
    event.preventDefault();
    clearTimeout(persistenceTimer);
    if (shutdown) return;
    const interrupted = jobs();
    shutdown = (async () => {
      await store.write('jobs', interrupted);
      await closeIntegrations();
      for (const controller of imagePreviewControllers) controller.abort();
      await previews?.close();
      for (const job of interrupted.filter((entry) => entry.status === 'queued')) await engine.cancel(job.id);
      for (const job of jobs().filter((entry) => ['preparing', 'processing'].includes(entry.status))) await engine.cancel(job.id);
      while (jobs().some((job) => ['preparing', 'processing'].includes(job.status))) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await store.flush();
      flushed = true;
      app.quit();
    })().catch((error) => {
      console.error('Shutdown could not finish:', error);
      shutdown = undefined;
      dialog.showErrorBox('Santara is still stopping', 'Conversion processes could not be stopped safely. Try quitting again.');
    });
  });
  app.whenReady().then(async () => {
    const saved = await store.read('settings', {});
    try { settings = { ...settings, ...validateSettings(saved) }; } catch (error) { persistenceErrors.push(`Saved settings ignored: ${error.message}`); }
    backends = await detectBackends(backendOverrides(settings));
    engine = createEngine({ onUpdate: updateFromEngine, settings: engineSettings(settings), backends });
    const restored = await store.read('jobs', []);
    if (Array.isArray(restored)) {
      const metadata = restored.filter((job) => job && typeof job.id === 'string' && typeof job.input === 'string' && path.isAbsolute(job.input)).slice(-10000);
      try { await engine.restore(metadata); } catch (error) { persistenceErrors.push(`Could not restore jobs: ${error.message}`); }
    }
    secureSession();
    registerIPC();
    initialized = true;
    const initialWheel = wheelRequest(process.argv);
    const opensWheel = initialWheel && initialWheel.mode !== 'hide';
    mainWindowHiddenForWheel = Boolean(opensWheel);
    createWindow({ showOnReady: false });
    if (opensWheel) showGlobalWheel(initialWheel.mode, initialWheel.x, initialWheel.y);
    startWindowsWatcher();
    syncTray();
    await drainOpenQueue();
  }).catch((error) => { console.error(error); dialog.showErrorBox('Santara could not start', error.message); app.quit(); });
}
