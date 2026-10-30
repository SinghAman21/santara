import { Slider } from '../../common/EditorFields';
import { RotateCcw, RotateCw } from 'lucide-react';
import type { ImageControls } from './controls';
export default function Rotate({values,set}:ImageControls) {
 const rotate=(delta:number)=>set('angle',String(((Number(values.angle||0)+delta+180)%360+360)%360-180));
 return <><label className="image-tool-control-label">Rotate</label><div className="image-tool-rotate-buttons"><button onClick={()=>rotate(-90)}><RotateCcw size={17}/>90°</button><button onClick={()=>set('angle','0')}>0°</button><button onClick={()=>rotate(90)}>90°<RotateCw size={17}/></button></div><Slider label="Exact angle" min={-180} max={180} step={1} value={values.angle} onChange={value=>set('angle',value)}/><label className="image-tool-check"><input type="checkbox" checked={values.flipHorizontal==='true'} onChange={event=>set('flipHorizontal',String(event.target.checked))}/>Flip horizontal</label><label className="image-tool-check"><input type="checkbox" checked={values.flipVertical==='true'} onChange={event=>set('flipVertical',String(event.target.checked))}/>Flip vertical</label></>;
}
