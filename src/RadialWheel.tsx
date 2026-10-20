import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './wheel.css';
import './wheel-polish.css';

export interface WheelItem { id: string; label: string; detail?: string; icon?: ReactNode; disabled?: boolean }
interface Props { items: WheelItem[]; label: string; subtitle?: string; selected?: string; onHighlight?: (id: string) => void; onChoose: (id: string) => void; preview?: ReactNode; dragging?: boolean }

function point(radius: number, angle: number) {
  return [180 + Math.cos(angle) * radius, 180 + Math.sin(angle) * radius];
}

export function slicePath(index: number, count: number) {
  const step = Math.PI * 2 / count;
  const middle = -Math.PI / 2 + index * step;
  const start = middle - step / 2 + 0.025;
  const end = middle + step / 2 - 0.025;
  const outerStart = point(167, start), outerEnd = point(167, end);
  const innerStart = point(68, start), innerEnd = point(68, end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${outerStart.join(' ')} A 167 167 0 ${large} 1 ${outerEnd.join(' ')} L ${innerEnd.join(' ')} A 68 68 0 ${large} 0 ${innerStart.join(' ')} Z`;
}

export default function RadialWheel({ items, label, subtitle, selected = '', onHighlight, onChoose, preview, dragging = false }: Props) {
  const [page, setPage] = useState(0);
  const [focused, setFocused] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const pages = Math.ceil(items.length / 8);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  const visible = items.slice(currentPage * 8, currentPage * 8 + 8);
  const active = items.find(item => item.id === (selected || focused));
  useEffect(() => { setPage(0); setFocused(''); }, [label]);
  function highlight(id: string) { setFocused(id); onHighlight?.(id); }
  return <div className={`citrus-wheel ${dragging ? 'is-dragging' : ''}`} ref={root}>
    <div className="citrus-rind" role="menu" aria-label={label} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>
      <svg viewBox="0 0 360 360" className="citrus-segments" aria-hidden="true">
        {visible.map((item, index) => <path key={item.id} data-wheel-item={item.id} d={slicePath(index, visible.length)} className={`${item.id === (selected || focused) ? 'chosen' : ''} ${item.disabled ? 'unavailable' : ''}`} onMouseEnter={() => !item.disabled && highlight(item.id)} onDragEnter={event => { event.preventDefault(); if (!item.disabled) highlight(item.id); }} onClick={() => !item.disabled && onChoose(item.id)}/>)}
      </svg>
      {visible.map((item, index) => {
        const location = point(118, -Math.PI / 2 + index * Math.PI * 2 / visible.length);
        return <button type="button" role="menuitem" data-wheel-item={item.id} key={item.id} aria-label={item.detail ? `${item.label} · ${item.detail}` : item.label} disabled={item.disabled} className={`citrus-label ${item.id === (selected || focused) ? 'chosen' : ''}`} style={{ left: `${location[0] / 3.6}%`, top: `${location[1] / 3.6}%` }} onMouseEnter={() => highlight(item.id)} onDragEnter={event => { event.preventDefault(); highlight(item.id); }} onFocus={() => highlight(item.id)} onClick={() => onChoose(item.id)}>{item.icon}<span>{item.label}</span></button>;
      })}
      <div className="citrus-core" onMouseEnter={() => { setFocused(''); onHighlight?.(''); }} onDragEnter={() => { setFocused(''); onHighlight?.(''); }}>{preview || <span className="citrus-core-mark">✳</span>}<span>{active?.label || label}</span></div>
    </div>
    <div className="wheel-description" aria-live="polite"><strong>{active?.label || label}</strong><span>{active?.detail || subtitle || 'Choose a slice to continue'}</span></div>
    {pages > 1 && <div className="wheel-pagination"><button aria-label="Previous operations" disabled={currentPage === 0} onDragEnter={() => { if (currentPage > 0) { setPage(currentPage - 1); highlight(''); } }} onClick={() => { setPage(currentPage - 1); highlight(''); }}><ChevronLeft size={16}/></button><span>{currentPage + 1} / {pages}</span><button aria-label="More operations" disabled={currentPage === pages - 1} onDragEnter={() => { if (currentPage < pages - 1) { setPage(currentPage + 1); highlight(''); } }} onClick={() => { setPage(currentPage + 1); highlight(''); }}><ChevronRight size={16}/></button></div>}
  </div>;
}
