import { Field, Slider } from '../../common/EditorFields';
import { RotateCcw, RotateCw } from 'lucide-react';
import type { ImageControls } from './controls';
export default function StripMetadata({values,set,preview,originalDimensions,ratio,setRatio,setCropRatio,file,format}: ImageControls) { return <><div className="image-tool-section-title">Delete metadata</div><p className="image-tool-hint">Save a new copy without copied metadata. Your original image remains unchanged.</p></>; }
