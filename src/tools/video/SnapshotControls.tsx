import { Plus, Trash2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { clock } from './media';
type Props = {
    setFrames: import("/home/aman/Documents/graveyard/santra/node_modules/@types/react/index").Dispatch<import("/home/aman/Documents/graveyard/santra/node_modules/@types/react/index").SetStateAction<number[]>>;
    playhead: number;
    frames: number[];
    seek: (value: number) => void;
};
export default function SnapshotControls({ setFrames, playhead, frames, seek }: Props) { return <><p className="video-tool-note">Seek to a frame and add it. Selected frames export at source resolution as PNG copies.</p><div className="video-tool-range-actions"><button onClick={() => setFrames(current => current.includes(playhead) ? current : [...current, playhead].sort((a, b) => a - b))}><Plus size={13}/> Add frame at {clock(playhead)}</button></div><div className="video-tool-frame-list">{frames.map((time, index) => <div key={`${time}-${index}`}><button aria-label={`Seek to frame ${index + 1}`} onClick={() => seek(time)}>{clock(time)}</button><button aria-label={`Remove frame ${index + 1}`} onClick={() => setFrames(current => current.filter((_, position) => position !== index))}><Trash2 size={13}/></button></div>)}</div></>; }
