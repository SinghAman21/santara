import type { Bridge, LocalFile, Settings, Snapshot } from './types';
export const defaultSettings: Settings = { theme: 'system', outputFolder: '', collision: 'rename', concurrency: 2, quality: 85, stripMetadata: false, recursive: false, preserveStructure: false, namingPattern: '{name}-converted', shortcuts: { convert: 'Shift', tools: 'Alt', actions: 'Control' }, backendPaths: {}, tray: false };
export const isDesktop = !!window.santara;
const category = (ext: string): LocalFile['category'] => {
  if ('jpg jpeg png webp heic tiff tif avif bmp svg'.split(' ').includes(ext)) return 'image';
  if ('mp3 m4a wav flac ogg opus aiff wma'.split(' ').includes(ext)) return 'audio';
  if ('mp4 mov mkv webm avi wmv gif'.split(' ').includes(ext)) return 'video';
  if (ext === 'pdf') return 'pdf';
  if ('srt vtt'.split(' ').includes(ext)) return 'subtitle';
  if ('zip tar gz rar'.split(' ').includes(ext)) return 'archive';
  if ('xlsx ods csv tsv xls'.split(' ').includes(ext)) return 'spreadsheet';
  if ('ppt pptx'.split(' ').includes(ext)) return 'presentation';
  if ('docx md txt epub rtf html'.split(' ').includes(ext)) return 'document';
  return 'other';
};
let browserSettings = { ...defaultSettings };
try { browserSettings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('santara-preview-settings') || '{}') }; } catch {}
const initial: Snapshot = { files: [], jobs: [], settings: browserSettings, backends: {}, capabilities: [], platform: 'browser' };
const unavailable = async (): Promise<never> => { throw new Error('Launch the Santara desktop app to use local conversion engines and native file actions. No files have been uploaded.'); };
function browserFiles(files: File[]): LocalFile[] { return files.map(file => { const ext = file.name.split('.').pop()?.toLowerCase() || ''; return { id: crypto.randomUUID(), path: file.name, name: file.name, size: file.size, ext, category: category(ext) }; }); }
function chooseFiles(folder = false): Promise<LocalFile[]> { return new Promise(resolve => { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; if (folder) input.setAttribute('webkitdirectory', ''); input.onchange = () => resolve(browserFiles(Array.from(input.files || []))); input.addEventListener('cancel', () => resolve([])); input.click(); }); }
const browserBridge: Bridge = { bootstrap: async () => initial, addFiles: () => chooseFiles(), addFolder: () => chooseFiles(true), droppedFiles: async files => browserFiles(files), inspectPaths: unavailable, enqueue: unavailable, cancel: unavailable, retry: unavailable, saveSettings: async patch => { browserSettings = { ...browserSettings, ...patch }; localStorage.setItem('santara-preview-settings', JSON.stringify(browserSettings)); return browserSettings; }, pickOutput: unavailable, reveal: unavailable, openOutput: unavailable, fileAction: unavailable, onUpdate: () => () => {} };
export const api: Bridge = window.santara || browserBridge;
