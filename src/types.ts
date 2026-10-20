export type Category = 'image' | 'audio' | 'video' | 'pdf' | 'document' | 'presentation' | 'spreadsheet' | 'subtitle' | 'archive' | 'other';
export interface LocalFile { id: string; path: string; name: string; size: number; ext: string; category: Category; isDirectory?: boolean }
export interface Job { id: string; input: string; name: string; operation: string; format: string; status: string; progress: number; output?: string; error?: string; createdAt: string; options?: Record<string, unknown> }
export interface Capability { id: string; operation?: string; label: string; category: string; inputs: string[]; outputs: string[]; backend: string; available: boolean; batch: boolean; preservesMetadata: boolean; options?: unknown; warning?: string }
export interface Backend { available?: boolean; path?: string; version?: string; error?: string; [key: string]: unknown }
export interface Settings { theme: string; outputFolder: string; collision: string; concurrency: number; quality: number; stripMetadata: boolean; recursive: boolean; preserveStructure: boolean; namingPattern: string; shortcuts: { convert: string; tools: string; actions: string }; backendPaths: Record<string, string>; tray: boolean; [key: string]: unknown }
export interface Snapshot { files: LocalFile[]; jobs: Job[]; settings: Settings; backends: Record<string, Backend>; capabilities: Capability[]; platform: string }
export interface Bridge {
  bootstrap(): Promise<Snapshot>;
  addFiles(): Promise<LocalFile[]>;
  addFolder(): Promise<LocalFile[]>;
  droppedFiles(files: File[]): Promise<LocalFile[]>;
  inspectPaths(paths: string[], recursive?: boolean): Promise<LocalFile[]>;
  enqueue(request: { files: LocalFile[]; operation: string; format: string; options: Record<string, unknown> }): Promise<unknown>;
  cancel(id: string): Promise<unknown>;
  retry(id: string): Promise<unknown>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  pickOutput(): Promise<string | null>;
  reveal(path: string): Promise<unknown>;
  openOutput(path: string): Promise<unknown>;
  fileAction(request: { action: string; files: LocalFile[]; destination?: string }): Promise<unknown>;
  preview?(path: string): Promise<{ url: string; width?: number; height?: number; duration?: number; waveform?: number[]; waveformDuration?: number }>;
  imagePreview?(path: string, operation: string, options: Record<string, string>): Promise<{ url: string; width?: number; height?: number; sourceWidth?: number; sourceHeight?: number }>;
  openImageTool?(request: { capabilityId: string; files: string[]; format: string; options: Record<string, string> }): Promise<unknown>;
  imageToolContext?(): Promise<{ capability: Capability; files: LocalFile[]; format: string; options: Record<string, string> }>;
  applyImageTool?(request: { options: Record<string, string> }): Promise<unknown>;
  closeImageTool?(): Promise<unknown>;
  onWheelMode?(callback: (mode: string, newDrag?: boolean) => void): () => void;
  finishGlobalWheel?(page?: 'converter' | 'activity' | 'background'): Promise<void>;
  selectGlobalOperation?(request: { capabilityId: string; format: string; files: LocalFile[] }): Promise<void>;
  onGlobalOperation?(callback: (request: { capabilityId: string; format: string; files: LocalFile[] }) => void): () => void;
  onGlobalPage?(callback: (page: 'converter' | 'activity') => void): () => void;
  onUpdate(callback: (update: Partial<Snapshot>) => void): () => void;
}
declare global { interface Window { santara?: Bridge } }
