type Props = {
    values: Record<string, string>;
    set: (key: string, value: string) => void;
};
export default function SpeedControls({ values, set }: Props) { return <><label className="video-tool-slider">Playback speed <b>{values.factor || '1'}×</b><input aria-label="Playback speed" type="range" min="0.25" max="4" step="0.05" value={values.factor || '1'} onChange={event => set('factor', event.target.value)}/></label><div className="video-tool-presets">{[0.5, 1, 1.5, 2, 4].map(factor => <button className={Number(values.factor || 1) === factor ? 'selected' : ''} key={factor} onClick={() => set('factor', String(factor))}>{factor}×</button>)}</div><p className="video-tool-note">The export is re-encoded. Audio pitch correction is not currently offered; audio tempo changes with the clip.</p></>; }
