type Props = {
    values: Record<string, string>;
    set: (key: string, value: string) => void;
};
export default function CompressControls({ values, set }: Props) { return <><p className="video-tool-note">Re-encodes the video locally. Compression may increase file size; the source is kept untouched.</p><label className="video-tool-slider">Video quality <b>{values.quality || '75'}</b><input aria-label="Video quality" type="range" min="1" max="100" value={values.quality || '75'} onChange={event => set('quality', event.target.value)}/></label><label className="video-tool-field">Audio bitrate (kbps)<input aria-label="Audio bitrate" type="number" min="16" max="512" step="16" value={values.bitrate || '128'} onChange={event => set('bitrate', event.target.value)}/></label></>; }
