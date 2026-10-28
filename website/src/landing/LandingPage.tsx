import { useLayoutEffect, useRef } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Leaf, LockKeyhole, Mouse } from 'lucide-react';
import { BotanicalScene, FRUIT } from './BotanicalScene';
import { sectorPath } from './citrus-geometry';
import { clamp, smooth, mix, sceneAt, handoffAt } from './scroll-story';
import { ToolsShowcase } from './ToolsShowcase';
import { FileWorkspace } from './FileWorkspace';
import './landing.css';
import './story.css';
import './desktop.css';
function OrchardStory() {
    const story = useRef<HTMLElement>(null), stage = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const section = story.current, panel = stage.current;
        if (!section || !panel)
            return;
        const svg = panel.querySelector<SVGSVGElement>('.botanical-scene')!;
        const camera = svg.querySelector<SVGGElement>('[data-camera]')!;
        const arrow = svg.querySelector<SVGGElement>('[data-arrow]')!;
        const fruit = document.querySelector<SVGSVGElement>('[data-continuous-fruit]')!;
        const anchor = document.querySelector<HTMLElement>('[data-wheel-anchor]')!;
        if (!fruit || !anchor)
            return;
        const skin = fruit.querySelector<SVGRectElement>('[data-skin-mask]')!;
        const core = fruit.querySelector<SVGCircleElement>('.citrus-core')!;
        const heroControls = Array.from(panel.querySelectorAll<HTMLElement>('.orchard-copy a,.orchard-copy button'));
        const wheelLink = panel.querySelector<HTMLAnchorElement>('.transformation-caption a')!;
        const media = matchMedia('(prefers-reduced-motion: reduce)');
        let frame = 0;
        let metrics = { width: 1600, height: 1000, track: 1700, mobile: false, x: 0, y: 0, worldWidth: 1600, worldHeight: 1000 };
        function measure() {
            const width = panel!.clientWidth, height = panel!.clientHeight;
            const mobile = width <= 1000, worldWidth = mobile ? 800 : 1600;
            metrics = { width, height, mobile, track: Math.max(1, section!.offsetHeight - height), x: mobile ? 700 : 0, y: mobile ? -80 : 0, worldWidth, worldHeight: worldWidth * height / width };
            svg.setAttribute('viewBox', `${metrics.x} ${metrics.y} ${worldWidth} ${metrics.worldHeight}`);
            const skyEnd = mobile ? (FRUIT.y + metrics.worldHeight * .14 / 1.1) / 1000 : 1;
            svg.querySelector('[data-sky-fade-start]')?.setAttribute('offset', `${mobile ? skyEnd - .18 : .87}`);
            svg.querySelector('[data-sky-fade-end]')?.setAttribute('offset', `${skyEnd}`);
            schedule();
        }
        function draw() {
            frame = 0;
            const p = media.matches ? 0 : clamp(-section!.getBoundingClientRect().top / metrics.track);
            const scene = sceneAt(p);
            const { cut, geometry: geometric, approach, flight } = scene;
            const slot = anchor.getBoundingClientRect(), unit = metrics.width / metrics.worldWidth;
            const finalScale = slot.width / (400 * FRUIT.scale * unit);
            const targetX = mix(metrics.mobile ? metrics.x + metrics.worldWidth * .76 : FRUIT.x, metrics.x + (slot.left + slot.width / 2) / unit, approach);
            const targetY = mix(metrics.mobile ? metrics.y + metrics.worldHeight * (metrics.height < 600 ? .42 : .24) : FRUIT.y, metrics.y + metrics.worldHeight * .44, approach);
            const baseScale = metrics.mobile ? metrics.height < 600 ? .7 : 1.1 : 1;
            const scale = mix(baseScale * (1 + .025 * scene.anticipation), finalScale, approach);
            camera.setAttribute('transform', `translate(${targetX} ${targetY}) scale(${scale}) translate(${-FRUIT.x} ${-FRUIT.y})`);
            arrow.setAttribute('transform', `translate(${mix(-300, 1445, flight)} ${FRUIT.y})`);
            const finalY = metrics.height * .44;
            const storyEnd = window.scrollY + section!.getBoundingClientRect().top + metrics.track;
            const dockY = metrics.height - slot.width / 2 + (metrics.width <= 760 ? 40 : -28);
            const dockAt = Math.max(storyEnd + 1, window.scrollY + slot.top + slot.height / 2 - dockY);
            const { progress: bridge, docked } = handoffAt(window.scrollY, storyEnd, dockAt, media.matches);
            const wasDocked = fruit.dataset.docked === 'true';
            const sectors = Array.from(fruit.querySelectorAll<SVGPathElement>('[data-sector]'));
            if (docked) {
                fruit.style.position = 'absolute';
                fruit.style.left = '0';
                fruit.style.top = '0';
                fruit.style.width = '100%';
                fruit.style.height = '100%';
                fruit.style.transform = 'none';
                if (!wasDocked) {
                    sectors.forEach((path, index) => path.setAttribute('d', sectorPath(index, sectors.length, 0)));
                    core.setAttribute('r', '48');
                }
            }
            else {
                const panelTop = Math.max(0, panel!.getBoundingClientRect().top);
                const cx = p >= 1 ? slot.left + slot.width / 2 : (targetX - metrics.x) * unit;
                const cy = p >= 1 ? mix(finalY, dockY, bridge) : panelTop + (targetY - metrics.y) * unit;
                const factor = p >= 1 ? slot.width / 400 : FRUIT.scale * scale * unit;
                fruit.style.position = 'fixed';
                fruit.style.left = '0';
                fruit.style.top = '0';
                fruit.style.width = '400px';
                fruit.style.height = '400px';
                fruit.style.transform = `translate(${cx - 200 * factor}px,${cy - 200 * factor}px) scale(${factor})`;
                sectors.forEach((path, index) => path.setAttribute('d', sectorPath(index, sectors.length, 1 - geometric)));
                core.setAttribute('r', `${18 + 30 * geometric}`);
            }
            skin.setAttribute('x', `${(docked ? 1 : cut) * 400}`);
            skin.setAttribute('width', `${(1 - (docked ? 1 : cut)) * 400}`);
            fruit.style.setProperty('--geometry', `${docked ? 1 : geometric}`);
            const interactive = docked || p >= 1;
            fruit.dataset.docked = String(docked);
            fruit.dataset.interactive = String(interactive);
            fruit.setAttribute('aria-hidden', String(!interactive));
            fruit.querySelectorAll<SVGGElement>('[role="button"]').forEach(button => button.setAttribute('tabindex', interactive && button.getAttribute('aria-disabled') !== 'true' ? '0' : '-1'));
            const style = panel!.style;
            style.setProperty('--story-progress', `${p}`);
            style.setProperty('--cut', `${cut}`);
            style.setProperty('--geometry', `${geometric}`);
            style.setProperty('--copy-opacity', `${1 - smooth(.015, .16, p)}`);
            style.setProperty('--copy-y', `${-smooth(0, .18, p) * 24}px`);
            style.setProperty('--context-opacity', `${1 - scene.context}`);
            style.setProperty('--cream-opacity', `${scene.context}`);
            style.setProperty('--arrow-opacity', `${smooth(.19, .22, p) * (1 - smooth(.56, .69, p))}`);
            style.setProperty('--trail-opacity', `${Math.sin(flight * Math.PI) * .65}`);
            style.setProperty('--impact-opacity', `${smooth(.367, .38, p) * (1 - smooth(.38, .413, p))}`);
            style.setProperty('--droplet-opacity', `${smooth(.38, .401, p) * (1 - smooth(.43, .51, p))}`);
            style.setProperty('--droplet-distance', `${smooth(.38, .51, p) * 14}px`);
            style.setProperty('--caption-opacity', `${smooth(.46, .55, p) * (1 - smooth(.62, .72, p))}`);
            const finalOpacity = smooth(.83, .94, p), copyOpacity = 1 - smooth(.015, .16, p);
            style.setProperty('--final-opacity', `${finalOpacity}`);
            panel!.dataset.wheelReady = `${finalOpacity > .65}`;
            panel!.dataset.copyHidden = `${copyOpacity < .2}`;
            heroControls.forEach(control => { control.tabIndex = copyOpacity > .2 ? 0 : -1; });
            wheelLink.tabIndex = finalOpacity > .65 ? 0 : -1;
            panel!.dataset.motion = media.matches ? 'reduced' : 'full';
        }
        function schedule() {
            if (!frame)
                frame = requestAnimationFrame(draw);
        }
        const observer = new ResizeObserver(measure);
        observer.observe(panel);
        observer.observe(anchor);
        const header = document.querySelector('.site-header');
        if (header)
            observer.observe(header);
        measure();
        cancelAnimationFrame(frame);
        draw();
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', measure);
        media.addEventListener('change', measure);
        return () => { fruit.style.position = ''; fruit.style.transform = ''; fruit.removeAttribute('aria-hidden'); cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', measure); media.removeEventListener('change', measure); };
    }, []);
    function explore() {
        if (!story.current || !stage.current)
            return;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            document.getElementById('workspace')?.scrollIntoView();
            return;
        }
        const track = story.current.offsetHeight - stage.current.offsetHeight;
        window.scrollTo({ top: story.current.offsetTop + track * .43, behavior: 'smooth' });
    }
    return <section className="orchard-story" ref={story} aria-label="From orange to interface" id="orchard">
      <div className="orchard-stage" ref={stage}>
        <div className="orchard-cream"/>
        <BotanicalScene />
        <div className="orchard-copy"><p className="citrus-eyebrow"><span /> A DIFFERENT WAY TO WORK WITH FILES</p><h1>One file.<br />A whole world<br />of <em>possibilities.</em></h1><p className="hero-description">An ordinary orange. An unexpected interface.<br />Drag a file. Press <kbd>Shift</kbd>, <kbd>Alt</kbd> or <kbd>Ctrl</kbd> twice.</p><div className="hero-buttons"><button className="citrus-button" onClick={explore}>Explore the wheel <ArrowDown size={16}/></button><a href="#discover">Discover the tools <ArrowUpRight size={16}/></a></div><div className="hero-footnote"><LockKeyhole size={13}/> LOCAL BY NATURE <span><a href="#workspace">TRY REAL FILES <ArrowRight size={11}/></a></span></div></div>
        <div className="cut-caption"><span>01 / A FRESH PERSPECTIVE</span><p>There’s more<br /><em>on the inside.</em></p></div>
        <div className="transformation-caption"><span>02 / SAME SHAPE. NEW POSSIBILITIES.</span><h2>Nature had the<br /><em>right interface.</em></h2><a href="#workspace" tabIndex={-1}>Make it yours <ArrowDown size={15}/></a></div>
        <div className="hero-bottom"><span><Mouse size={16}/> A LITTLE SCROLL. A FRESH DISCOVERY.</span><span>01 — FROM THE ORCHARD</span></div>
      </div>
    </section>;
}
export function LandingPage() {
    return <main className="citrus-landing"><OrchardStory /><FileWorkspace />
    <ToolsShowcase />
    <section className="landing-outro"><p className="citrus-eyebrow">A LITTLE ORANGE. A LOT OF POSSIBILITIES.</p><h2>Less in the way.<br /><em>More in your hands.</em></h2><a className="citrus-button" href="/install">Bring Santra to your desktop <ArrowRight size={16}/></a><p>Free development preview · Windows & Linux x64</p></section>
  </main>;
}
