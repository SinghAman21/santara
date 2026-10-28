import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, Pause, Play, Plus, RotateCcw, Scissors, Trash2, X } from 'lucide-react';
import type { Capability, LocalFile } from './types';
import { api } from './bridge';

type Mask = { x: number; y: number; width: number; height: number; start: number; end: number; color: string };
type Preview = { url: string; duration?: number; previewDuration?: number; width?: number; height?: number; metadata?: Record<string, unknown> };
type Props = { capability: Capability; files: LocalFile[]; format: string; initialOptions: Record<string, unknown>; onClose: () => void; onApply: (format: string, options: Record<string, unknown>, orderedFiles: string[]) => Promise<unknown> };

const operationTitle: Record<string, string> = {
  compress: 'Compress video', trim: 'Trim video', split: 'Split video', merge: 'Join videos', crop: 'Crop video',
  speed: 'Change speed', snapshot: 'Extract frames', mute: 'Remove audio', redact: 'Redact video',
  'strip-metadata': 'Delete metadata', resize: 'Resize video', rotate: 'Rotate video', flip: 'Flip video',
  gif: 'Create GIF', 'extract-audio': 'Extract audio',
};

const decimal = (value: number) => Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, '') : '0';
const clock = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor(safe / 60) % 60;
  const seconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe % 1) * 100);
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
};

export default function VideoToolWindow({ capability, files: originalFiles, format: initialFormat, initialOptions, onClose, onApply }: Props) {
  const operation = capability.operation || capability.id.split(':').pop() || '';
  const title = operationTitle[operation] || capability.label;
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [files, setFiles] = useState(originalFiles);
  const [format, setFormat] = useState(initialFormat);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [duration, setDuration] = useState(Number(initialOptions.duration) || 0);
  const [playhead, setPlayhead] = useState(0);
  const [bounds, setBounds] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initialOptions).map(([key, value]) => [key, String(value)])));
  const [frames, setFrames] = useState<number[]>([]);
  const [masks, setMasks] = useState<Mask[]>(() => Array.isArray(initialOptions.masks) ? initialOptions.masks as Mask[] : []);

  const file = files[0];
  const outputFormats = capability.outputs;
  const videoWidth = preview?.width || videoRef.current?.videoWidth || 0;
  const videoHeight = preview?.height || videoRef.current?.videoHeight || 0;
  const segmentsText = values.segments ?? `0-${decimal(duration || 5)}`;
  const cropX = values.x === undefined ? 0 : Number(values.x);
  const cropY = values.y === undefined ? 0 : Number(values.y);
  const cropWidth = values.width === undefined ? videoWidth : Number(values.width);
  const cropHeight = values.height === undefined ? videoHeight : Number(values.height);
  const resizeWidth = values.width === undefined ? videoWidth || 1280 : Number(values.width);
  const resizeHeight = values.height === undefined ? videoHeight || 720 : Number(values.height);
  const validSplit = useMemo(() => {
    if (operation !== 'split') return true;
    const segments = segmentsText.split(',').map(part => part.trim());
    let previousEnd = -1;
    return segments.length > 0 && segments.length <= 100 && segments.every(part => {
      const match = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(part);
      if (!match) return false;
      const start = Number(match[1]), end = Number(match[2]);
      const valid = end > start && start >= previousEnd && (!duration || end <= duration + 0.02);
      previousEnd = end;
      return valid;
    });
  }, [duration, operation, segmentsText]);

  useEffect(() => {
    let active = true;
    if (!file || !api.preview) return;
    void api.preview(file.path).then(value => { if (active) { setPreview(value); setPreviewError(''); if (value.duration) setDuration(value.duration); } }).catch(reason => { if (active) setPreviewError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [file?.path]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);

  useEffect(() => {
    const video = videoRef.current;
    const stage = stageRef.current;
    if (!video || !stage) return;
    const update = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const stageRect = stage.getBoundingClientRect();
      const videoRect = video.getBoundingClientRect();
      setBounds({ left: videoRect.left - stageRect.left, top: videoRect.top - stageRect.top, width: videoRect.width, height: videoRect.height });
    };
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    video.addEventListener('loadedmetadata', update);
    update();
    return () => { observer.disconnect(); video.removeEventListener('loadedmetadata', update); };
  }, [preview?.url]);

  function set(key: string, value: string) { setValues(current => ({ ...current, [key]: value })); }
  function seek(value: number) { if (videoRef.current && Number.isFinite(value)) videoRef.current.currentTime = Math.max(0, Math.min(preview?.previewDuration || duration || value, value)); }

  function point(event: PointerEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video || !videoWidth || !videoHeight) return null;
    const rect = video.getBoundingClientRect();
    const x = Math.max(0, Math.min(videoWidth, (event.clientX - rect.left) / rect.width * videoWidth));
    const y = Math.max(0, Math.min(videoHeight, (event.clientY - rect.top) / rect.height * videoHeight));
    return { x: Math.round(x / 2) * 2, y: Math.round(y / 2) * 2 };
  }

  function beginMask(event: PointerEvent<HTMLDivElement>) {
    if (!['crop', 'redact'].includes(operation) || !videoWidth || !videoHeight) return;
    const target = point(event);
    if (!target) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = target;
  }

  function finishMask(event: PointerEvent<HTMLDivElement>) {
    const start = pointerRef.current;
    if (!start) return;
    pointerRef.current = null;
    const end = point(event);
    if (!end) return;
    const rect = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
    if (rect.width < 4 || rect.height < 4) return;
    if (operation === 'crop') {
      set('x', String(rect.x)); set('y', String(rect.y)); set('width', String(rect.width)); set('height', String(rect.height));
    } else if (masks.length < 16) {
      setMasks(current => [...current, { ...rect, start: playhead, end: duration || 604800, color: values.maskColor || '#000000' }]);
    }
  }

  const start = Number(values.start) || 0;
  const end = values.end === undefined ? duration : Number(values.end);
  let validation = '';
  if (!files.length) validation = 'No video file is selected.';
  else if (operation === 'trim' && (!(end > start) || (duration > 0 && end > duration))) validation = 'Choose a valid start and end within the video duration.';
  else if (operation === 'split' && !validSplit) validation = 'Enter valid ordered time ranges within the video duration, such as 0-5, 8-12.';
  else if (operation === 'merge' && files.length < 2) validation = 'Choose at least two video clips to join.';
  else if (operation === 'snapshot' && frames.length === 0) validation = 'Seek to a frame and add it before exporting.';
  else if (operation === 'redact' && masks.length === 0) validation = 'Draw at least one redaction box over the video.';
  else if (operation === 'redact' && masks.some(mask => mask.end <= mask.start || mask.start < 0 || (duration > 0 && mask.end > duration))) validation = 'Each redaction mask needs a valid time range within the video.';
  else if (operation === 'crop' && (!videoWidth || !videoHeight || cropWidth < 2 || cropHeight < 2 || cropWidth % 2 || cropHeight % 2 || cropX < 0 || cropY < 0 || cropX + cropWidth > videoWidth || cropY + cropHeight > videoHeight)) validation = 'Choose an even-sized crop rectangle inside the video frame.';
  else if (operation === 'resize' && (resizeWidth < 2 || resizeHeight < 2 || resizeWidth % 2 || resizeHeight % 2)) validation = 'Choose even output width and height values of at least 2 pixels.';

  async function apply() {
    if (busy || validation) return;
    setBusy(true); setError('');
    try {
      const options: Record<string, unknown> = { quality: Number(values.quality || 75), bitrate: Number(values.bitrate || 128), stripMetadata: values.stripMetadata === 'true' };
      if (operation === 'trim') Object.assign(options, { start, duration: end - start });
      if (operation === 'split') Object.assign(options, { segments: segmentsText });
      if (operation === 'snapshot') Object.assign(options, { times: frames });
      if (operation === 'crop') Object.assign(options, { x: cropX, y: cropY, width: cropWidth, height: cropHeight });
      if (operation === 'resize') Object.assign(options, { width: resizeWidth, height: resizeHeight });
      if (operation === 'speed') Object.assign(options, { factor: Number(values.factor || 1) });
      if (operation === 'rotate') Object.assign(options, { angle: Number(values.angle || 90) });
      if (operation === 'flip') Object.assign(options, { direction: values.direction || 'horizontal' });
      if (operation === 'gif') Object.assign(options, { fps: Number(values.fps || 12), width: Number(values.width || 480) });
      if (operation === 'merge') Object.assign(options, { reencode: values.reencode !== 'false' });
      if (operation === 'redact') Object.assign(options, { masks });
      await onApply(format, options, files.map(item => item.path));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  const selectionStyle = (rectangle: { x: number; y: number; width: number; height: number }): CSSProperties => ({
    left: bounds.left + rectangle.x / (videoWidth || 1) * bounds.width,
    top: bounds.top + rectangle.y / (videoHeight || 1) * bounds.height,
    width: rectangle.width / (videoWidth || 1) * bounds.width,
    height: rectangle.height / (videoHeight || 1) * bounds.height,
  });

  return <main className="video-tool-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="video-tool-window" role="dialog" aria-modal="true" aria-label={title}>
      <header className="video-tool-header"><button className="video-tool-close" aria-label="Close editor" onClick={onClose}><X size={17}/></button><div><span>VIDEO TOOL</span><h2>{title}</h2><p title={files.map(item => item.name).join(', ')}>{files.length > 1 ? `${files.length} clips · ${files[0]?.name || ''}` : file?.name}</p></div><span className="video-tool-format">{format.toUpperCase()}</span></header>
      <div className="video-tool-body">
        <div className="video-tool-main">
          <div className="video-tool-stage" ref={stageRef} onPointerDown={beginMask} onPointerUp={finishMask} onPointerCancel={() => { pointerRef.current = null; }}>
            {preview?.url ? <video ref={videoRef} src={preview.url} playsInline preload="metadata" aria-label={`Local video preview of ${file?.name}`} onLoadedMetadata={event => { const current = event.currentTarget; if (Number.isFinite(current.duration) && !preview.duration) setDuration(current.duration); setPlayhead(current.currentTime); }} onTimeUpdate={event => setPlayhead(event.currentTarget.currentTime)}/> : <div className="video-tool-preview-empty">{previewError || 'Preparing local preview…'}</div>}
            {operation === 'crop' && videoWidth && videoHeight && bounds.width > 0 && <div className="video-tool-box video-tool-crop" style={selectionStyle({ x: cropX, y: cropY, width: cropWidth, height: cropHeight })} aria-label="Crop area"/>}
            {operation === 'redact' && masks.map((mask, index) => <div className="video-tool-box video-tool-mask" key={`${index}-${mask.x}-${mask.y}`} style={{ ...selectionStyle(mask), backgroundColor: mask.color }} aria-label={`Redaction mask ${index + 1}`}>{index + 1}</div>)}
            {preview?.width && preview.height && <span className="video-tool-dimensions">{preview.width} × {preview.height} px</span>}
          </div>
          <div className="video-tool-transport"><button aria-label="Seek backward one second" onClick={() => seek(playhead - 1)}><RotateCcw size={15}/></button><button aria-label="Play video" onClick={() => void videoRef.current?.play()}><Play size={15}/></button><button aria-label="Pause video" onClick={() => videoRef.current?.pause()}><Pause size={15}/></button><span>{clock(playhead)} / {clock(duration)}</span></div>
          <input className="video-tool-seek" aria-label="Video preview timeline" type="range" min="0" max={Math.max(Math.min(duration, preview?.previewDuration || duration), 0.01)} step="0.01" value={Math.min(playhead, preview?.previewDuration || duration || playhead)} onChange={event => seek(Number(event.target.value))} disabled={!duration}/>
          {preview?.previewDuration && <p className="video-tool-fileinfo">Playback previews the first 30 seconds. Time fields can target the full source.</p>}
          <p className="video-tool-fileinfo">{file?.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ''}{preview?.width && preview.height ? ` · ${preview.width} × ${preview.height}` : ''}{duration ? ` · ${clock(duration)}` : ''}</p>
        </div>
        <div className="video-tool-controls">
          <div className="video-tool-section-title">Operation settings</div>
          {outputFormats.length > 1 && <label className="video-tool-field">Output format<select aria-label="Output format" value={format} onChange={event => setFormat(event.target.value)}>{outputFormats.map(output => <option key={output} value={output}>{output.toUpperCase()}</option>)}</select></label>}
          {operation === 'compress' && <><p className="video-tool-note">Re-encodes the video locally. Compression may increase file size; the source is kept untouched.</p><label className="video-tool-slider">Video quality <b>{values.quality || '75'}</b><input aria-label="Video quality" type="range" min="1" max="100" value={values.quality || '75'} onChange={event => set('quality', event.target.value)}/></label><label className="video-tool-field">Audio bitrate (kbps)<input aria-label="Audio bitrate" type="number" min="16" max="512" step="16" value={values.bitrate || '128'} onChange={event => set('bitrate', event.target.value)}/></label></>}
          {operation === 'trim' && <><p className="video-tool-note">Drag the playhead to inspect, then enter an exact range. Export is re-encoded for accurate boundaries.</p><div className="video-tool-grid"><label className="video-tool-field">Start (seconds)<input aria-label="Start time (seconds)" type="number" min="0" max={duration || 604800} step="0.01" value={values.start ?? '0'} onChange={event => set('start', event.target.value)}/></label><label className="video-tool-field">End (seconds)<input aria-label="End time (seconds)" type="number" min="0" max={duration || 604800} step="0.01" value={values.end ?? String(duration || 10)} onChange={event => set('end', event.target.value)}/></label></div><div className="video-tool-range-actions"><button onClick={() => set('start', decimal(playhead))}>Set start to playhead</button><button onClick={() => set('end', decimal(playhead))}>Set end to playhead</button></div></>}
          {operation === 'split' && <><p className="video-tool-note">Enter each start–end range in seconds. Each range exports as a numbered clip.</p><label className="video-tool-field">Segments (seconds)<textarea aria-label="Segments (seconds)" rows={4} value={segmentsText} onChange={event => set('segments', event.target.value)}/></label><div className="video-tool-range-actions"><button onClick={() => set('segments', `${segmentsText ? `${segmentsText}, ` : ''}${decimal(playhead)}-${decimal(Math.min(duration || playhead + 5, playhead + 5))}`)}><Plus size={13}/> Add segment at playhead</button></div></>}
          {operation === 'crop' && <><p className="video-tool-note">Drag on the frame to set a crop. Width and height must be even for common video codecs.</p><div className="video-tool-grid">{[['x','Left (px)'],['y','Top (px)'],['width','Width (px)'],['height','Height (px)']].map(([key,label]) => <label className="video-tool-field" key={key}>{label}<input aria-label={label} type="number" min="0" step="2" value={values[key] || (key === 'width' ? String(videoWidth) : key === 'height' ? String(videoHeight) : '0')} onChange={event => set(key, event.target.value)}/></label>)}</div></>}
          {operation === 'resize' && <><div className="video-tool-grid"><label className="video-tool-field">Width (px)<input aria-label="Width (px)" type="number" min="2" max="16384" step="2" value={values.width || String(videoWidth || 1280)} onChange={event => set('width', event.target.value)}/></label><label className="video-tool-field">Height (px)<input aria-label="Height (px)" type="number" min="2" max="16384" step="2" value={values.height || String(videoHeight || 720)} onChange={event => set('height', event.target.value)}/></label></div><p className="video-tool-note">Resizing re-encodes the video and can change its quality.</p></>}
          {operation === 'rotate' && <label className="video-tool-field">Rotation<select aria-label="Rotation" value={values.angle || '90'} onChange={event => set('angle', event.target.value)}><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">90° counterclockwise</option></select></label>}
          {operation === 'flip' && <label className="video-tool-field">Direction<select aria-label="Direction" value={values.direction || 'horizontal'} onChange={event => set('direction', event.target.value)}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>}
          {operation === 'speed' && <><label className="video-tool-slider">Playback speed <b>{values.factor || '1'}×</b><input aria-label="Playback speed" type="range" min="0.25" max="4" step="0.05" value={values.factor || '1'} onChange={event => set('factor', event.target.value)}/></label><div className="video-tool-presets">{[0.5, 1, 1.5, 2, 4].map(factor => <button className={Number(values.factor || 1) === factor ? 'selected' : ''} key={factor} onClick={() => set('factor', String(factor))}>{factor}×</button>)}</div><p className="video-tool-note">The export is re-encoded. Audio pitch correction is not currently offered; audio tempo changes with the clip.</p></>}
          {operation === 'gif' && <><p className="video-tool-note">Creates a silent animated GIF. High resolutions and frame rates can produce large files.</p><div className="video-tool-grid"><label className="video-tool-field">Width (px)<input aria-label="Width (px)" type="number" min="2" max="2048" step="2" value={values.width || '480'} onChange={event => set('width', event.target.value)}/></label><label className="video-tool-field">Frames per second<input aria-label="Frames per second" type="number" min="1" max="60" value={values.fps || '12'} onChange={event => set('fps', event.target.value)}/></label></div></>}
          {operation === 'extract-audio' && <p className="video-tool-note">Exports the first audio stream only. Select an available audio format above.</p>}
          {operation === 'mute' && <p className="video-tool-note">Removes the audio stream from a new video copy. This is not a playback-only mute.</p>}
          {operation === 'snapshot' && <><p className="video-tool-note">Seek to a frame and add it. Selected frames export at source resolution as PNG copies.</p><div className="video-tool-range-actions"><button onClick={() => setFrames(current => current.includes(playhead) ? current : [...current, playhead].sort((a,b) => a-b))}><Plus size={13}/> Add frame at {clock(playhead)}</button></div><div className="video-tool-frame-list">{frames.map((time,index) => <div key={`${time}-${index}`}><button aria-label={`Seek to frame ${index + 1}`} onClick={() => seek(time)}>{clock(time)}</button><button aria-label={`Remove frame ${index + 1}`} onClick={() => setFrames(current => current.filter((_,position) => position !== index))}><Trash2 size={13}/></button></div>)}</div></>}
          {operation === 'merge' && <><p className="video-tool-note">Clips are joined in this order. Santra validates stream compatibility before export; re-encoding is enabled by default.</p><label className="video-tool-check"><input type="checkbox" checked={values.reencode !== 'false'} onChange={event => set('reencode', String(event.target.checked))}/> Re-encode clips for compatibility</label><ol className="video-tool-clip-list">{files.map((clip,index) => <li key={clip.path}><span>{index + 1}. {clip.name}</span><div><button aria-label={`Move ${clip.name} up`} disabled={index === 0} onClick={() => setFiles(current => { const next=[...current]; [next[index-1],next[index]]=[next[index],next[index-1]]; return next; })}><ArrowUp size={14}/></button><button aria-label={`Move ${clip.name} down`} disabled={index === files.length-1} onClick={() => setFiles(current => { const next=[...current]; [next[index+1],next[index]]=[next[index],next[index+1]]; return next; })}><ArrowDown size={14}/></button></div></li>)}</ol></>}
          {operation === 'redact' && <><p className="video-tool-note">Draw solid masks over the preview. Masks use fixed frame coordinates—not motion tracking. A moving subject can leave the covered area.</p><div className="video-tool-mask-list">{masks.map((mask,index) => <div key={`${index}-${mask.x}-${mask.y}`}><span>Mask {index+1} · {mask.width}×{mask.height}</span><label>From<input aria-label={`Mask ${index+1} start`} type="number" min="0" max={duration || 604800} step="0.01" value={mask.start} onChange={event => setMasks(current => current.map((item,position) => position===index ? {...item,start:Number(event.target.value)} : item))}/></label><label>To<input aria-label={`Mask ${index+1} end`} type="number" min="0" max={duration || 604800} step="0.01" value={mask.end} onChange={event => setMasks(current => current.map((item,position) => position===index ? {...item,end:Number(event.target.value)} : item))}/></label><button aria-label={`Remove mask ${index+1}`} onClick={() => setMasks(current => current.filter((_,position) => position!==index))}><Trash2 size={13}/></button></div>)}</div><label className="video-tool-field">New mask color<input aria-label="New mask color" type="color" value={values.maskColor || '#000000'} onChange={event => set('maskColor', event.target.value)}/></label></>}
          {operation === 'strip-metadata' && <><p className="video-tool-note">Review locally detected stream details, then save a new copy with copied metadata and chapters removed. Encoder-generated tags may remain.</p><div className="video-tool-metadata">{preview?.metadata ? Object.entries(preview.metadata).map(([key,value]) => <div key={key}><span>{key}</span><b>{String(value)}</b></div>) : <span>{previewError || 'Metadata details are unavailable until the preview is inspected.'}</span>}</div></>}
          {operation === 'compress' && <label className="video-tool-check"><input type="checkbox" checked={values.stripMetadata === 'true'} onChange={event => set('stripMetadata', String(event.target.checked))}/> Remove copied metadata</label>}
          {capability.warning && <p className="video-tool-warning">{capability.warning}</p>}
        </div>
      </div>
      <footer className="video-tool-footer"><span>{validation || error || 'The original is kept. Output is processed locally.'}</span><div><button className="video-tool-cancel" onClick={onClose}>Cancel</button><button className="video-tool-apply" disabled={busy || Boolean(validation)} onClick={() => void apply()}>{busy ? 'Queueing…' : <><Scissors size={14}/> Save new copy</>}</button></div></footer>
    </section>
  </main>;
}
