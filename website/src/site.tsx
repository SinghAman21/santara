import { useEffect, useState, type ReactNode } from 'react';
import { LandingPage } from './landing/LandingPage';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleHelp, FileImage, FileText, FileVideo, HardDriveDownload, Leaf, LockKeyhole, Menu, Monitor, Moon, PackageCheck, ShieldCheck, Sun, X } from 'lucide-react';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader } from './components/ui/card';
import { ToolsPage } from './pages/ToolsPage';

type Route = 'home' | 'tools' | 'usecase' | 'pricing' | 'install';
const paths: Record<Route, string> = { home: '/', tools: '/tools', usecase: '/usecase', pricing: '/pricing', install: '/install' };
const routeTitle: Record<Route, string> = { home: 'Santara — A little orange. A lot of possibilities.', tools: 'Tools — Santara', usecase: 'Use cases — Santara', pricing: 'Pricing — Santara', install: 'Install — Santara' };
const cases = [
  { number: '01', title: 'A photo needs to fit.', copy: 'Resize a batch for a listing, crop a cover image, or strip location details before sharing. The untouched original stays put.', icon: FileImage, tags: ['Resize', 'Crop', 'Metadata'] },
  { number: '02', title: 'A clip has one good moment.', copy: 'Trim the useful seconds, save a frame, or make a small GIF. Video actions appear when a compatible local FFmpeg install is found.', icon: FileVideo, tags: ['Trim', 'Snapshot', 'GIF'] },
  { number: '03', title: 'A document needs to travel.', copy: 'Move text between practical formats with Pandoc when the required readers and writers are installed. Fidelity can vary by source.', icon: FileText, tags: ['DOCX', 'Text', 'Markdown'] },
  { number: '04', title: 'Files landed in the wrong place.', copy: 'Copy, move, reveal, or copy a path from the same file workspace. Originals remain the default.', icon: HardDriveDownload, tags: ['Copy', 'Move', 'Reveal'] },
];

function routeFromPath(path: string): Route { return (Object.keys(paths) as Route[]).find((key) => paths[key] === path) ?? 'home'; }
function navigate(path: string) {
  if (path === window.location.pathname) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function Link({ to, className = '', children, onClick, ...props }: { to: Route; className?: string; children: ReactNode; onClick?: () => void } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={paths[to]} className={className} onClick={(event) => { onClick?.(); if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0 && event.currentTarget.target !== '_blank') { event.preventDefault(); navigate(paths[to]); } }} {...props}>{children}</a>;
}
function Mark() { return <img className="site-mark" src="/santara.png" alt="" aria-hidden="true"/>; }
function Header({ route }: { route: Route }) {
  const [menu, setMenu] = useState(false); const [dark, setDark] = useState(() => localStorage.getItem('santara-theme') === 'dark');
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('santara-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => { setMenu(false); }, [route]);
  const links: Array<[Route, string]> = [['tools', 'Tools'], ['usecase', 'Use cases'], ['pricing', 'Pricing']];
  return <header className={`${route === 'home' ? 'citrus-site-header ' : ''}site-header sticky top-0 z-[var(--z-dropdown)] border-b border-line/80 bg-paper/90 backdrop-blur-xl`}>
    <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-8 lg:px-12">
      <Link to="home" aria-label="Santara home" className="group inline-flex min-h-11 items-center gap-2.5"><Mark/><span className="font-display text-[24px] tracking-[-.055em] text-ink">santara<span className="text-orange">.</span></span></Link>
      <nav aria-label="Main navigation" className={`${menu ? 'flex' : 'hidden'} order-3 w-full flex-wrap items-center gap-1 border-t border-line pt-2 md:order-none md:flex md:w-auto md:border-0 md:pt-0`}>
        {links.map(([id, label]) => <Link key={id} to={id} aria-current={route === id ? 'page' : undefined} className={`min-h-11 rounded-full px-4 py-3 text-sm transition hover:bg-surface-soft hover:text-action focus-visible:outline-2 focus-visible:outline-action ${route === id ? 'font-semibold text-action' : 'text-muted'}`}>{label}</Link>)}
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <Button hidden={route === 'home'} variant="ghost" size="icon" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark(!dark)}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</Button>
        <Link to="install" className="site-cta inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">Get Santara <ArrowDown size={15}/></Link>
        <Button variant="outline" size="icon" className="md:hidden" aria-label={menu ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={18}/> : <Menu size={18}/>}</Button>
      </div>
    </div>
  </header>;
}
function Footer({ home = false }: { home?: boolean }) { return <footer className={`${home ? 'citrus-site-footer ' : ''}border-t border-line bg-surface`}><div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-7 px-5 py-8 sm:px-8 md:grid-cols-[1fr_auto] md:items-center lg:px-12"><Link to="home" className="inline-flex min-h-11 items-center gap-2.5"><Mark/><span className="font-display text-xl tracking-tight">santara<span className="text-orange">.</span></span></Link><div className="flex flex-wrap items-center gap-2 text-sm text-muted"><Link to="tools" className="min-h-11 rounded-full px-3 py-3 hover:text-action">Tools</Link><Link to="usecase" className="min-h-11 rounded-full px-3 py-3 hover:text-action">Use cases</Link><Link to="pricing" className="min-h-11 rounded-full px-3 py-3 hover:text-action">Pricing</Link><Link to="install" className="min-h-11 rounded-full px-3 py-3 hover:text-action">Install</Link></div><p className="m-0 text-xs text-muted md:col-span-2">Windows and Linux · Local processing · Development preview · Capabilities vary by detected engine</p></div></footer>; }
function PageIntro({ eyebrow, title, italic, text, children }: { eyebrow: string; title: string; italic?: string; text: string; children?: ReactNode }) { return <div className="page-intro"><Badge><span className="size-1.5 rounded-full bg-orange"/>{eyebrow}</Badge><h1>{title}{italic && <> <em>{italic}</em></>}</h1><p>{text}</p>{children}</div>; }
function CTA({ label = 'Find your download' }: { label?: string }) { return <Link to="install" className="site-cta inline-flex min-h-12 flex-wrap items-center gap-2 rounded-full bg-action px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">{label}<ArrowRight size={16}/></Link>; }

function UseCasePage() {
  return <main className="usecase-page mx-auto max-w-[1280px] px-5 pb-20 pt-14 sm:px-8 lg:px-12 lg:pb-28 lg:pt-20">
    <PageIntro eyebrow="MADE FOR THE MOMENT BETWEEN FILES" title="From “where did it go?”" italic="to done." text="Everyday file work has a way of breaking your rhythm. Santara brings a few common next steps close, then lets you carry on."/>
    <div className="usecase-stories">
      {cases.map(({number,title,copy,icon:Icon,tags}) => <Link key={number} to="tools" className="usecase-story" aria-label={`Explore tools for ${title}`}>
        <span className="usecase-number">{number} / EVERYDAY WORK</span>
        <span className="usecase-icon"><Icon size={21}/></span>
        <div className="usecase-story-copy"><h2>{title}</h2><p>{copy}</p><div className="usecase-tags">{tags.map(tag => <span key={tag}>{tag}</span>)}</div></div>
        <span className="usecase-story-action">See the tools <ArrowUpRight size={17}/></span>
      </Link>)}
    </div>
    <section className="usecase-shortcut"><div><p className="tools-kicker"><span/> THE WORKSPACE GESTURE</p><h2>One small gesture.<br/><em>Right in the flow.</em></h2></div><div><p>Inside the desktop workspace, the action wheel brings forward conversion, tools, and file actions. An accessible picker offers another path; global shortcuts are still in development.</p><div className="usecase-shortcuts">{[['⇧','Convert'],['⌥','Tools'],['⌃','File actions']].map(([key,label]) => <span key={label}><kbd>{key}</kbd>{label}</span>)}</div></div></section>
    <p className="usecase-foot"><CircleHelp size={16}/> Santara is a desktop preview. Optional media and document workflows depend on locally detected engines.</p>
  </main>;
}
function PricingPage() {
  return <main className="pricing-page mx-auto max-w-[1100px] px-5 pb-20 pt-14 sm:px-8 lg:px-12 lg:pb-28 lg:pt-20">
    <PageIntro eyebrow="CLEAR TODAY. HONEST ABOUT TOMORROW." title="A calmer way to work." italic="A clear price." text="Santara is currently a free development preview. There are no paid tiers or subscription screen in this release."/>
    <section className="pricing-sheet" aria-label="Current preview pricing">
      <div className="pricing-main"><p className="tools-kicker"><span/> CURRENT PREVIEW</p><div className="pricing-amount"><strong>$0</strong><span>today</span></div><h2>Nothing between you and your files.</h2><p>Use the current Windows or Linux preview on your computer. No account, usage meter, or conversion upload.</p><CTA label="Find your download"/></div>
      <div className="pricing-details"><span className="pricing-details-kicker">01—03 / INCLUDED</span><h2>A useful foundation, already here.</h2><div className="pricing-features">{[['Local by design','Files are processed on your device.'],['Originals stay put','A new output is saved beside the source where possible.'],['Capabilities that tell the truth','Optional actions appear when a compatible local engine is detected.']].map(([title,copy],index) => <div key={title}><span>{String(index+1).padStart(2,'0')}</span><div><strong>{title}</strong><p>{copy}</p></div><Check size={18}/></div>)}</div><p className="pricing-release-note">Windows and Linux previews are available. Future pricing has not been announced.</p></div>
    </section>
  </main>;
}
function InstallPage() {
  const [platform, setPlatform] = useState<'linux' | 'windows'>(() => /Win/i.test(navigator.userAgent) ? 'windows' : 'linux');
  const [packageType, setPackageType] = useState<'deb' | 'AppImage'>('deb');
  const isWindows = platform === 'windows';
  const file = isWindows
    ? 'Santara-0.1.0-win-x64.exe'
    : packageType === 'deb'
      ? 'Santara-0.1.0-linux-amd64.deb'
      : 'Santara-0.1.0-linux-x86_64.AppImage';
  const releaseBase = (import.meta.env.VITE_SANTARA_RELEASE_BASE_URL ?? 'https://github.com/SinghAman21/santara/releases/download/v0.1.0-preview').replace(/\/$/, '');
  const downloadUrl = import.meta.env.DEV ? `/downloads/${file}` : `${releaseBase}/${file}`;
  const packageName = isWindows ? 'Windows installer' : packageType === 'deb' ? 'Debian package' : 'AppImage';

  return <main className="mx-auto max-w-[1180px] px-5 pb-20 pt-14 sm:px-8 lg:px-12 lg:pb-28 lg:pt-20">
    <PageIntro eyebrow="A DESKTOP APP, READY TO MEET YOUR FILES" title="Install once." italic="Keep it local." text="Choose the Windows or Linux preview. Santara runs on your computer. A limited, local browser image workspace is available on the home page."/>
    <div className="mt-11 grid gap-7 lg:grid-cols-[.66fr_1.34fr]">
      <aside className="install-aside rounded-[28px] border border-line bg-surface p-6 sm:p-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-leaf/10 text-leaf"><ShieldCheck size={22}/></span>
        <h2 className="mt-5 font-display text-3xl">Your computer.<br/>Your files.</h2>
        <p className="text-sm leading-7 text-muted">Santara processes files locally. No account, conversion upload, or cloud queue is part of this preview.</p>
        <div className="mt-6 grid gap-3 border-t border-line pt-5 text-xs text-muted">
          <span className="flex items-center gap-2"><LockKeyhole size={14} className="text-leaf"/> Local processing</span>
          <span className="flex items-center gap-2"><Monitor size={14} className="text-leaf"/> Windows & Linux</span>
          <span className="flex items-center gap-2"><PackageCheck size={14} className="text-leaf"/> x64 development build</span>
        </div>
      </aside>
      <Card className="overflow-hidden rounded-[28px]">
        <div className="grid grid-cols-2 border-b border-line bg-surface-soft" role="group" aria-label="Choose an operating system">
          {([['linux', 'Linux', 'DEB · APPIMAGE'], ['windows', 'Windows', 'EXE · X64']] as const).map(([id, label, note]) =>
            <button key={id} aria-pressed={platform === id} onClick={() => setPlatform(id)} className={`flex min-h-[68px] flex-wrap items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm transition focus-visible:outline-2 focus-visible:outline-action ${platform === id ? 'border-orange bg-surface font-semibold text-ink' : 'border-transparent text-muted hover:bg-paper'}`}>
              <span>{label}</span><small className="text-[9px] font-bold tracking-wide text-muted">{note}</small>
            </button>
          )}
        </div>
        <div id="download-panel" className="p-5 sm:p-8">
          {!isWindows && <div className="flex flex-wrap gap-2" role="group" aria-label="Choose Linux package">
            {(['deb', 'AppImage'] as const).map(type =>
              <button key={type} onClick={() => setPackageType(type)} aria-pressed={packageType === type} className={`min-h-11 rounded-full border px-4 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-action ${packageType === type ? 'border-orange/45 bg-orange-wash text-action' : 'border-line bg-surface text-muted hover:bg-surface-soft'}`}>
                <span>{type === 'deb' ? '.deb' : 'AppImage'}</span><span className="ml-2 font-normal">{type === 'deb' ? 'Debian · Ubuntu' : 'Portable Linux'}</span>
              </button>
            )}
          </div>}
          <div className="mt-7 flex flex-wrap items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-orange-wash text-action"><HardDriveDownload size={21}/></span>
            <div className="min-w-0 flex-1">
              <Badge>{isWindows ? 'WINDOWS' : 'LINUX'} · X64 · VERSION 0.1.0</Badge>
              <h2 className="mt-3 font-display text-3xl tracking-tight">{isWindows ? 'Santara for Windows' : packageType === 'deb' ? 'Santara for Debian & Ubuntu' : 'Santara AppImage'}</h2>
              <p className="max-w-[590px] text-sm leading-7 text-muted">{isWindows ? 'Download the Windows installer and follow the setup steps. This preview may show an unsigned app warning.' : packageType === 'deb' ? 'Install with your software manager or use the apt command below.' : 'Mark the AppImage executable, then open it. Desktop integration varies by Linux distribution.'}</p>
              <div className="mt-5 rounded-2xl border border-line bg-paper p-4">
                <p className="m-0 text-[10px] font-bold tracking-[.12em] text-muted">{isWindows ? 'SETUP' : 'QUICK INSTALL'}</p>
                {isWindows ? <p className="mb-0 mt-2 text-xs leading-6 text-ink">Open <strong>{file}</strong> after downloading.</p> : <code className="mt-2 block max-w-full break-all text-xs leading-6 text-ink">{packageType === 'deb' ? 'sudo apt install ./Santara-0.1.0-linux-amd64.deb' : 'chmod +x Santara-0.1.0-linux-x86_64.AppImage'}</code>}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <a href={downloadUrl} className="site-cta inline-flex min-h-12 items-center gap-2 rounded-full bg-action px-5 py-3 text-sm font-semibold text-white transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">Download {packageName} <ArrowDown size={16}/></a>
                <span className="text-xs text-muted">Development preview · 64-bit</span>
              </div>
            </div>
          </div>
          <div className="install-steps">
            {[
              ['01', 'Download the package', `Choose the ${packageName} above.`],
              ['02', isWindows ? 'Run the installer' : 'Install or allow launch', isWindows ? 'Follow the setup prompts on your PC.' : 'Use your package manager, or mark the AppImage executable.'],
              ['03', 'Open Santara', 'Add files in the desktop workspace. Processing stays local.'],
            ].map(([n, title, copy]) => <div key={n} className="install-step"><span className="text-[10px] font-bold tracking-widest text-action">{n}</span><b className="mt-2 block text-sm">{title}</b><p className="mb-0 mt-1 text-xs leading-5 text-muted">{copy}</p></div>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper px-5 py-4 text-[11px] text-muted sm:px-8"><span className="flex items-center gap-2"><Leaf size={14} className="text-leaf"/> Free development preview</span><span>Optional capabilities depend on detected local tools.</span></div>
      </Card>
    </div>
    <p className="mt-6 flex flex-wrap items-start gap-2 text-xs leading-5 text-muted"><CircleHelp size={14} className="mt-0.5 shrink-0"/> These development preview builds may be unsigned. Windows and Linux installers are hosted as GitHub release assets.</p>
  </main>;
}

export function App() {
 const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));
 useEffect(() => { const onPop = () => setRoute(routeFromPath(window.location.pathname)); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
 useEffect(() => { document.title = routeTitle[route]; }, [route]);
 return <div className="min-h-screen bg-paper text-ink"><Header route={route}/>{route==='home'?<LandingPage/>:route==='tools'?<ToolsPage onInstall={() => navigate(paths.install)}/>:route==='usecase'?<UseCasePage/>:route==='pricing'?<PricingPage/>:<InstallPage/>}<Footer home={route === 'home'}/></div>;
}
