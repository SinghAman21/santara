type Props = {
    values: Record<string, string>;
    set: (key: string, value: string) => void;
};
export default function FlipControls({ values, set }: Props) { return <label className="video-tool-field">Direction<select aria-label="Direction" value={values.direction || 'horizontal'} onChange={event => set('direction', event.target.value)}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>; }
