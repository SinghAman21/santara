// Both the illustrated pulp and the working wheel use these exact coordinates.
export const citrusPoint = (radius: number, degrees: number): [number, number] => [
  200 + radius * Math.cos(degrees * Math.PI / 180),
  200 + radius * Math.sin(degrees * Math.PI / 180),
];
export function sectorPath(index: number, count: number, organic = 0) {
  const start = -90 + index * 360 / count + 1.2;
  const end = -90 + (index + 1) * 360 / count - 1.2;
  const inner = 57 - organic * 34;
  const points: [number, number][] = [];
  // Fixed point counts let the pulp settle into precise geometry without swapping layers.
  for (let step = 0; step <= 16; step++) {
    const t = step / 16;
    points.push(citrusPoint(174 + organic * Math.sin(t * Math.PI * 2 + index * 1.7) * 2, start + (end - start) * t));
  }
  for (let step = 1; step <= 6; step++) {
    const t = step / 6;
    points.push(citrusPoint(174 - (174-inner) * t, end + Math.sin(t * Math.PI) * organic * 2.7));
  }
  for (let step = 1; step <= 10; step++) {
    const t = step / 10;
    points.push(citrusPoint(inner + organic * Math.sin(t * Math.PI + index) * 3, end - (end - start) * t));
  }
  for (let step = 1; step < 6; step++) {
    const t = step / 6;
    points.push(citrusPoint(inner + (174-inner) * t, start - Math.sin(t * Math.PI) * organic * 2.7));
  }
  return `M ${points.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' L ')} Z`;
}
