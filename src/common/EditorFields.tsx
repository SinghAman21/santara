export function Field({ label, value, onChange, min = 0, max = 16384 }: { label: string; value: string; onChange: (value: string) => void; min?: number; max?: number }) {
  return <label className="image-tool-field"><span>{label}</span><input type="number" min={min} max={max} value={value} onChange={event => onChange(event.target.value)}/></label>;
}

export function Slider({ label, value, min, max, step = 0.05, onChange }: { label: string; value: string; min: number; max: number; step?: number; onChange: (value: string) => void }) {
  const number = Number(value);
  return <label className="image-tool-slider"><span>{label}<b>{Number.isFinite(number) ? number.toFixed(step < 1 ? 2 : 0) : value}</b></span><input type="range" min={min} max={max} step={step} value={Number.isFinite(number) ? number : 1} onChange={event => onChange(event.target.value)}/></label>;
}

