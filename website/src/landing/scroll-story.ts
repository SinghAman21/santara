// The existing pinned section is the clock. Every visual channel is sampled from
// its absolute progress; no channel remembers scroll direction or prior docking.
export const STORY_PHASES = {
    whole: [0, .20],
    approach: [.16, .20],
    arrow: [.20, .44],
    cut: [.365, .40],
    zoom: [.46, .91],
    geometry: [.62, .91],
    context: [.55, .88],
} as const;
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function smooth(start: number, end: number, value: number) {
    const t = clamp((value - start) / (end - start));
    return t * t * (3 - 2 * t);
}
export const mix = (start: number, end: number, t: number) => start + (end - start) * t;
export function sceneAt(progress: number) {
    const p = clamp(progress);
    return {
        progress: p,
        anticipation: smooth(...STORY_PHASES.approach, p),
        flight: smooth(...STORY_PHASES.arrow, p),
        cut: smooth(...STORY_PHASES.cut, p),
        approach: smooth(...STORY_PHASES.zoom, p),
        geometry: smooth(...STORY_PHASES.geometry, p),
        context: smooth(...STORY_PHASES.context, p),
    };
}
export function handoffAt(scroll: number, storyEnd: number, dockAt: number, reducedMotion: boolean) {
    const progress = smooth(storyEnd, Math.max(storyEnd + 1, dockAt), scroll);
    return { progress, docked: reducedMotion || scroll >= dockAt };
}
