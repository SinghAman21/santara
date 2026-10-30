type Props = {
    values: Record<string, string>;
    set: (key: string, value: string) => void;
};
export default function RotateControls({ values, set }: Props) { return <label className="video-tool-field">Rotation<select aria-label="Rotation" value={values.angle || '90'} onChange={event => set('angle', event.target.value)}><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">90° counterclockwise</option></select></label>; }
