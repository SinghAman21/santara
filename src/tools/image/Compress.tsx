import { Slider } from '../../common/EditorFields';
import type { ImageControls } from './controls';
export default function Compress({values,set,preview,file,format}:ImageControls) {
 return <><Slider label="Quality" min={1} max={100} step={1} value={values.quality} onChange={value=>set('quality',value)}/><dl className="image-tool-facts"><div><dt>Output</dt><dd>{format.toUpperCase()} · {preview?.width || '—'} × {preview?.height || '—'}</dd></div><div><dt>Source size</dt><dd>{(file.size/1024/1024).toFixed(2)} MB · output not measured</dd></div><div><dt>Metadata</dt><dd>Removed by raster processor</dd></div></dl><p className="image-tool-hint">Output can be larger; size is measured after processing.</p></>;
}
