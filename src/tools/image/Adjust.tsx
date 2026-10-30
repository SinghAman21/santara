import { Field, Slider } from '../../common/EditorFields';
import { RotateCcw, RotateCw } from 'lucide-react';
import type { ImageControls } from './controls';
export default function Adjust({values,set,preview,originalDimensions,ratio,setRatio,setCropRatio,file,format}: ImageControls) { return <><div className="image-tool-section-title">Adjustments</div><Slider label="Brightness" min={0} max={2} value={values.brightness} onChange={value => set('brightness', value)}/><Slider label="Contrast" min={0} max={2} value={values.contrast} onChange={value => set('contrast', value)}/><Slider label="Saturation" min={0} max={2} value={values.saturation} onChange={value => set('saturation', value)}/><p className="image-tool-hint">Changes stay in this recipe until you save a copy.</p></>; }
