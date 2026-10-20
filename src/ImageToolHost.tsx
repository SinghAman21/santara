import { useEffect, useState } from 'react';
import type { Capability, LocalFile } from './types';
import { api } from './bridge';
import ImageToolWindow from './ImageToolWindow';
import './image-tool-window.css';

type Context = { capability: Capability; files: LocalFile[]; format: string; options: Record<string, string> };

export default function ImageToolHost() {
  const [context, setContext] = useState<Context | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api.imageToolContext?.().then(value => { if (active) setContext(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);
  if (error) return <main className="image-tool-error" role="alert"><h1>Could not open image editor</h1><p>{error}</p><button onClick={() => void api.closeImageTool?.()}>Close</button></main>;
  if (!context) return <main className="image-tool-loading" aria-live="polite">Preparing local image preview…</main>;
  return <ImageToolWindow
    capability={context.capability}
    file={context.files[0]}
    format={context.format}
    initialOptions={context.options}
    onClose={() => void api.closeImageTool?.()}
    onApply={async options => { await api.applyImageTool?.({ options }); }}
  />;
}
