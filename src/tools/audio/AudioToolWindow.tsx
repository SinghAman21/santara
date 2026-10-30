import { useEffect, useState } from 'react';
import type { Capability, LocalFile } from '../../common/types';
import { api } from '../../common/bridge';
import Modal from '../../common/Modal';
import OperationFields from '../../common/OperationFields';
import Normalize from './Normalize';
import Channels from './Channels';
import Trim from './Trim';
import Visualize from './Visualize';
import Compress from './Compress';
import StripMetadata from './StripMetadata';
import type { AudioControlsProps } from './controls';
import type { ComponentType } from 'react';
import '../../common/editor.css';
import './audio.css';
const controls: Record<string,ComponentType<AudioControlsProps>> = {normalize:Normalize,channels:Channels,trim:Trim,visualize:Visualize,compress:Compress,'strip-metadata':StripMetadata};
export const audioEditorOperations = Object.keys(controls);
interface Props { capability:Capability; files:LocalFile[]; format:string; initialOptions:Record<string,string>; onClose:()=>void; onApply:(format:string,values:Record<string,string>)=>Promise<void> }
export default function AudioToolWindow({capability,files,format:initialFormat,initialOptions,onClose,onApply}:Props) {
 const operation=capability.operation || capability.id.split(':').pop()!;
 const defaults={...initialOptions,...(operation==='visualize'?{waveColor:'#ff5a00',backgroundColor:'#ffffff'}:{})};
 const [values,setValues]=useState<Record<string,string>>(defaults);
 const [format,setFormat]=useState(initialFormat);
 const [preview,setPreview]=useState<Awaited<ReturnType<NonNullable<typeof api.preview>>>|null>(null);
 const [previewError,setPreviewError]=useState('');
 const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 const file=files[0]; const Controls=controls[operation];
 useEffect(()=>{let active=true; if(file && api.preview) void api.preview(file.path).then(v=>{if(active)setPreview(v)}).catch(e=>{if(active)setPreviewError(String(e))});return()=>{active=false}},[file?.path]);
 return <Modal title={capability.label} onClose={()=>{if(!busy)onClose()}} wide><form className="audio-editor" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await onApply(format,values);onClose()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}}>
 <p className="audio-source">{file?.name} · {files.length} selected · Processed locally</p>
 <div className="audio-editor-body"><div className="audio-preview"><span>Local preview · original audio</span>{preview?.waveform && <img src={preview.waveform} alt={`Waveform of ${file?.name}`}/ >}{preview?.url ? <audio controls src={preview.url} aria-label="Original audio preview"/> : <p role="status">{previewError || 'Loading local preview…'}</p>}<p className="image-tool-hint">Preview playback does not apply the output settings.</p></div><div><div className="editor-section-label">Output settings</div><label className="image-tool-select">Output format<select value={format} onChange={e=>setFormat(e.target.value)}>{capability.outputs.map(f=><option key={f} value={f}>{f.toUpperCase()}</option>)}</select></label>{Controls ? <Controls values={values} set={(key,value)=>setValues(v=>({...v,[key]:value}))}/> : <OperationFields capability={capability} values={values} onChange={setValues}/>}</div></div>
 <p className="audio-notice" role={error?'alert':undefined}>{error || capability.warning || 'Save a new copy. Your original audio stays untouched.'}</p><footer className="audio-footer"><button type="button" className="editor-cancel" disabled={busy} onClick={()=>{setValues(defaults);setFormat(initialFormat);setError('')}}>Reset</button><button type="button" className="editor-cancel" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" type="submit" disabled={busy||!files.length}>{busy?'Queueing…':'Save new copy'}</button></footer>
 </form></Modal>;
}
