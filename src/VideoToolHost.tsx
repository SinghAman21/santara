import { useEffect, useState } from 'react';
import type { Capability, LocalFile } from './types';
import { api } from './bridge';
import VideoToolWindow from './VideoToolWindow';
import './video-tool-window.css';

type Context = { capability: Capability; files: LocalFile[]; format: string; options: Record<string, unknown> };

export default function VideoToolHost() {
  const [context, setContext] = useState<Context | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api.videoToolContext?.().then(value => { if (active) setContext(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);
  if (error) return <main className="video-tool-state" role="alert"><h1>Could not open video editor</h1><p>{error}</p><button onClick={() => void api.closeVideoTool?.()}>Close</button></main>;
  if (!context) return <main className="video-tool-state" aria-live="polite">Preparing local video preview…</main>;
  return <VideoToolWindow
    capability={context.capability}
    files={context.files}
    format={context.format}
    initialOptions={context.options}
    onClose={() => void api.closeVideoTool?.()}
    onApply={async (nextFormat, options, orderedFiles) => { await api.applyVideoTool?.({ format: nextFormat, options, files: orderedFiles }); }}
  />;
}
