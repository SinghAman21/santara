import type { ReactNode } from 'react';
import type { Family, WheelOption } from '../tools-data';
import './tool-motion.css';

const bars = [13, 24, 37, 20, 43, 31, 17, 39, 47, 28, 18, 34, 44, 25, 16, 36, 29, 42, 21, 14];

function Photo({ className = '' }: { className?: string }) {
  return <g className={className}>
    <rect x="63" y="45" width="234" height="172" rx="13" className="motion-paper"/>
    <rect x="74" y="56" width="212" height="150" rx="8" className="motion-sky"/>
    <circle cx="229" cy="96" r="22" className="motion-sun"/>
    <path d="M74 177 132 114 181 167 215 132 286 198 286 206 74 206Z" className="motion-hill"/>
    <path d="M74 191 121 157 168 199 219 160 286 207 74 207Z" className="motion-foreground"/>
  </g>;
}

function VideoFrame({ className = '' }: { className?: string }) {
  return <g className={className}>
    <rect x="62" y="40" width="236" height="153" rx="12" className="motion-screen"/>
    <circle cx="231" cy="83" r="16" className="motion-sun"/>
    <path d="M72 166 125 103 173 153 207 126 288 181 72 181Z" className="motion-hill"/>
    <path d="M168 93 168 137 204 115Z" className="motion-play"/>
  </g>;
}

function Timeline() {
  return <g><rect x="62" y="218" width="236" height="17" rx="5" className="motion-track"/>{[0,1,2,3,4,5].map(i => <rect key={i} x={66+i*39} y="222" width="34" height="9" rx="2" className="motion-track-frame"/>)}</g>;
}

function Wave({ y = 143, className = '', width = 7, gap = 4 }: { y?: number; className?: string; width?: number; gap?: number }) {
  return <g className={className}>{bars.map((height, i) => <rect key={i} x={70+i*(width+gap)} y={y-height/2} width={width} height={height} rx="3" className={`motion-wave-bar ${i % 3 === 0 ? 'motion-wave-high' : ''}`}/>)}</g>;
}

function PdfPage({ x = 90, y = 40, className = '' }: { x?: number; y?: number; className?: string }) {
  return <g transform={`translate(${x} ${y})`}><g className={className}>
    <rect width="150" height="190" rx="8" className="motion-paper"/>
    <rect x="18" y="21" width="72" height="9" rx="3" className="motion-text-strong"/>
    <rect x="18" y="47" width="110" height="5" rx="2" className="motion-text-line"/>
    <rect x="18" y="62" width="98" height="5" rx="2" className="motion-text-line"/>
    <rect x="18" y="77" width="112" height="5" rx="2" className="motion-text-line"/>
    <rect x="18" y="104" width="112" height="58" rx="5" className="motion-page-image"/>
  </g></g>;
}

function ImageMotion({ label }: { label: string }): ReactNode {
  switch (label) {
    case 'Compress': return <><Photo className="motion-compress-photo"/><rect x="89" y="237" width="180" height="9" rx="4" className="motion-track"/><rect x="89" y="237" width="180" height="9" rx="4" className="motion-compress-meter motion-accent"/><text x="89" y="266">QUALITY / SIZE</text></>;
    case 'Crop': return <><Photo/><rect x="97" y="69" width="166" height="124" rx="3" className="motion-crop-window"/><path d="M97 85V69h16m134 0h16v16M97 177v16h16m134 0h16v-16" className="motion-crop-corners"/><text x="97" y="242">KEEP THIS FRAME</text></>;
    case 'Resize': return <><Photo className="motion-resize-photo"/><rect x="46" y="29" width="268" height="205" rx="12" className="motion-resize-guide"/><text x="114" y="257">WIDTH × HEIGHT</text></>;
    case 'Rotate': return <><Photo className="motion-rotate-photo"/><path d="M255 228a70 70 0 0 0 51-69" className="motion-arrow"/><text x="107" y="255">TURN THE CANVAS</text></>;
    case 'Flip': return <><Photo className="motion-flip-photo"/><path d="M180 35v192" className="motion-axis"/><text x="108" y="253">MIRROR THE IMAGE</text></>;
    case 'Add background': return <><rect x="48" y="30" width="264" height="204" rx="14" className="motion-background-wash"/><Photo className="motion-background-photo"/><text x="107" y="256">NEW CANVAS MARGIN</text></>;
    case 'Edit photo': return <><Photo/><rect x="74" y="56" width="212" height="150" rx="8" className="motion-edit-wash"/><path d="M180 55v151" className="motion-edit-divider"/><text x="102" y="250">LIGHT / COLOR / CONTRAST</text></>;
    case 'Edit metadata': return <><Photo className="motion-metadata-photo"/><g className="motion-metadata-panel"><rect x="91" y="156" width="202" height="89" rx="9" className="motion-paper"/><text x="106" y="181">ARTIST</text><rect x="166" y="173" width="105" height="8" rx="3" className="motion-accent"/><text x="106" y="210">DATE</text><rect x="166" y="202" width="79" height="8" rx="3" className="motion-accent"/></g></>;
    case 'Delete metadata': return <><Photo className="motion-metadata-photo"/><g className="motion-delete-tags"><rect x="96" y="161" width="190" height="73" rx="8" className="motion-paper"/><text x="110" y="188">LOCATION</text><text x="110" y="215">CAMERA DETAILS</text></g><path d="M92 237 291 153" className="motion-delete-stroke"/></>;
    default: return <Photo/>;
  }
}

function VideoMotion({ label }: { label: string }): ReactNode {
  switch (label) {
    case 'Compress': return <><VideoFrame className="motion-compress-video"/><Timeline/><rect x="70" y="251" width="216" height="7" rx="3" className="motion-track"/><rect x="70" y="251" width="216" height="7" rx="3" className="motion-compress-meter motion-accent"/></>;
    case 'Trim': return <><VideoFrame/><Timeline/><rect x="70" y="217" width="48" height="19" className="motion-trim-outside"/><rect x="247" y="217" width="43" height="19" className="motion-trim-outside"/><path d="M119 210v34m128-34v34" className="motion-trim-handles"/></>;
    case 'Split': return <><VideoFrame/><g className="motion-split-left"><rect x="62" y="219" width="111" height="22" rx="5" className="motion-accent"/></g><g className="motion-split-right"><rect x="178" y="219" width="120" height="22" rx="5" className="motion-accent"/></g><path d="M176 206v49" className="motion-axis"/></>;
    case 'Merge': return <><VideoFrame/><rect x="66" y="220" width="107" height="22" rx="5" className="motion-merge-left"/><rect x="188" y="220" width="107" height="22" rx="5" className="motion-merge-right"/><text x="137" y="264">JOIN CLIPS</text></>;
    case 'Crop': return <><VideoFrame/><Timeline/><rect x="94" y="60" width="172" height="113" rx="3" className="motion-crop-window"/><path d="M94 74V60h14m144 0h14v14M94 159v14h14m144 0h14v-14" className="motion-crop-corners"/></>;
    case 'Resize': return <><VideoFrame className="motion-resize-photo"/><rect x="46" y="27" width="268" height="180" rx="14" className="motion-resize-guide"/><Timeline/></>;
    case 'Rotate': return <><VideoFrame className="motion-rotate-photo"/><path d="M251 228a70 70 0 0 0 48-67" className="motion-arrow"/></>;
    case 'Speed': return <><VideoFrame/><Timeline/><path d="M90 252h137" className="motion-speed-trail"/><circle cx="87" cy="252" r="8" className="motion-speed-dot"/><text x="241" y="262">2×</text></>;
    case 'Snapshot': return <><VideoFrame/><Timeline/><g className="motion-snapshot-card"><rect x="221" y="82" width="91" height="74" rx="6" className="motion-paper"/><rect x="230" y="91" width="73" height="56" rx="3" className="motion-sky"/><path d="M230 141 251 112 274 139 287 123 303 146Z" className="motion-hill"/></g></>;
    case 'Mute': return <><VideoFrame/><Timeline/><path d="M252 120h13l13-12v35l-13-12h-13Z" className="motion-speaker"/><path d="M285 111q15 16 0 31m8-39q23 24 0 47" className="motion-sound-waves"/><path d="M247 153 305 96" className="motion-mute-stroke"/></>;
    case 'Create GIF': return <><VideoFrame/><Timeline/><g className="motion-gif-frame-a"><rect x="76" y="57" width="70" height="51" rx="5" className="motion-paper"/></g><g className="motion-gif-frame-b"><rect x="145" y="76" width="70" height="51" rx="5" className="motion-accent"/></g><g className="motion-gif-frame-c"><rect x="213" y="95" width="70" height="51" rx="5" className="motion-paper"/></g><text x="252" y="264">GIF ↻</text></>;
    case 'Extract audio': return <><VideoFrame/><Timeline/><Wave y={253} className="motion-extracted-wave" width={7} gap={4}/></>;
    case 'Redact': return <><VideoFrame/><Timeline/><rect x="135" y="86" width="90" height="35" rx="3" className="motion-redaction"/><text x="130" y="263">FIXED AREA MASK</text></>;
    case 'Delete metadata': return <><VideoFrame/><Timeline/><g className="motion-delete-tags"><rect x="195" y="45" width="102" height="49" rx="6" className="motion-paper"/><text x="209" y="66">CAMERA</text><text x="209" y="82">DATE</text></g><path d="M194 102 301 39" className="motion-delete-stroke"/></>;
    default: return <VideoFrame/>;
  }
}

function AudioMotion({ label }: { label: string }): ReactNode {
  switch (label) {
    case 'Compress': return <><Wave className="motion-compress-wave"/><rect x="70" y="212" width="220" height="10" rx="5" className="motion-track"/><rect x="70" y="212" width="220" height="10" rx="5" className="motion-compress-meter motion-accent"/><text x="97" y="252">CODEC / QUALITY / SIZE</text></>;
    case 'Metadata': return <><Wave y={90} className="motion-soft-wave"/><g className="motion-metadata-panel"><rect x="69" y="139" width="222" height="102" rx="10" className="motion-paper"/><text x="87" y="166">TAG 01</text><rect x="154" y="157" width="113" height="7" rx="3" className="motion-accent"/><text x="87" y="196">TAG 02</text><rect x="154" y="187" width="83" height="7" rx="3" className="motion-accent"/><text x="87" y="226">TAG 03</text><rect x="154" y="217" width="102" height="7" rx="3" className="motion-accent"/></g></>;
    case 'Normalize': return <><Wave y={126} className="motion-normalize-wave"/><path d="M69 190h220" className="motion-target-line"/><text x="79" y="221">TARGET LOUDNESS</text><rect x="77" y="238" width="205" height="8" rx="4" className="motion-track"/><circle cx="217" cy="242" r="11" className="motion-normalize-knob"/></>;
    case 'Visualize': return <><rect x="56" y="42" width="248" height="188" rx="12" className="motion-visualizer-screen"/><Wave y={139} className="motion-visualizer-wave" width={7} gap={4}/><text x="118" y="257">SOUND → MOTION</text></>;
    case 'Trim': return <><Wave/><rect x="68" y="96" width="50" height="92" className="motion-trim-outside"/><rect x="247" y="96" width="44" height="92" className="motion-trim-outside"/><path d="M119 89v109m128-109v109" className="motion-trim-handles"/><text x="120" y="229">KEPT RANGE</text></>;
    case 'Channels': return <><text x="53" y="94">L</text><Wave y={85} className="motion-channel-left"/><text x="53" y="197">R</text><Wave y={189} className="motion-channel-right"/><path d="M180 126v20" className="motion-arrow"/><text x="149" y="260">MONO / STEREO</text></>;
    case 'Bleep': return <><Wave/><rect x="153" y="92" width="68" height="99" rx="5" className="motion-bleep-region"/><path d="M164 109v57m12-57v57m12-57v57m12-57v57m12-57v57" className="motion-bleep-lines"/><text x="117" y="232">REPLACE THIS RANGE</text></>;
    default: return <Wave/>;
  }
}

function PdfMotion({ label }: { label: string }): ReactNode {
  switch (label) {
    case 'Compress': return <><PdfPage x={73} y={37} className="motion-pdf-back"/><PdfPage x={98} y={45} className="motion-compress-pdf"/><text x="122" y="263">REWRITE STRUCTURE</text></>;
    case 'Extract pages': return <><PdfPage x={69} y={43}/><PdfPage x={98} y={48} className="motion-pdf-back"/><PdfPage x={122} y={53} className="motion-extract-page"/><text x="111" y="263">SELECTED PAGES</text></>;
    case 'Merge PDFs': return <><PdfPage x={35} y={45} className="motion-merge-pdf-left"/><PdfPage x={174} y={45} className="motion-merge-pdf-right"/><text x="148" y="262">ONE PDF</text></>;
    case 'Rotate pages': return <><PdfPage x={105} y={38} className="motion-rotate-photo"/><path d="M252 224a70 70 0 0 0 47-68" className="motion-arrow"/><text x="115" y="264">TURN PAGES</text></>;
    case 'Render page': return <><PdfPage x={56} y={40} className="motion-render-page"/><g className="motion-render-image"><rect x="184" y="85" width="117" height="102" rx="8" className="motion-paper"/><rect x="194" y="95" width="97" height="82" rx="4" className="motion-sky"/><circle cx="264" cy="117" r="10" className="motion-sun"/><path d="M194 160 222 130 248 157 270 140 291 171 194 171Z" className="motion-hill"/></g><text x="111" y="264">PAGE → IMAGE</text></>;
    default: return <PdfPage/>;
  }
}

function ArchiveMotion(): ReactNode {
  return <><rect x="75" y="86" width="210" height="136" rx="11" className="motion-archive-box"/><path d="M75 110h210" className="motion-archive-seam"/><rect x="167" y="108" width="26" height="30" rx="3" className="motion-archive-zip"/><g className="motion-unpacked-files"><rect x="105" y="54" width="62" height="78" rx="6" className="motion-paper"/><rect x="150" y="31" width="62" height="78" rx="6" className="motion-paper"/><rect x="194" y="56" width="62" height="78" rx="6" className="motion-paper"/></g><path d="M75 88 100 62h159l26 26" className="motion-archive-lid"/><text x="114" y="257">SAFE DESTINATION</text></>;
}

export function ToolMotion({ family, operation }: { family: Family; operation: WheelOption }) {
  const key = `${family.id}-${operation.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  let scene: ReactNode;
  if (family.id === 'images') scene = <ImageMotion label={operation.label}/>;
  else if (family.id === 'video') scene = <VideoMotion label={operation.label}/>;
  else if (family.id === 'audio') scene = <AudioMotion label={operation.label}/>;
  else if (family.id === 'pdf') scene = <PdfMotion label={operation.label}/>;
  else scene = <ArchiveMotion/>;
  return <div className={`tool-motion motion-${key}`}>
    <div className="tool-motion-label"><span>{family.name.toUpperCase()} / {operation.label.toUpperCase()}</span><span>{family.id === 'audio' ? 'PLANNED CONCEPT' : 'HOW IT WORKS'}</span></div>
    <svg viewBox="0 0 360 280" className="motion-svg" aria-hidden="true" focusable="false">{scene}</svg>
    <div className="tool-motion-caption"><strong>{operation.label}</strong><p>{operation.detail}</p></div>
  </div>;
}
