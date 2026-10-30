import { Field } from '../../common/EditorFields';
import type { AudioControlsProps } from './controls';
export default function Trim({values,set}: AudioControlsProps) {
 return <div className="audio-fields"><Field label="Start (seconds)" min={0} max={604800} value={values.start ?? '0'} onChange={v=>set('start',v)}/><Field label="Duration (seconds)" min={0.01} max={604800} value={values.duration ?? '10'} onChange={v=>set('duration',v)}/><p className="image-tool-hint">The selected range is re-encoded into a new copy.</p></div>;
}
