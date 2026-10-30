export type Mask = { x: number; y: number; width: number; height: number; start: number; end: number; color: string };
export type Preview = { url: string; duration?: number; previewDuration?: number; width?: number; height?: number; metadata?: Record<string, unknown> };
export const decimal = (value: number) => Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, '') : '0';
export const clock = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor(safe / 60) % 60;
  const seconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe % 1) * 100);
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
};

