import { categoryForExtension } from './file-kind';
import type { Bridge, LocalFile, Settings, Snapshot } from './types';
import { isTauriRuntime, tauriBridge } from './tauri-bridge';
export const defaultSettings: Settings = { theme: 'light', outputFolder: '', collision: 'rename', concurrency: 2, quality: 85, stripMetadata: false, recursive: false, preserveStructure: false, namingPattern: '{name}-converted', shortcuts: { convert: 'Shift', tools: 'Alt', actions: 'Control' }, backendPaths: {}, tray: false };
export const isDesktop = !!window.santra || isTauriRuntime;
let browserSettings = { ...defaultSettings };
try { browserSettings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('santra-preview-settings') || '{}') }; } catch {}
const initial: Snapshot = { files: [], jobs: [], settings: browserSettings, backends: {}, capabilities: [], platform: 'browser' };
const unavailable = async (): Promise<never> => { throw new Error('Launch the Santra desktop app to use local conversion engines and native file actions. No files have been uploaded.'); };
function browserFiles(files: File[]): LocalFile[] { return files.map(file => { const ext = file.name.split('.').pop()?.toLowerCase() || ''; return { id: crypto.randomUUID(), path: file.name, name: file.name, size: file.size, ext, category: categoryForExtension(ext) }; }); }
function chooseFiles(folder = false): Promise<LocalFile[]> { return new Promise(resolve => { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; if (folder) input.setAttribute('webkitdirectory', ''); input.onchange = () => resolve(browserFiles(Array.from(input.files || []))); input.addEventListener('cancel', () => resolve([])); input.click(); }); }
const browserBridge: Bridge = { bootstrap: async () => initial, addFiles: () => chooseFiles(), addFolder: () => chooseFiles(true), droppedFiles: async files => browserFiles(files), inspectPaths: unavailable, enqueue: unavailable, cancel: unavailable, retry: unavailable, saveSettings: async patch => { browserSettings = { ...browserSettings, ...patch }; localStorage.setItem('santra-preview-settings', JSON.stringify(browserSettings)); return browserSettings; }, pickOutput: unavailable, reveal: unavailable, openOutput: unavailable, fileAction: unavailable, onUpdate: () => () => {} };
export const api: Bridge = window.santra || (isTauriRuntime ? tauriBridge : browserBridge);
