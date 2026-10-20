import { useEffect, useRef, useState, type DragEvent } from 'react';
import { api, defaultSettings } from './bridge';
import RadialWheel, { type WheelItem } from './RadialWheel';
import type { Capability, LocalFile, Snapshot } from './types';
import './global-wheel-window.css';

type WheelMode = 'convert' | 'tools' | 'actions';
const actions = [
  { id: 'copy', label: 'Copy' }, { id: 'move', label: 'Move' },
  { id: 'copy-path', label: 'Copy Path' }, { id: 'terminal', label: 'Open Terminal' },
  { id: 'share', label: 'Share' }, { id: 'preview', label: 'Quick Preview' },
];
const mimeFormats: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif',
  'image/tiff': 'tiff', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac',
  'audio/ogg': 'ogg', 'audio/aac': 'm4a', 'video/mp4': 'mp4', 'video/webm': 'webm',
  'video/quicktime': 'mov', 'application/pdf': 'pdf', 'application/zip': 'zip', 'text/vtt': 'vtt',
};
const operationName = (capability: Capability) => capability.operation || capability.id.split(':').pop()!;
const supports = (capability: Capability, file: LocalFile) => capability.inputs.includes('*') || (file.ext ? capability.inputs.includes(file.isDirectory ? 'directory' : file.ext.toLowerCase()) : capability.category === file.category);
const knownCategory = (file: LocalFile) => file.category !== 'other' ? file.category : '';

function hintedFiles(transfer: DataTransfer): LocalFile[] {
  const dropped = Array.from(transfer.items).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((file): file is File => file !== null);
  const candidates = dropped.length ? dropped : Array.from(transfer.files);
  return candidates.map((file, index) => {
    const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || '' : '';
    const ext = extension || mimeFormats[file.type] || '';
    const category: LocalFile['category'] = 'jpg jpeg png webp heic tiff tif avif bmp svg'.split(' ').includes(ext) ? 'image' : 'mp3 m4a wav flac ogg opus aiff wma'.split(' ').includes(ext) ? 'audio' : 'mp4 mov mkv webm avi wmv gif'.split(' ').includes(ext) ? 'video' : ext === 'pdf' ? 'pdf' : 'zip tar gz rar'.split(' ').includes(ext) ? 'archive' : 'srt vtt'.split(' ').includes(ext) ? 'subtitle' : file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : 'other';
    return { id: `external-${index}`, name: 'Dragged file', path: '', size: 0, ext, category };
  });
}

export default function GlobalWheelWindow() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ files: [], jobs: [], capabilities: [], backends: {}, settings: defaultSettings, platform: 'unknown' });
  const [mode, setMode] = useState<WheelMode>(() => {
    const value = new URLSearchParams(window.location.search).get('mode');
    return value === 'tools' || value === 'actions' ? value : 'convert';
  });
  const [hints, setHints] = useState<LocalFile[]>([]);
  const [choice, setChoice] = useState('');
  const [working, setWorking] = useState(false);
  const choiceRef = useRef('');
  const seenDrag = useRef(false);
  const externalFiles = hints.length ? hints : [{ id: 'provisional-image', name: 'Dragged image', path: '', size: 0, ext: '', category: 'image' as const }];

  useEffect(() => {
    void api.bootstrap().then(setSnapshot);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const preference = snapshot.settings.theme || 'system';
      document.documentElement.dataset.theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    };
    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [snapshot.settings.theme]);

  useEffect(() => {
    return api.onWheelMode?.((value, newDrag) => {
      if (newDrag) {
        setHints([]);
        setChoice('');
        choiceRef.current = '';
        seenDrag.current = false;
      }
      if (value === 'convert' || value === 'tools' || value === 'actions') {
        setMode(value);
        setChoice('');
        choiceRef.current = '';
      }
    });
  }, []);

  const selectedCategories: Set<string> = new Set(externalFiles.map(knownCategory).filter(Boolean));
  const items: WheelItem[] = mode === 'actions'
    ? actions.map(action => ({ ...action, detail: 'Local file action' }))
    : [...new Map(snapshot.capabilities
      .filter(capability => capability.available && capability.outputs.length)
      .filter(capability => mode !== 'tools' || operationName(capability) !== 'create-archive')
      .filter(capability => mode !== 'tools' || !(capability.category === 'image' && operationName(capability) === 'strip-metadata'))
      .filter(capability => mode !== 'tools' || !selectedCategories.size || selectedCategories.has(capability.category))
      .filter(capability => mode === 'convert'
        ? ['convert', 'render'].includes(operationName(capability))
        : !['convert', 'render'].includes(operationName(capability)))
      .filter(capability => externalFiles.some(file => supports(capability, file)))
      .filter(capability => !['merge', 'pdf-merge'].includes(operationName(capability)) || externalFiles.filter(file => supports(capability, file)).length > 1)
      .flatMap(capability => (mode === 'convert' ? capability.outputs : ['']).map(format => {
        const coverage = externalFiles.filter(file => supports(capability, file)).length;
        const label = mode === 'convert' ? format.toUpperCase() : capability.label;
        return [{ id: `${capability.id}|${format}`, label, detail: coverage === externalFiles.length ? `${coverage} ${coverage === 1 ? 'file' : 'files'} · Processed locally` : `${coverage} of ${externalFiles.length} files · Others will be skipped` }];
      }))
      .flat().map(item => [item.label, item])).values()];

  function highlight(id: string) {
    choiceRef.current = id;
    setChoice(id);
  }

  async function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (working) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-wheel-item]') : null;
    const targetChoice = target?.dataset.wheelItem;
    if (targetChoice && items.some(item => item.id === targetChoice && !item.disabled)) highlight(targetChoice);
    setWorking(true);
    try {
      const incoming = await api.droppedFiles(Array.from(event.dataTransfer.files));
      if (!incoming.length) {
        await api.finishGlobalWheel?.('converter');
        return;
      }
      const selectedChoice = targetChoice || choiceRef.current;
      if (!selectedChoice) {
        await api.finishGlobalWheel?.('converter');
        return;
      }
      if (mode === 'actions') {
        const action = selectedChoice;
        await api.fileAction({ action, files: incoming });
        await api.finishGlobalWheel?.('converter');
        return;
      }
      const [capabilityId, format] = selectedChoice.split('|');
      const capability = snapshot.capabilities.find(item => item.id === capabilityId && item.available && incoming.some(file => supports(item, file)));
      if (!capability) {
        await api.finishGlobalWheel?.('converter');
        return;
      }
      if (['convert', 'render'].includes(operationName(capability))) {
        const settings = snapshot.settings;
        await api.enqueue({
          files: incoming,
          operation: operationName(capability),
          format,
          options: { quality: settings.quality, stripMetadata: settings.stripMetadata, outputFolder: settings.outputFolder, collision: settings.collision, recursive: settings.recursive, preserveStructure: settings.preserveStructure },
        });
        await api.finishGlobalWheel?.('background');
      } else {
        await api.selectGlobalOperation?.({ capabilityId, format: format || capability.outputs[0] || '', files: incoming });
      }
    } catch (error) {
      console.error('Global wheel drop failed:', error);
      await api.finishGlobalWheel?.('converter');
    } finally {
      setWorking(false);
    }
  }

  return <main className="global-wheel-shell" aria-label="Santara global drop wheel" onDragEnter={event => {
    event.preventDefault();
    if (!seenDrag.current) setHints(hintedFiles(event.dataTransfer));
    seenDrag.current = true;
  }} onDragOver={event => {
    event.preventDefault();
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-wheel-item]') : null;
    const targetChoice = target?.dataset.wheelItem;
    if (targetChoice && items.some(item => item.id === targetChoice && !item.disabled)) highlight(targetChoice);
    event.dataTransfer.dropEffect = 'copy';
  }} onDrop={event => void onDrop(event)}>
    <div className="global-wheel-card">
      <RadialWheel
        label={mode === 'convert' ? 'Convert' : mode === 'tools' ? 'Tools' : 'File actions'}
        subtitle={externalFiles.some(file => !file.ext) ? 'Image routes are shown provisionally · drop to verify' : 'Hold the drag · hover a slice · release to apply'}
        items={items.length ? items : [{ id: 'unknown', label: 'Inspect on drop', detail: 'We will show supported choices after inspection' }]}
        selected={choice}
        onHighlight={highlight}
        onChoose={highlight}
        dragging
        hideDescription
      />
    </div>
    <button className="global-wheel-cancel" onClick={() => void api.finishGlobalWheel?.('converter')} aria-label="Close drop wheel">×</button>
  </main>;
}
