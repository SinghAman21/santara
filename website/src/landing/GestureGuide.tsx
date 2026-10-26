import { useEffect, useRef, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
export function GestureGuide({ pressed }: {
    pressed: string;
}) {
    const [replay, setReplay] = useState(0), root = useRef<HTMLDivElement>(null);
    useEffect(() => { const element = root.current!; const observer = new IntersectionObserver(entries => { element.dataset.playing = String(entries[0].isIntersecting); }); observer.observe(element); return () => observer.disconnect(); }, []);
    return <div ref={root} className="gesture-guide">
    <div className="guide-title"><span>THE LITTLE GESTURE</span><button onClick={() => setReplay(n => n + 1)} aria-label="Replay gesture demonstration"><RefreshCcw size={13}/> Replay</button></div>
    <div key={replay} className="gesture-demo" aria-hidden="true"><span className="demo-file">PNG<i /></span><span className="demo-key">Shift<small>1 · 2</small></span><span className="demo-wheel"><i /><i /><i /></span><span className="demo-caption">DRAG → DOUBLE-TAP → CHOOSE</span></div>
    <ol className="gesture-steps"><li><span>1</span><p><strong>Drag a file.</strong><small>Use a sample on the left.</small></p></li><li><span>2</span><p><strong>Press the same key twice.</strong><small>While dragging, within 400 ms.</small></p></li><li><span>3</span><p><strong>Choose an action.</strong><small>Then run it on your selected file.</small></p></li><li><span>4</span><p><strong>Keep the result.</strong><small>A new output appears beside its source.</small></p></li></ol>
    <div className="gesture-keys">{[['Shift', 'Convert'], ['Alt', 'Tools'], ['Control', 'Files']].map(([key, label]) => <span key={key}><kbd className={pressed === key ? 'pressed' : ''}>{key === 'Control' ? 'Ctrl' : key}</kbd><small>{label}</small></span>)}</div>
    <p className="gesture-help">Drag a file, then press <strong>Shift, Alt, or Ctrl twice</strong>. Different keys open different modes. Ctrl+Shift also opens tools. You can also tap a file and use the mode buttons.</p>
  </div>;
}
