import { ArrowDown, ArrowUp } from 'lucide-react';
import type { LocalFile } from '../../common/types';
import type { Dispatch, SetStateAction } from 'react';
type Props = {
    values: Record<string, string>;
    set: (key: string, value: string) => void;
    files: LocalFile[];
    setFiles: import("/home/aman/Documents/graveyard/santra/node_modules/@types/react/index").Dispatch<import("/home/aman/Documents/graveyard/santra/node_modules/@types/react/index").SetStateAction<LocalFile[]>>;
};
export default function MergeControls({ values, set, files, setFiles }: Props) { return <><p className="video-tool-note">Clips are joined in this order. Santra validates stream compatibility before export; re-encoding is enabled by default.</p><label className="video-tool-check"><input type="checkbox" checked={values.reencode !== 'false'} onChange={event => set('reencode', String(event.target.checked))}/> Re-encode clips for compatibility</label><ol className="video-tool-clip-list">{files.map((clip, index) => <li key={clip.path}><span>{index + 1}. {clip.name}</span><div><button type="button" aria-label={`Move ${clip.name} up`} disabled={index === 0} onClick={() => setFiles(current => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}><ArrowUp size={14}/></button><button type="button" aria-label={`Move ${clip.name} down`} disabled={index === files.length - 1} onClick={() => setFiles(current => { const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })}><ArrowDown size={14}/></button></div></li>)}</ol></>; }
