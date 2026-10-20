const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (method, ...args) => ipcRenderer.invoke(`santara:${method}`, ...args);

contextBridge.exposeInMainWorld('santara', Object.freeze({
  bootstrap: () => invoke('bootstrap'),
  addFiles: () => invoke('addFiles'),
  addFolder: () => invoke('addFolder'),
  inspectPaths: (paths, recursive = false) => invoke('inspectPaths', paths, recursive),
  droppedFiles: (files) => {
    const paths = Array.from(files).slice(0, 1000).map((file) => webUtils.getPathForFile(file)).filter(Boolean);
    return invoke('droppedPaths', paths);
  },
  enqueue: (request) => invoke('enqueue', request),
  cancel: (id) => invoke('cancel', id),
  retry: (id) => invoke('retry', id),
  saveSettings: (patch) => invoke('saveSettings', patch),
  pickOutput: () => invoke('pickOutput'),
  reveal: (path) => invoke('reveal', path),
  openOutput: (path) => invoke('openOutput', path),
  fileAction: (request) => invoke('fileAction', request),
  preview: (path) => invoke('preview', path),
  imagePreview: (path, operation, options) => invoke('imagePreview', { path, operation, options }),
  finishGlobalWheel: (page = 'converter') => invoke('finishGlobalWheel', page),
  selectGlobalOperation: (request) => invoke('selectGlobalOperation', request),
  onWheelMode: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Expected a callback');
    const listener = (_event, mode, newDrag) => callback(mode, newDrag === true);
    ipcRenderer.on('santara:wheel-mode', listener);
    return () => ipcRenderer.removeListener('santara:wheel-mode', listener);
  },
  onGlobalOperation: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Expected a callback');
    const listener = (_event, request) => callback(request);
    ipcRenderer.on('santara:global-operation', listener);
    return () => ipcRenderer.removeListener('santara:global-operation', listener);
  },
  onGlobalPage: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Expected a callback');
    const listener = (_event, page) => callback(page);
    ipcRenderer.on('santara:global-page', listener);
    return () => ipcRenderer.removeListener('santara:global-page', listener);
  },
  onUpdate: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Expected a callback');
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('santara:update', listener);
    return () => ipcRenderer.removeListener('santara:update', listener);
  },
}));
