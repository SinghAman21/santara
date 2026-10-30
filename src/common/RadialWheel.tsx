import type { WheelFamily } from './file-kind';
import type { ReactNode } from 'react';
import type { LocalFile } from './types';
import ImageWheel from '../tools/image/ImageWheel';
import ReferenceWheel from './ReferenceWheel';
import './wheel.css';
import './wheel-polish.css';

export interface WheelItem { id: string; label: string; detail?: string; icon?: ReactNode; disabled?: boolean }
export interface RadialWheelProps { family?: WheelFamily; sourceName?: string; sourceFile?: LocalFile; items: WheelItem[]; label: string; subtitle?: string; selected?: string; onHighlight?: (id: string) => void; onChoose: (id: string) => void; preview?: ReactNode; dragging?: boolean; hideDescription?: boolean }

export default function RadialWheel(props: RadialWheelProps) { return props.family === 'image' ? <ImageWheel {...props}/> : <ReferenceWheel {...props}/>; }
