import { useId } from 'react';
export const FRUIT = { x: 1160, y: 535, scale: .64 };
export function BotanicalScene() {
    const id = useId();
    return <svg className="botanical-scene" viewBox="0 0 1600 1100" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-sky-edge`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="white"/><stop data-sky-fade-start offset=".87" stopColor="white"/><stop data-sky-fade-end offset="1" stopColor="black"/></linearGradient>
      <mask id={`${id}-sky-mask`} maskUnits="userSpaceOnUse" x="-40" y="0" width="1680" height="1000"><rect x="-40" width="1680" height="1000" fill={`url(#${id}-sky-edge)`}/></mask>
      <clipPath id={`${id}-arrow`}><rect x="-1000" y="0" width="2422" height="1600"/></clipPath>
      <g id={`${id}-leaf`} fill="#477456" stroke="#233d2f" strokeWidth="1.4" strokeLinejoin="round"><path d="M0 0 C-22 -5 -60 -31 -66 -59 C-31 -62 -3 -30 0 0Z"/><path d="M0 0 Q-34 -29 -63 -56 M-13 -14 -12 -29 M-23 -24 -24 -41 M-34 -34 -39 -50 M-22 -23 -38 -26 M-38 -38 -51 -40" fill="none" strokeWidth=".9"/><path d="M-8 -9 -8 -21 M-16 -17 -17 -34 M-29 -29 -30 -45 M-43 -42 -46 -53 M-13 -15 -28 -16 M-30 -30 -45 -32 M-44 -43 -57 -44" fill="none" strokeWidth=".5" opacity=".6"/></g>
    </defs>
    <g data-camera>
      <g className="orchard-context">
        <image className="orchard-illustration" mask={`url(#${id}-sky-mask)`} href="/citrus/orchard.webp" x="-40" y="-25" width="1680" height="1050" preserveAspectRatio="none"/>
        <g className="focal-branch" fill="none" stroke="#233d2f" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1450 420 C1371 398 1276 354 1207 374 Q1164 385 1160 412" strokeWidth="17"/>
          <path d="M1450 418 C1371 397 1276 355 1207 373 Q1165 385 1160 412" stroke="#477456" strokeWidth="11"/>
          <path d="M1399 407 Q1313 381 1264 377 M1238 375 Q1203 376 1187 391" stroke="#fff6e8" strokeWidth="1.2" opacity=".6"/>
          <path className="fruit-stalk" d="M1160 403 Q1159 417 1160 425" strokeWidth="5"/>
        </g>
        <g className="branch-leaves"><use href={`#${id}-leaf`} transform="translate(1205 377) rotate(22) scale(1.42)"/><use href={`#${id}-leaf`} transform="translate(1263 376) rotate(145) scale(1.18)"/><use href={`#${id}-leaf`} transform="translate(1162 408) rotate(-35) scale(.9)"/><use href={`#${id}-leaf`} transform="translate(1330 387) rotate(60) scale(1.2)"/></g>
      </g>
      <g className="story-arrow-clip" clipPath={`url(#${id}-arrow)`}>
        <g className="story-arrow" data-arrow transform="translate(-300 535)" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <g className="arrow-trails" stroke="#ed8b31" strokeWidth="2"><path d="M-485 -9 h60 M-514 5 h49 M-478 15 h28"/></g>
          <path d="M-410 0 H-13" stroke="#233d2f" strokeWidth="5"/>
          <path d="M-410 -1 H-12" stroke="#ed8b31" strokeWidth="3.5"/>
          <path d="m-25 -9 25 9 -25 9 7 -9Z" fill="#ed8b31" stroke="#233d2f" strokeWidth="1.1"/>
          <path d="m-397 0 -20 -12 h24 l16 12 -16 12 h-24Z" fill="#ed8b31" stroke="#233d2f" strokeWidth="1.2"/>
        </g>
      </g>
      <g className="citrus-impact" transform={`translate(${FRUIT.x + 110} ${FRUIT.y})`} fill="none" stroke="#ed8b31" strokeWidth="2.2" strokeLinecap="round"><path d="m5 -21 8 -8 M10 -7 h14 M5 14 l10 8"/></g>
      <g className="citrus-droplets" transform={`translate(${FRUIT.x + 115} ${FRUIT.y + 13})`} fill="#ed8b31" stroke="#233d2f" strokeWidth=".7"><path className="citrus-droplet" d="M0 0 Q8 4 7 10 Q2 14 0 0Z"/><path className="citrus-droplet" d="M18 8 Q27 8 27 14 Q23 19 18 8Z"/><path className="citrus-droplet" d="M5 22 Q11 27 8 32 Q2 33 5 22Z"/></g>
    </g>
  </svg>;
}
