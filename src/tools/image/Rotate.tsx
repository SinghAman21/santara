import { Slider } from '../../common/EditorFields';
import { RotateCcw, RotateCw } from 'lucide-react';
import type { ImageControls } from './controls';
export default function Rotate({ values, set, preview, originalDimensions, ratio, setRatio, setCropRatio, file, format }: ImageControls) { return <><div className="image-tool-section-title">Rotation</div><div className="image-tool-rotate-buttons"><button onClick={() => set('angle', String(Number(values.angle || 0) - 90))}><RotateCcw size={17}/> 90° left</button><button onClick={() => set('angle', String(Number(values.angle || 0) + 90))}><RotateCw size={17}/> 90° right</button></div><Slider label="Angle" min={-180} max={180} step={1} value={values.angle} onChange={value => set('angle', value)}/></>; }
