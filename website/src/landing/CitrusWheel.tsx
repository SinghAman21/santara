import { useId } from 'react';
import { ArrowDownToLine, AudioLines, Check, FileArchive, FileText, FileVideo, FlipHorizontal2, Image, Maximize2, RotateCw } from 'lucide-react';
import { citrusPoint, sectorPath } from './citrus-geometry';
import { type ImageAction } from './image-actions';
type WheelProps = {
    actions: ImageAction[];
    selected: string;
    onSelect: (id: string) => void;
    disabled: boolean;
    organic?: number;
    decorative?: boolean;
};
export function CitrusArtwork({ actions, selected, onSelect, disabled, organic = 0, decorative = false }: WheelProps) {
    const grainId = useId();
    return <>
    <defs><pattern id={grainId} width="17" height="19" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r=".6"/><circle cx="12" cy="14" r=".5"/><path d="M 12 3 l 2 1 M 4 13 l 1 2" fill="none" stroke="currentColor" strokeWidth=".6"/></pattern></defs>
    <circle className="citrus-rind" cx="200" cy="200" r="194"/>
    <circle className="citrus-pith" cx="200" cy="200" r="181"/>
    {actions.map((action, i) => {
            const angle = -90 + (i + .5) * 360 / actions.length;
            const label = citrusPoint(116, angle);
            const Icon = action.id === 'rotate' ? RotateCw : action.id === 'resize' ? Maximize2 : action.id === 'flip' ? FlipHorizontal2 : action.id === 'original' ? ArrowDownToLine : action.icon === 'archive' ? FileArchive : action.icon === 'audio' ? AudioLines : action.icon === 'video' ? FileVideo : action.icon === 'text' || action.icon === 'file' ? FileText : Image;
            return <g key={action.id} data-action-id={action.id} className={`wheel-segment ${selected === action.id ? 'is-selected' : ''}`} role={decorative ? undefined : 'button'} aria-label={decorative ? undefined : action.label} aria-pressed={decorative ? undefined : selected === action.id} aria-disabled={decorative ? undefined : disabled} tabIndex={decorative || disabled ? undefined : 0} onClick={decorative ? undefined : () => !disabled && onSelect(action.id)} onKeyDown={decorative ? undefined : event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (!disabled)
                            onSelect(action.id);
                    }
                    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                        event.preventDefault();
                        const nodes = event.currentTarget.parentElement?.querySelectorAll<SVGGElement>('[role="button"]');
                        const next = event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1 : (i + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + actions.length) % actions.length;
                        nodes?.[next]?.focus();
                    }
                }}>
        <path data-sector={i} d={sectorPath(i, actions.length, organic)}/>
        <g className="citrus-pulp-lines" style={{ opacity: organic }} aria-hidden="true">{[-15, -7, 2, 11, 18].map((offset, j) => {
                    const start = citrusPoint(75 + j % 2 * 9, angle + offset * .7), end = citrusPoint(156 + j % 2 * 6, angle + offset);
                    return <path key={j} d={`M ${start} Q ${citrusPoint(118, angle + offset + 2)} ${end}`}/>;
                })}</g>
        <g className="wheel-label"><Icon x={label[0] - 11} y={label[1] - 23} width="22" height="22"/><text x={label[0]} y={label[1] + 16} textAnchor="middle">{action.label}</text>{selected === action.id && <Check className="wheel-selected-check" x={label[0] + 25} y={label[1] + 6} width="12" height="12"/>}</g>
      </g>;
        })}
    <circle className="citrus-core" cx="200" cy="200" r={48 - 30 * organic}/>
    <g className="wheel-label"><text className="wheel-center" x="200" y="197" textAnchor="middle">your file,</text><text className="wheel-center" x="200" y="214" textAnchor="middle">reimagined.</text></g>
    <circle className="citrus-print" cx="200" cy="200" r="192" fill={`url(#${grainId})`} pointerEvents="none"/>
  </>;
}
export function CitrusWheel(props: WheelProps) {
    return <div className="citrus-wheel"><svg viewBox="0 0 400 400" role="group" aria-label="Choose a file action"><CitrusArtwork {...props}/></svg></div>;
}
// This SVG is the only featured orange on the page. The story positions it until
// its desktop anchor reaches the same point; it then becomes an ordinary inline wheel.
export function ContinuousWheel(props: WheelProps) {
    const skinId = useId();
    return <div className="citrus-wheel wheel-anchor" data-wheel-anchor>
    <svg className="continuous-fruit" viewBox="0 0 400 400" role="group" aria-label="Choose a file action" data-continuous-fruit>
      <defs><clipPath id={skinId} clipPathUnits="userSpaceOnUse"><rect data-skin-mask x="400" y="0" width="0" height="400"/></clipPath><pattern id={`${skinId}-grain`} width="22" height="23" patternUnits="userSpaceOnUse"><path d="m3 4 2 1 m11 13 1 2 m7 7 1 -1" stroke="#233d2f" strokeWidth="1.1" opacity=".3"/></pattern></defs>
      <g data-fruit className="persistent-fruit"><CitrusArtwork {...props}/>
        <g className="orange-skin" clipPath={`url(#${skinId})`} pointerEvents="none">
          <circle cx="200" cy="200" r="180" fill="#ed8b31"/><path d="M61 159 Q88 70 178 44 Q113 75 89 156Z" fill="#fff6e8" opacity=".48"/><path d="M313 79 Q382 181 332 285 Q299 350 211 371 Q309 314 328 211 Q338 150 313 79Z" fill="#d37129" opacity=".65"/><circle cx="200" cy="200" r="179" fill={`url(#${skinId}-grain)`}/><path d="M104 101 q15 -17 27 -20 M87 128 l6 -10 M293 306 l-13 12 M301 289 l8 -15" fill="none" stroke="#233d2f" strokeWidth="1.4" opacity=".55"/>
        </g>
      </g>
    </svg>
  </div>;
}
