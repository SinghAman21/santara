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
  onUpdate: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Expected a callback');
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('santara:update', listener);
    return () => ipcRenderer.removeListener('santara:update', listener);
  },
}));
