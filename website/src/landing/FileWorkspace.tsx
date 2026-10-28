import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type DragEvent } from 'react';
import { ArrowDownToLine, ArrowRight, AudioLines, Check, FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo, FolderOpen, Plus, X } from 'lucide-react';
import { ContinuousWheel } from './CitrusWheel';
import { GestureGuide } from './GestureGuide';
import { actionsFor, inspectFile, processFile, type FileInfo } from './file-capabilities';
import { createSamples } from './sample-files';
import { sizeLabel, type Mode, type Output } from './image-actions';
type Entry = {
    id: number;
    file: File;
    info: FileInfo;
    url: string;
    sample?: boolean;
    output?: Output;
    outputUrl?: string;
    error?: string;
};
const iconFor = (info: FileInfo) => info.kind === 'images' ? FileImage : info.kind === 'audio' ? AudioLines : info.kind === 'video' ? FileVideo : info.kind === 'archives' ? FileArchive : info.kind === 'spreadsheets' ? FileSpreadsheet : FileText;
export function FileWorkspace() {
    const [files, setFiles] = useState<Entry[]>([]), [active, setActive] = useState<number>(), [mode, setMode] = useState<Mode>('all'), [selected, setSelected] = useState('webp');
    const [status, setStatus] = useState('Setting out your sample files…'), [busy, setBusy] = useState(false), [dragging, setDragging] = useState(false), [pressed, setPressed] = useState(''), [externalPending, setExternalPending] = useState(false), [overWheel, setOverWheel] = useState(false), [pointer, setPointer] = useState<{
        x: number;
        y: number;
        name: string;
    } | null>(null);
    const input = useRef<HTMLInputElement>(null), area = useRef<HTMLDivElement>(null), urls = useRef(new Set<string>()), nextId = useRef(0), generation = useRef(0), lock = useRef(false), depth = useRef(0), draggingRef = useRef(false), pointerDrag = useRef<{
        id: number;
        x: number;
        y: number;
        started: boolean;
    } | undefined>(undefined), suppressClick = useRef(false), wheel = useRef<HTMLDivElement>(null), cancelDrag = useRef<() => void>(() => { });
    const current = files.find(f => f.id === active), info = current?.info ?? { kind: 'images' as const, extension: 'png', mime: 'image/png' };
    const actions = externalPending ? [] : actionsFor(info, mode), action = actions.find(a => a.id === selected) ?? actions[0];
    const actionPage = Math.max(0, Math.floor((action ? actions.indexOf(action) : 0) / 6));
    const wheelActions = actions.slice(actionPage * 6, actionPage * 6 + 6);
    function selectFile(entry: Entry) {
        if (lock.current)
            return;
        setActive(entry.id);
        setMode('all');
        const available = actionsFor(entry.info, 'all');
        setSelected(previous => available.some(a => a.id === previous) ? previous : available.find(a => !a.unavailable)?.id ?? available[0]?.id ?? '');
        setStatus(`${entry.file.name} selected. ${entry.info.warning ?? 'Choose an available action.'}`);
    }
    function ownUrl(blob: Blob) { const url = URL.createObjectURL(blob); urls.current.add(url); return url; }
    function revoke(url?: string) {
        if (url) {
            URL.revokeObjectURL(url);
            urls.current.delete(url);
        }
    }
    useEffect(() => {
        let cancelled = false;
        const token = generation.current;
        void createSamples().then(samples => {
            if (cancelled || token !== generation.current)
                return;
            const entries = samples.map(sample => ({ ...sample, id: ++nextId.current, url: ownUrl(sample.file), sample: true }));
            setFiles(entries);
            setActive(entries[0]?.id);
            setStatus('Your desktop is ready. Drag a sample toward the citrus wheel, or tap a file to select it.');
        }).catch(e => {
            if (!cancelled && token === generation.current)
                setStatus(`Could not prepare samples: ${(e as Error).message}`);
        });
        return () => { cancelled = true; generation.current++; urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current.clear(); };
    }, []);
    useEffect(() => {
        if (action?.id !== selected)
            setSelected(action?.id ?? '');
    }, [action?.id, selected]);
    function finishDrag() { pointerDrag.current = undefined; draggingRef.current = false; setDragging(false); setPointer(null); setOverWheel(false); setExternalPending(false); depth.current = 0; }
    cancelDrag.current = finishDrag;
    useEffect(() => {
        const taps = { key: '', released: 0, down: new Map<string, number>() };
        function reset() { taps.key = ''; taps.down.clear(); setPressed(''); }
        function keydown(e: KeyboardEvent) {
            if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) {
                reset();
                return;
            }
            if (e.key === 'Escape') {
                reset();
                cancelDrag.current();
                return;
            }
            if (!(draggingRef.current || area.current?.contains(document.activeElement)))
                return;
            if (!['Shift', 'Alt', 'Control'].includes(e.key)) {
                reset();
                return;
            }
            if (e.repeat || taps.down.has(e.key) || e.metaKey)
                return;
            const now = e.timeStamp;
            taps.down.set(e.key, now);
            setPressed(e.key);
            const same = taps.key === e.key && now - taps.released <= 400;
            taps.key = '';
            if (same) {
                const next = e.ctrlKey && e.shiftKey ? 'tools' : e.key === 'Shift' ? 'convert' : e.key === 'Alt' ? 'tools' : 'actions';
                setMode(next);
                setStatus(`${next === 'convert' ? 'Conversion' : next === 'tools' ? 'Tools' : 'File actions'} wheel open for the selected file. Choose an action, then run it.`);
            }
        }
        function keyup(e: KeyboardEvent) {
            const start = taps.down.get(e.key);
            if (start === undefined)
                return;
            taps.down.delete(e.key);
            setPressed('');
            if (e.timeStamp - start <= 400) {
                taps.key = e.key;
                taps.released = e.timeStamp;
            }
            else
                taps.key = '';
        }
        function blur() { reset(); cancelDrag.current(); }
        window.addEventListener('keydown', keydown);
        window.addEventListener('keyup', keyup);
        window.addEventListener('blur', blur);
        return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur); };
    }, []);
    async function add(incoming: File[]) {
        if (lock.current) {
            setStatus('Wait for the current action to finish before importing.');
            return;
        }
        const token = generation.current, accepted: Entry[] = [], errors: string[] = [];
        for (const file of incoming.slice(0, 12)) {
            try {
                const info = await inspectFile(file);
                if (token !== generation.current)
                    return;
                accepted.push({ id: ++nextId.current, file, info, url: ownUrl(file) });
            }
            catch (e) {
                errors.push(`${file.name}: ${(e as Error).message}`);
            }
        }
        if (accepted.length) {
            setFiles(previous => [...previous, ...accepted]);
            selectFile(accepted[0]);
        }
        if (errors.length)
            setStatus(errors.join(' '));
        else if (incoming.length > 12)
            setStatus('The first 12 files were imported. Add more in a separate selection.');
    }
    async function run() {
        if (!current || !action || lock.current || action.unavailable)
            return;
        lock.current = true;
        setBusy(true);
        const token = generation.current;
        revoke(current.outputUrl);
        setFiles(previous => previous.map(f => f.id === current.id ? { ...f, output: undefined, outputUrl: undefined, error: undefined } : f));
        setStatus(`Processing ${current.file.name} locally…`);
        try {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const output = await processFile(current.file, current.info, action);
            if (token !== generation.current)
                return;
            const outputUrl = ownUrl(output.blob);
            setFiles(previous => previous.map(f => f.id === current.id ? { ...f, output, outputUrl } : f));
            setStatus(`${output.name} is ready beside ${current.file.name}. The source is unchanged.`);
        }
        catch (e) {
            if (token === generation.current) {
                setFiles(previous => previous.map(f => f.id === current.id ? { ...f, error: (e as Error).message } : f));
                setStatus((e as Error).message);
            }
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    }
    function remove(id: number) {
        const entry = files.find(f => f.id === id);
        revoke(entry?.url);
        revoke(entry?.outputUrl);
        const remaining = files.filter(f => f.id !== id);
        setFiles(remaining);
        if (active === id) {
            setActive(remaining[0]?.id);
            setMode('all');
        }
        setStatus('File removed.');
    }
    function down(e: ReactPointerEvent<HTMLButtonElement>, entry: Entry) {
        if (busy || e.button !== 0)
            return;
        selectFile(entry);
        pointerDrag.current = { id: entry.id, x: e.clientX, y: e.clientY, started: false };
        e.currentTarget.setPointerCapture(e.pointerId);
    }
    function move(e: ReactPointerEvent<HTMLButtonElement>, entry: Entry) {
        const drag = pointerDrag.current;
        if (!drag || drag.id !== entry.id)
            return;
        if (!drag.started && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 7)
            return;
        drag.started = true;
        draggingRef.current = true;
        setDragging(true);
        setPointer({ x: e.clientX + 14, y: e.clientY + 14, name: entry.file.name });
        const box = wheel.current?.getBoundingClientRect();
        setOverWheel(!!box && e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom);
    }
    function up(e: ReactPointerEvent<HTMLButtonElement>) {
        if (pointerDrag.current?.started) {
            suppressClick.current = true;
            const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<SVGGElement>('[data-action-id]');
            if (target) {
                const chosen = actions.find(a => a.id === target.dataset.actionId);
                if (chosen)
                    setSelected(chosen.id);
            }
            setStatus(overWheel ? 'File received. Choose a slice or use the action details, then run the action.' : 'Keep your file on the desktop, or drag it onto the wheel.');
        }
        finishDrag();
    }
    function drop(e: DragEvent) { e.preventDefault(); finishDrag(); void add(Array.from(e.dataTransfer.files)); }
    const Icon = iconFor(info);
    return <section className="file-workspace" id="workspace" aria-labelledby="workspace-title"><div className="chapter-line"><span>03 / YOUR DESKTOP</span><span>REAL FILES. THEIR NEXT MOVE.</span></div>
    <div className="workspace-heading"><h2 id="workspace-title">Every file has<br /><em>a fresh possibility.</em></h2><p>Pick up a sample. Find its next move.<br />Your files and new outputs stay in this workspace.</p></div>
    <div ref={area} className={`workspace-desk desktop-playground ${dragging ? 'is-dragging' : ''}`} onDragEnter={e => {
            if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                depth.current++;
                if (!pointerDrag.current)
                    setExternalPending(true);
                draggingRef.current = true;
                setDragging(true);
            }
        }} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = busy ? 'none' : 'copy'; }} onDragLeave={() => {
            depth.current = Math.max(0, depth.current - 1);
            if (!depth.current && !pointerDrag.current)
                finishDrag();
        }} onDrop={drop}>
      <aside className="files-panel" aria-label="Desktop files"><div className="panel-title"><span>YOUR DESKTOP</span><span>{String(files.length).padStart(2, '0')} FILES</span></div><div className="desktop-toolbar"><span><FolderOpen size={13}/> A few things to work with</span><button className="import-files" onClick={() => input.current?.click()} disabled={busy}><Plus size={14}/> Import files</button></div>
        <input ref={input} type="file" multiple hidden onChange={e => { void add(Array.from(e.target.files ?? [])); e.target.value = ''; }}/>
        <div id="desktop-files" className="desktop-files file-list">{files.map(entry => {
            const FileIcon = iconFor(entry.info);
            return <div key={entry.id} className={`desktop-file file-row ${entry.id === active ? 'active' : ''} ${pointerDrag.current?.id === entry.id && dragging ? 'drag-source' : ''}`}>
          <button className="desktop-file-select" onDragStart={e => e.preventDefault()} disabled={busy} aria-pressed={entry.id === active} aria-label={`Select ${entry.file.name}`} title={`${entry.file.name} · ${entry.info.kind}`} onClick={() => {
                    if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                    }
                    if (!pointerDrag.current?.started)
                        selectFile(entry);
                }} onPointerDown={e => down(e, entry)} onPointerMove={e => move(e, entry)} onPointerUp={up} onPointerCancel={finishDrag}>
            <span className={`desktop-file-art kind-${entry.info.kind}`}>{entry.info.kind === 'images' ? <img src={entry.url} alt="" draggable={false}/> : <FileIcon size={32} strokeWidth={1.1}/>}<b>{entry.info.extension.toUpperCase() || 'FILE'}</b></span><strong>{entry.file.name}</strong><small>{sizeLabel(entry.file.size)} · {entry.sample ? 'SAMPLE' : 'IMPORTED'}</small>
          </button><button className="remove-desktop-file" aria-label={`Remove ${entry.file.name}`} disabled={busy} onClick={() => remove(entry.id)}><X size={12}/></button>
          {entry.output && <a className="desktop-output" href={entry.outputUrl} download={entry.output.name} title={entry.output.name}><Check size={11}/><span>{entry.output.name}</span><ArrowDownToLine size={12}/></a>}
        </div>;
        })}</div>
        {!files.length && <p className="empty-desktop">Your desktop is clear. Import a file or restore the samples.</p>}
        <div className="desktop-bottom"><a className="back-to-wheel" href="#desktop-wheel">Choose an action ↑</a><button disabled={busy} onClick={() => { generation.current++; urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current.clear(); setFiles([]); setActive(undefined); setStatus('Desktop cleared. Import a file or restore samples.'); }}>Clear desktop</button><button disabled={busy} onClick={() => {
            const token = ++generation.current;
            void createSamples().then(samples => {
                if (token !== generation.current)
                    return;
                urls.current.forEach(url => URL.revokeObjectURL(url));
                urls.current.clear();
                const entries = samples.map(s => ({ ...s, id: ++nextId.current, url: ownUrl(s.file), sample: true }));
                setFiles(entries);
                setActive(entries[0].id);
                setMode('all');
                setStatus('Samples restored.');
            }).catch(e => setStatus((e as Error).message));
        }}>Restore samples</button></div><p className="local-note"><span /> Valid sample files. Nothing uploaded.</p>
      </aside>
      <div ref={wheel} id="desktop-wheel" className={`wheel-panel ${overWheel ? 'is-over-wheel' : ''}`} aria-label="File action wheel"><div className="wheel-tabs" role="group" aria-label="Wheel mode">{(['all', 'convert', 'tools', 'actions'] as Mode[]).map(tab => <button key={tab} disabled={busy} aria-pressed={mode === tab} onClick={() => setMode(tab)}>{tab === 'all' ? 'Explore' : tab === 'actions' ? 'Files' : tab[0].toUpperCase() + tab.slice(1)}</button>)}</div><div className="wheel-current"><Icon size={14}/><span>{externalPending ? 'Drop to inspect this file' : current?.file.name ?? 'Select a file'}</span><small>{info.kind.toUpperCase()}</small></div>
        <ContinuousWheel actions={wheelActions} selected={action?.id ?? ''} onSelect={setSelected} disabled={busy || !current || externalPending}/><p className="wheel-caption">{dragging ? (overWheel ? 'LET IT LAND. CHOOSE ITS NEXT MOVE.' : 'BRING YOUR FILE TO THE CITRUS.') : 'SAME ORANGE. YOUR NEXT MOVE.'}<a className="mobile-files-link" href="#desktop-files">Choose a file below ↓</a></p>
        {actions.length > 6 && <div className="wheel-pagination" aria-label="More file actions"><button disabled={busy || actionPage === 0} onClick={() => setSelected(actions[(actionPage - 1) * 6].id)} aria-label="Previous actions">←</button><span>Actions {actionPage * 6 + 1}–{Math.min((actionPage + 1) * 6, actions.length)} of {actions.length}</span><button disabled={busy || (actionPage + 1) * 6 >= actions.length} onClick={() => setSelected(actions[(actionPage + 1) * 6].id)} aria-label="Next actions">→</button></div>}
        {!externalPending && !actions.length && <p className="no-actions">No {mode === 'convert' ? 'conversion' : mode === 'tools' ? 'editing' : 'matching'} route is available for this file here. <button onClick={() => setMode('actions')}>Open file actions</button></p>}
      </div>
      <aside className="action-panel" aria-label="Instructions, action and results"><GestureGuide pressed={pressed}/><div className="selected-action"><small>{action?.unavailable ? 'DESKTOP ENGINE REQUIRED' : 'SELECTED ACTION'}</small><h3>{action?.label ?? 'No matching action'}</h3><p>{action?.description ?? 'Choose another mode. File actions can download or archive the source.'}</p>{action?.unavailable ? <div className="unavailable-action"><p>{action.unavailable}</p><a href="/tools">Explore these desktop tools <ArrowRight size={13}/></a><a href="/install">Get Santra desktop</a></div> : <button className="citrus-button" disabled={!current || busy || !action} onClick={() => void run()}>{busy ? 'Processing…' : 'Run action'}<ArrowRight size={16}/></button>}</div>
        {current?.info.text && !current.output && <pre className="source-text-preview" aria-label="Source text preview">{current.info.text.slice(0, 400)}</pre>}
        {current?.output && <div className="output-card"><span><Check size={14}/> READY · {current.output.operation}</span>{current.info.kind === 'images' && current.output.blob.type.startsWith('image/') && <img className="output-preview" src={current.outputUrl} alt={`Result of ${current.output.operation}`}/>}<strong>{current.output.name}</strong><small>{sizeLabel(current.output.blob.size)} · {Math.round(current.output.duration)} ms</small><a href={current.outputUrl} download={current.output.name}>Download result <ArrowDownToLine size={15}/></a></div>}
        {current?.error && <p role="alert" className="workspace-error">{current.error}</p>}
      </aside><div className="workspace-status" role="status" aria-live="polite"><Icon size={14}/><span>{status}</span></div>
    </div>
    {pointer && <div className="drag-file-ghost" style={{ left: pointer.x, top: pointer.y }} aria-hidden="true"><Icon size={18}/>{pointer.name}<small>{overWheel ? 'Drop to select an action' : 'Drag to the citrus wheel'}</small></div>}
    <p className="browser-boundary">Images, subtitle conversion and bounded single-file archives run locally in this browser. Canvas exports flatten animation and omit metadata. PDF, document and media engines require Santra desktop; spreadsheet conversion remains disabled. Files are never executed or uploaded. <a href="/install">Get the desktop experience <ArrowRight size={13}/></a></p>
  </section>;
}
