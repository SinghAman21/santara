import { Field } from '../../common/EditorFields';
import type { AudioControlsProps } from './controls';
export default function Normalize({values,set}: AudioControlsProps) {
 return <div className="audio-fields"><Field label="Target loudness (LUFS)" min={-70} max={-5} value={values.loudness ?? '-16'} onChange={v=>set('loudness',v)}/><Field label="Loudness range (LU)" min={1} max={50} value={values.loudnessRange ?? '11'} onChange={v=>set('loudnessRange',v)}/><Field label="True peak (dBTP)" min={-9} max={0} value={values.truePeak ?? '-1.5'} onChange={v=>set('truePeak',v)}/></div>;
}
