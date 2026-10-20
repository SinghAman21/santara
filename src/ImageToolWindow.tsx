import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, RotateCcw, RotateCw, X } from 'lucide-react';
import type { Capability, LocalFile } from './types';
import { api, isDesktop } from './bridge';
import './image-tool-window.css';

type Props = {
  capability: Capability;
  file: LocalFile;
  format: string;
  initialOptions: Record<string, string>;
  onClose: () => void;
  onApply: (options: Record<string, string>) => void;
};

const labels: Record<string, string> = {
  'edit-image': 'Edit photo', background: 'Add background', crop: 'Crop image', resize: 'Resize image',
  rotate: 'Rotate image', flip: 'Flip image', compress: 'Compress', 'strip-metadata': 'Strip metadata',
};
const presets = ['Free', '1:1', '4:3', '16:9', '3:2'];
const ratios: Record<string, number> = { '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9, '3:2': 3 / 2 };

function Field({ label, value, onChange, min = 0, max = 16384 }: { label: string; value: string; onChange: (value: string) => void; min?: number; max?: number }) {
  return <label className="image-tool-field"><span>{label}</span><input type="number" min={min} max={max} value={value} onChange={event => onChange(event.target.value)}/></label>;
}

function Slider({ label, value, min, max, step = 0.05, onChange }: { label: string; value: string; min: number; max: number; step?: number; onChange: (value: string) => void }) {
  const number = Number(value);
  return <label className="image-tool-slider"><span>{label}<b>{Number.isFinite(number) ? number.toFixed(step < 1 ? 2 : 0) : value}</b></span><input type="range" min={min} max={max} step={step} value={Number.isFinite(number) ? number : 1} onChange={event => onChange(event.target.value)}/></label>;
}

export default function ImageToolWindow({ capability, file, format, initialOptions, onClose, onApply }: Props) {
  const windowRef = useRef<HTMLElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const previewImageRef = useRef<HTMLImageElement>(null);
  const cropDragRef = useRef<{ mode: 'draw' | 'move' | 'resize'; handle?: string; startX: number; startY: number; x: number; y: number; width: number; height: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const operation = capability.operation || capability.id.split(':').pop() || '';
  const [values, setValues] = useState<Record<string, string>>(() => ({ quality: '85', brightness: '1', saturation: '1', contrast: '1', width: '', height: '', x: '0', y: '0', angle: operation === 'rotate' ? '90' : '0', direction: 'horizontal', backgroundType: 'solid', backgroundColor: '#fff4e8', backgroundColor2: '#e69b73', padding: '48', fit: operation === 'background' ? 'contain' : 'inside', stripMetadata: operation === 'strip-metadata' ? 'true' : 'false', ...initialOptions }));
  const [preview, setPreview] = useState<{ url: string; width?: number; height?: number } | null>(null);
  const originalDimensions = useRef<{ width: number; height: number } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [ratio, setRatio] = useState('Free');
  const [previewBounds, setPreviewBounds] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const title = labels[operation] || capability.label;
  const set = (key: string, value: string) => setValues(previous => ({ ...previous, [key]: value }));
  const recipe = useMemo(() => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '')), [values]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = windowRef.current;
    panel?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const elements = panel?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); previous?.focus(); };
  }, []);

  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(async () => {
      if (!isDesktop || !api.imagePreview) { setPreview(null); setPreviewError('Live image previews are available in the Santara desktop app.'); return; }
      setBusy(true); setPreviewError('');
      try {
        const previewOperation = operation === 'crop' || (operation === 'resize' && !recipe.width && !recipe.height) ? 'edit-image' : operation;
        const result = await api.imagePreview(file.path, previewOperation, recipe);
        if (current) {
          setPreview(result);
          if (!originalDimensions.current && result.width && result.height) originalDimensions.current = { width: result.width, height: result.height };
        }
      } catch (error) { if (current) setPreviewError(error instanceof Error ? error.message : String(error)); }
      finally { if (current) setBusy(false); }
    }, 180);
    return () => { current = false; window.clearTimeout(timer); };
  }, [file.path, operation, recipe]);

  useEffect(() => {
    const wrap = previewWrapRef.current;
    const image = previewImageRef.current;
    if (!wrap || !image || operation !== 'crop') { setPreviewBounds({ left: 0, top: 0, width: 0, height: 0 }); return; }
    const update = () => {
      const wrapRect = wrap.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      setPreviewBounds({ left: imageRect.left - wrapRect.left, top: imageRect.top - wrapRect.top, width: imageRect.width, height: imageRect.height });
    };
    const observer = new ResizeObserver(update);
    observer.observe(wrap);
    observer.observe(image);
    image.addEventListener('load', update);
    update();
    return () => { observer.disconnect(); image.removeEventListener('load', update); };
  }, [operation, preview?.url]);

  useEffect(() => {
    if (operation !== 'resize' || !preview?.width || !preview.height) return;
    setValues(previous => previous.width && previous.height ? previous : { ...previous, width: previous.width || String(preview.width), height: previous.height || String(preview.height) });
  }, [operation, preview?.width, preview?.height]);

  function setCropRatio(value: string) {
    setRatio(value);
    const dimensions = originalDimensions.current || (preview?.width && preview.height ? { width: preview.width, height: preview.height } : null);
    if (value === 'Free' || !ratios[value] || !dimensions) return;
    const target = ratios[value];
    const imageRatio = dimensions.width / dimensions.height;
    const width = imageRatio > target ? Math.round(dimensions.height * target) : dimensions.width;
    const height = imageRatio > target ? dimensions.height : Math.round(dimensions.width / target);
    setValues(previous => ({ ...previous, x: String(Math.max(0, Math.round((dimensions.width - width) / 2))), y: String(Math.max(0, Math.round((dimensions.height - height) / 2))), width: String(width), height: String(height) }));
  }

  function cropPoint(event: ReactPointerEvent<HTMLDivElement>) {
    const image = previewImageRef.current;
    const dimensions = originalDimensions.current;
    if (!image || !dimensions) return { x: 0, y: 0 };
    const rect = image.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(dimensions.width, Math.round((event.clientX - rect.left) / rect.width * dimensions.width))),
      y: Math.max(0, Math.min(dimensions.height, Math.round((event.clientY - rect.top) / rect.height * dimensions.height))),
    };
  }

  function beginCrop(event: ReactPointerEvent<HTMLDivElement>) {
    if (operation !== 'crop' || !originalDimensions.current) return;
    event.preventDefault();
    const point = cropPoint(event);
    const dimensions = originalDimensions.current;
    const current = { x: Number(values.x) || 0, y: Number(values.y) || 0, width: Number(values.width) || dimensions.width, height: Number(values.height) || dimensions.height };
    const handle = (event.target as HTMLElement).dataset.cropHandle;
    const hasExplicitCrop = Boolean(values.width && values.height);
    const inside = hasExplicitCrop && point.x >= current.x && point.x <= current.x + current.width && point.y >= current.y && point.y <= current.y + current.height;
    cropDragRef.current = { mode: handle ? 'resize' : inside ? 'move' : 'draw', handle, startX: point.x, startY: point.y, ...current };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!handle && !inside) setValues(previous => ({ ...previous, x: String(point.x), y: String(point.y), width: '1', height: '1' }));
  }

  function moveCrop(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = cropDragRef.current;
    const dimensions = originalDimensions.current;
    if (!drag || !dimensions) return;
    const point = cropPoint(event);
    const dx = point.x - drag.startX, dy = point.y - drag.startY;
    let { x, y, width, height } = drag;
    if (drag.mode === 'move') {
      x = Math.max(0, Math.min(dimensions.width - width, x + dx));
      y = Math.max(0, Math.min(dimensions.height - height, y + dy));
    } else if (drag.mode === 'draw') {
      x = Math.min(drag.startX, point.x); y = Math.min(drag.startY, point.y);
      width = Math.max(1, Math.abs(dx)); height = Math.max(1, Math.abs(dy));
    } else {
      if (drag.handle?.includes('w')) { x = Math.max(0, Math.min(drag.x + drag.width - 1, drag.x + dx)); width = drag.x + drag.width - x; }
      if (drag.handle?.includes('e')) width = Math.max(1, Math.min(dimensions.width - drag.x, drag.width + dx));
      if (drag.handle?.includes('n')) { y = Math.max(0, Math.min(drag.y + drag.height - 1, drag.y + dy)); height = drag.y + drag.height - y; }
      if (drag.handle?.includes('s')) height = Math.max(1, Math.min(dimensions.height - drag.y, drag.height + dy));
    }
    setValues(previous => ({ ...previous, x: String(Math.round(x)), y: String(Math.round(y)), width: String(Math.round(width)), height: String(Math.round(height)) }));
    setRatio('Free');
  }

  return <div className="image-tool-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={windowRef} className="image-tool-window" role="dialog" aria-modal="true" aria-label={title}>
      <header className="image-tool-header"><button className="image-tool-close" aria-label="Close editor" onClick={onClose}><X size={17}/></button><div><span>IMAGE TOOL</span><h2>{title}</h2><p title={file.name}>{file.name}</p></div><span className="image-tool-format">{format.toUpperCase()}</span></header>
      <div className="image-tool-body">
        <div className="image-tool-preview-wrap" ref={previewWrapRef}>
          {preview?.url ? <img ref={previewImageRef} className="image-tool-preview" src={preview.url} alt={`Local preview of ${file.name}`}/> : <div className="image-tool-preview-empty"><span>{busy ? 'Updating preview…' : 'Local preview'}</span>{previewError && <small>{previewError}</small>}</div>}
          {operation === 'crop' && preview?.url && originalDimensions.current && previewBounds.width > 0 && <div className="image-tool-crop-overlay" role="group" aria-label="Crop selection" style={{ left: previewBounds.left, top: previewBounds.top, width: previewBounds.width, height: previewBounds.height }} onPointerDown={beginCrop} onPointerMove={moveCrop} onPointerUp={() => { cropDragRef.current = null; }} onPointerCancel={() => { cropDragRef.current = null; }}>
            <div className="image-tool-crop-selection" style={{ left: `${(Number(values.x) || 0) / originalDimensions.current.width * 100}%`, top: `${(Number(values.y) || 0) / originalDimensions.current.height * 100}%`, width: `${(Number(values.width) || originalDimensions.current.width) / originalDimensions.current.width * 100}%`, height: `${(Number(values.height) || originalDimensions.current.height) / originalDimensions.current.height * 100}%` }}>
              {['nw', 'ne', 'sw', 'se'].map(handle => <span key={handle} data-crop-handle={handle} className={`crop-handle ${handle}`} aria-hidden="true"/>)}
            </div>
          </div>}
          {preview?.width && preview.height && <span className="image-tool-dimensions">{preview.width} × {preview.height} px</span>}
        </div>
        <div className="image-tool-controls">
          {operation === 'crop' && <><div className="image-tool-section-title">Aspect ratio</div><div className="image-tool-presets">{presets.map(item => <button key={item} className={ratio === item ? 'selected' : ''} onClick={() => setCropRatio(item)}>{item}</button>)}</div><div className="image-tool-field-grid"><Field label="Left" value={values.x} onChange={value => set('x', value)}/><Field label="Top" value={values.y} onChange={value => set('y', value)}/><Field label="Width" value={values.width || String(preview?.width || '')} onChange={value => { set('width', value); setRatio('Free'); }}/><Field label="Height" value={values.height || String(preview?.height || '')} onChange={value => { set('height', value); setRatio('Free'); }}/></div><p className="image-tool-hint">Coordinates use the auto-oriented image. Choose a preset to center the crop.</p></>}
          {operation === 'resize' && <><div className="image-tool-section-title">Output dimensions</div><div className="image-tool-field-grid"><Field label="Width (px)" value={values.width || String(preview?.width || '')} onChange={value => set('width', value)} min={1}/><Field label="Height (px)" value={values.height || String(preview?.height || '')} onChange={value => set('height', value)} min={1}/></div><label className="image-tool-select">Fit mode<select value={values.fit} onChange={event => set('fit', event.target.value)}><option value="inside">Fit inside</option><option value="cover">Fill and crop</option><option value="fill">Stretch</option></select></label></>}
          {operation === 'rotate' && <><div className="image-tool-section-title">Rotation</div><div className="image-tool-rotate-buttons"><button onClick={() => set('angle', String(Number(values.angle || 0) - 90))}><RotateCcw size={17}/> 90° left</button><button onClick={() => set('angle', String(Number(values.angle || 0) + 90))}><RotateCw size={17}/> 90° right</button></div><Slider label="Angle" min={-180} max={180} step={1} value={values.angle} onChange={value => set('angle', value)}/></>}
          {operation === 'flip' && <><div className="image-tool-section-title">Flip direction</div><label className="image-tool-select">Direction<select value={values.direction} onChange={event => set('direction', event.target.value)}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label></>}
          {operation === 'background' && <><div className="image-tool-section-title">Canvas and background</div><div className="image-tool-field-grid"><Field label="Canvas width" value={values.width || String(preview?.width || '')} onChange={value => setValues(previous => ({ ...previous, width: value, height: previous.height || String(Math.max(1, (preview?.height || 1) - Number(previous.padding || 0) * 2)) }))} min={1}/><Field label="Canvas height" value={values.height || String(preview?.height || '')} onChange={value => setValues(previous => ({ ...previous, height: value, width: previous.width || String(Math.max(1, (preview?.width || 1) - Number(previous.padding || 0) * 2)) }))} min={1}/><Field label="Padding" value={values.padding} onChange={value => set('padding', value)}/></div><label className="image-tool-select">Background<select value={values.backgroundType} onChange={event => set('backgroundType', event.target.value)}><option value="solid">Solid color</option><option value="gradient">Gradient</option><option value="transparent">Transparent</option></select></label>{values.backgroundType !== 'transparent' && <><div className="image-tool-color-row"><label>Color<input type="color" value={values.backgroundColor} onChange={event => set('backgroundColor', event.target.value)}/></label>{values.backgroundType === 'gradient' && <label>Second color<input type="color" value={values.backgroundColor2} onChange={event => set('backgroundColor2', event.target.value)}/></label>}</div><div className="image-tool-swatches" aria-label="Background color presets">{['#fff4e8', '#f4d6be', '#ffd166', '#ef8354', '#6cc4b8', '#94a8ff', '#ffffff', '#242424'].map(color => <button key={color} aria-label={`Choose ${color} background`} title={color} style={{ background: color }} onClick={() => set('backgroundColor', color)}/>)}</div></>}<label className="image-tool-select">Image fit<select value={values.fit} onChange={event => set('fit', event.target.value)}><option value="contain">Contain on canvas</option><option value="cover">Cover canvas</option><option value="fill">Stretch to canvas</option></select></label></>}
          {operation === 'edit-image' && <><div className="image-tool-section-title">Adjustments</div><Slider label="Brightness" min={0} max={2} value={values.brightness} onChange={value => set('brightness', value)}/><Slider label="Contrast" min={0} max={2} value={values.contrast} onChange={value => set('contrast', value)}/><Slider label="Saturation" min={0} max={2} value={values.saturation} onChange={value => set('saturation', value)}/><p className="image-tool-hint">Changes stay in this recipe until you save a copy.</p></>}
          {operation === 'compress' && <><div className="image-tool-section-title">Compression</div><p className="image-tool-hint">Original size · {(file.size / 1024 / 1024).toFixed(2)} MB · {preview?.width || '—'} × {preview?.height || '—'} px</p><div className="image-tool-presets"><button className={Number(values.quality) >= 75 ? 'selected' : ''} onClick={() => set('quality', '82')}>Balanced</button><button className={Number(values.quality) < 75 ? 'selected' : ''} onClick={() => set('quality', '58')}>Strong</button></div><Slider label="Quality" min={1} max={100} step={1} value={values.quality} onChange={value => set('quality', value)}/><p className="image-tool-hint">Lower quality usually makes a smaller file. The original stays untouched.</p></>}
          {operation === 'strip-metadata' && <><div className="image-tool-section-title">Privacy copy</div><p className="image-tool-hint">Save a new image without copied metadata. The encoder may add basic technical fields again.</p></>}
          <label className="image-tool-check"><input type="checkbox" checked={values.stripMetadata === 'true'} onChange={event => set('stripMetadata', String(event.target.checked))}/> Remove metadata from the copy</label>
        </div>
      </div>
      <footer className="image-tool-footer"><span>{applyError || capability.warning || 'Your source image will not be changed.'}</span><div><button className="image-tool-reset" disabled={applying} onClick={() => { setRatio('Free'); setApplyError(''); setValues({ quality: '85', brightness: '1', saturation: '1', contrast: '1', width: '', height: '', x: '0', y: '0', angle: operation === 'rotate' ? '90' : '0', direction: 'horizontal', backgroundType: 'solid', backgroundColor: '#fff4e8', backgroundColor2: '#e69b73', padding: '48', fit: 'inside', stripMetadata: operation === 'strip-metadata' ? 'true' : 'false' }); }}><RotateCcw size={15}/> Reset</button><button className="image-tool-apply" disabled={applying} onClick={async () => { setApplying(true); setApplyError(''); try { await onApply(values); } catch (error) { setApplyError(error instanceof Error ? error.message : String(error)); } finally { setApplying(false); } }}>{applying ? <RotateCw className="spin" size={16}/> : <Check size={16}/>} {applying ? 'Queueing…' : 'Save copy'}</button></div></footer>
    </section>
  </div>;
}
