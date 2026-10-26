import { useState } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { catalogueEntries, catalogueHref, families, familyOptions } from '../tools-data';
import './tools-showcase.css';
const statusLabels = { bundled: 'Built in', conditional: 'Engine dependent', disabled: 'Not enabled' };
export function ToolsShowcase() {
    const [filter, setFilter] = useState<'all' | 'bundled' | 'conditional' | 'disabled'>('all');
    const visible = families.filter(f => filter === 'all' || f.status === filter);
    return <section className="tools-showcase catalogue-showcase" id="discover" aria-labelledby="discover-title">
    <div className="chapter-line"><span>04 / KEEP EXPLORING</span><span>THE COMPLETE TOOL CATALOGUE.</span></div>
    <div className="tools-showcase-heading"><h2 id="discover-title">Every file.<br /><em>Its own possibilities.</em></h2><a href="/tools">See all tools <ArrowUpRight size={17}/></a></div>
    <p className="catalogue-intro">Browse all {families.length} file families. Open a family to see every listed format and editor, including clearly marked concepts and routes that are not enabled.</p>
    <div className="catalogue-filters" role="group" aria-label="Filter catalogue by availability">{(['all', 'bundled', 'conditional', 'disabled'] as const).map(status => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === 'all' ? 'All families' : statusLabels[status]} <span>{status === 'all' ? families.length : families.filter(f => f.status === status).length}</span></button>)}</div>
    <div className="catalogue-grid">{visible.map(family => {
            const Icon = family.Icon, entries = catalogueEntries(family), concepts = entries.filter(e => e.option.availability === 'concept').length;
            return <article className="catalogue-card" key={family.id} data-family={family.id}>
      <div className="catalogue-card-top"><span className={`catalogue-icon status-${family.status}`}><Icon size={27} strokeWidth={1.2}/></span><span className={`catalogue-status status-${family.status}`}>{statusLabels[family.status]}</span></div>
      <h3><a href={catalogueHref(family)}>{family.name}<ArrowUpRight size={17}/></a></h3><p className="catalogue-note">{family.note}</p><p className="catalogue-formats">{family.formats}</p><p className="catalogue-backend">{family.backend}</p>
      <details className="catalogue-details"><summary><span>{entries.length ? `${family.outputs.length} formats · ${family.tools.length} ${concepts ? 'editor concepts' : 'tools'}` : 'Scope & availability'}</span><ChevronDown size={14}/></summary>
        <p className="catalogue-description">{family.detail}</p>
        {(['convert', 'tools'] as const).map(mode => { const options = familyOptions(family, mode); if (!options.length)
                return null; return <div className="catalogue-option-group" key={mode}><h4>{mode === 'convert' ? 'Output formats' : concepts ? 'Editor concepts · not enabled' : 'Tools'}</h4><ul>{options.map(option => <li key={option.label} data-catalogue-entry={`${family.id}:${mode}:${option.label}`}><a href={catalogueHref(family, mode, option)}><strong>{option.label}</strong><ArrowUpRight size={12}/></a><p>{option.detail}</p>{option.availability === 'concept' && <small>Concept only · not enabled</small>}{option.backend && <small>{option.backend}</small>}</li>)}</ul></div>; })}
        <p className="catalogue-caveat">{family.caveat}</p>
      </details>
    </article>;
        })}</div>
  </section>;
}
