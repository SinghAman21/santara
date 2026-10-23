import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Bridge, LocalFile, Settings, Snapshot } from './types';

export const isTauriRuntime = isTauri();

function subscription<T>(eventName: string, callback: (payload: T) => void): () => void {
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void listen<T>(eventName, event => callback(event.payload)).then(stop => {
    if (disposed) stop();
    else unlisten = stop;
  });
  return () => { disposed = true; unlisten?.(); };
}

export const tauriBridge: Bridge = {
  bootstrap: () => invoke<Snapshot>('bootstrap'),
  addFiles: () => invoke<LocalFile[]>('choose_files'),
  addFolder: () => invoke<LocalFile[]>('choose_folder'),
  // Native drop paths are handed off by the Rust window event bridge in Phase 4.
  droppedFiles: () => invoke<LocalFile[]>('consume_drop'),
  inspectPaths: (paths, recursive = false) => invoke<LocalFile[]>('inspect_paths', { paths, recursive }),
  enqueue: request => invoke('enqueue', { request }),
  cancel: id => invoke('cancel', { id }),
  retry: id => invoke('retry', { id }),
  saveSettings: (patch: Partial<Settings>) => invoke<Settings>('save_settings', { patch }),
  pickOutput: () => invoke<string | null>('pick_output'),
  reveal: path => invoke('reveal', { path }),
  openOutput: path => invoke('open_output', { path }),
  fileAction: request => invoke('file_action', { request }),
  preview: path => invoke('preview', { path }),
  imagePreview: (path, operation, options) => invoke('image_preview', { path, operation, options }),
  openImageTool: request => invoke('open_image_tool', { request }),
  imageToolContext: () => invoke('image_tool_context'),
  applyImageTool: request => invoke('apply_image_tool', { request }),
  closeImageTool: () => invoke('close_image_tool'),
  videoToolContext: () => invoke('video_tool_context'),
  applyVideoTool: request => invoke('apply_video_tool', { request }),
  closeVideoTool: () => invoke('close_video_tool'),
  finishGlobalWheel: async () => { await invoke('shell_hide_wheel'); },
  selectGlobalOperation: request => invoke('select_global_operation', { request }),
  onWheelMode: callback => subscription<{ mode: string; newDrag: boolean }>('santara:wheel-mode', payload => callback(payload.mode, payload.newDrag)),
  onGlobalOperation: callback => subscription('santara:global-operation', callback),
  onGlobalPage: callback => subscription('santara:global-page', callback),
  onUpdate: callback => subscription('santara:update', callback),
  onNativeDrop: callback => subscription<void>('santara:native-drop', () => {
    void invoke<LocalFile[]>('consume_drop').then(callback).catch(error => console.error('Native drop failed:', error));
  }),
};
