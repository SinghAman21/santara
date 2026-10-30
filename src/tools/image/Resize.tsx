import { useState } from 'react';
import { Field } from '../../common/EditorFields';
import type { ImageControls } from './controls';
export default function Resize({values,set,preview,originalDimensions,format}:ImageControls) {
 const [locked,setLocked]=useState(true);
 const source=originalDimensions.current;
 const width=values.width || String(source?.width || preview?.width || '');
 const height=values.height || String(source?.height || preview?.height || '');
 function dimension(key:'width'|'height',value:string) {
  set(key,value);
  if(locked && source && Number(value)>0) set(key==='width'?'height':'width',String(Math.max(1,Math.round(Number(value)*(key==='width'?source.height/source.width:source.width/source.height)))));
 }
 return <><div className="image-tool-field-grid"><Field label="Width (px)" value={width} onChange={value=>dimension('width',value)} min={1}/><Field label="Height (px)" value={height} onChange={value=>dimension('height',value)} min={1}/></div><label className="image-tool-check"><input type="checkbox" checked={locked} onChange={event=>setLocked(event.target.checked)}/>Lock aspect ratio</label><label className="image-tool-select">Fit<select value={values.fit} onChange={event=>set('fit',event.target.value)}><option value="inside">Inside</option><option value="cover">Cover and crop</option><option value="fill">Stretch</option></select></label><dl className="image-tool-facts"><div><dt>Output</dt><dd>{format.toUpperCase()}</dd></div></dl></>;
}
