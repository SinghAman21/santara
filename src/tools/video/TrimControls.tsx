import { decimal } from './media';
type Props = {
    duration: number;
    values: Record<string, string>;
    set: (key: string, value: string) => void;
    playhead: number;
};
export default function TrimControls({ duration, values, set, playhead }: Props) { return <><p className="video-tool-note">Drag the playhead to inspect, then enter an exact range. Export is re-encoded for accurate boundaries.</p><div className="video-tool-grid"><label className="video-tool-field">Start (seconds)<input aria-label="Start time (seconds)" type="number" min="0" max={duration || 604800} step="0.01" value={values.start ?? '0'} onChange={event => set('start', event.target.value)}/></label><label className="video-tool-field">End (seconds)<input aria-label="End time (seconds)" type="number" min="0" max={duration || 604800} step="0.01" value={values.end ?? String(duration || 10)} onChange={event => set('end', event.target.value)}/></label></div><div className="video-tool-range-actions"><button type="button" onClick={() => set('start', decimal(playhead))}>Set start to playhead</button><button type="button" onClick={() => set('end', decimal(playhead))}>Set end to playhead</button></div></>; }
