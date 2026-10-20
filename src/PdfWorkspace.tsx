import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, FileText, Files, Info, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { Capability, LocalFile } from './types';
import './pdf-workspace.css';

export interface PdfWorkspaceProps {
  files: LocalFile[];
  capability: Capability;
  format: string;
  initialOptions: Record<string, string>;
  onApply: (format: string, values: Record<string, string>) => void | Promise<void>;
  onClose: () => void;
  loadPreview: (file: LocalFile) => Promise<{ url: string; width?: number; height?: number }>;
}

type FieldName = 'pages' | 'page' | 'dpi' | 'angle';
type Preview = { path: string; status: 'loading' | 'ready' | 'error'; url?: string; error?: string; width?: number; height?: number };
type FieldDefinition = { min?: number; max?: number; default?: number };

const fieldNames: FieldName[] = ['pages', 'page', 'dpi', 'angle'];
const fieldLabels: Record<FieldName, string> = { pages: 'Pages to include', page: 'Page to render', dpi: 'Resolution (DPI)', angle: 'Clockwise rotation' };
const fieldDefaults: Record<FieldName, string> = { pages: '1-z', page: '1', dpi: '300', angle: '90' };
const operationDetails: Record<string, { title: string; action: string; description: string }> = {
  'pdf-extract': { title: 'Extract pages', action: 'Extract pages', description: 'A few pages, or a whole new order. Make a PDF with just the pages you need.' },
  'pdf-merge': { title: 'Merge PDFs', action: 'Merge PDFs', description: 'Bring your documents together in one PDF, in the current selection order.' },
  'pdf-rotate': { title: 'Rotate pages', action: 'Rotate pages', description: 'Turn selected pages clockwise while keeping the rest of your document in place.' },
  compress: { title: 'Compress PDF', action: 'Compress PDF', description: 'Give the document structure a tidy-up, with your original safely kept.' },
  render: { title: 'Render a page', action: 'Render page', description: 'Save one selected page from each PDF as a PNG or JPG image.' },
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : 'An unexpected error occurred. Please try again.';
}

function normalizePages(value: string) {
  return value.split(',').map(part => part.trim().replace(/\s*-\s*/g, '-')).join(',');
}

function initialValues(schema: Record<string, unknown>, initialOptions: Record<string, string>) {
  const values: Record<string, string> = {};
  for (const name of fieldNames) {
    if (!Object.hasOwn(schema, name)) continue;
    const definition = schema[name];
    const range = definition && typeof definition === 'object' && !Array.isArray(definition) ? definition as FieldDefinition : null;
    values[name] = String(range?.default ?? (Array.isArray(definition) ? definition[0] : typeof definition === 'string' ? definition : fieldDefaults[name]));
  }
  return { ...values, ...initialOptions };
}

export default function PdfWorkspace({ files, capability, format, initialOptions, onApply, onClose, loadPreview }: PdfWorkspaceProps) {
  const identifier = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const previewLoader = useRef(loadPreview);
  const submittingRef = useRef(false);
  previewLoader.current = loadPreview;
  const operation = capability.operation || capability.id.split(':').pop() || '';
  const details = operationDetails[operation] || { title: capability.label, action: 'Apply', description: 'Choose the settings for your PDF output.' };
  const schema = capability.options && typeof capability.options === 'object' && !Array.isArray(capability.options) ? capability.options as Record<string, unknown> : {};
  const fields = fieldNames.filter(name => Object.hasOwn(schema, name));
  const [values, setValues] = useState(() => initialValues(schema, initialOptions));
  const [outputFormat, setOutputFormat] = useState(() => capability.outputs.includes(format) ? format : capability.outputs[0] || '');
  const [activeFileId, setActiveFileId] = useState(files[0]?.id || '');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [retry, setRetry] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [applyError, setApplyError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const file = files.find(item => item.id === activeFileId) || files[0];
  const previewPath = file?.ext.toLowerCase() === 'pdf' && !file.isDirectory ? file.path : '';
  const visiblePreview = preview?.path === previewPath ? preview : null;
  const selectionError = !files.length ? 'Select a PDF to use this workspace.'
    : files.some(item => item.ext.toLowerCase() !== 'pdf' || item.isDirectory) ? 'This workspace accepts PDF files only.'
      : operation === 'pdf-merge' && files.length < 2 ? 'Select at least two PDFs to merge.' : '';
  const capabilityError = !capability.available ? 'This operation is unavailable. Configure its local backend in Settings, then try again.'
    : !operationDetails[operation] ? 'This PDF operation is not supported in this workspace.'
      : !capability.outputs.length ? 'No output format is available for this operation.' : '';
  const blockingError = selectionError || capabilityError;
  const capabilityWarning = operation !== 'compress' && capability.warning?.includes('compression is structural') ? '' : capability.warning;
  const previewCaptionId = `${identifier}-preview-caption`;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    closeButtonRef.current?.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (!previewPath || !file) return;
    let ignore = false;
    setPreview({ path: previewPath, status: 'loading' });
    async function prepare() {
      try {
        const result = await previewLoader.current(file!);
        if (typeof result?.url !== 'string' || !result.url.trim()) throw new Error('The preview service returned no page image.');
        if (!ignore) setPreview({ ...result, path: previewPath, status: 'ready' });
      } catch (error) {
        if (!ignore) setPreview({ path: previewPath, status: 'error', error: errorMessage(error) });
      }
    }
    void prepare();
    return () => { ignore = true; };
  }, [previewPath, retry]);

  function updateValue(name: FieldName, value: string) {
    setValues(previous => ({ ...previous, [name]: value }));
    setErrors(previous => {
      const next = { ...previous };
      delete next[name];
      return next;
    });
    setApplyError('');
  }

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || blockingError) return;
    const nextErrors: Record<string, string> = {};
    const normalized = { ...values };
    if (!capability.outputs.includes(outputFormat)) nextErrors.format = 'Choose an available output format.';
    for (const name of fields) {
      const value = (values[name] || '').trim();
      if (name === 'pages') {
        const pages = normalizePages(value);
        if (!/^\d+(?:-\d+|-z)?(?:,\d+(?:-\d+|-z)?)*$/.test(pages) || (pages.match(/\d+/g) || []).some(page => !Number.isSafeInteger(Number(page)) || Number(page) < 1)) nextErrors.pages = 'Use page numbers from 1, ranges such as 2-5, or 1-z for all pages. Separate entries with commas.';
        normalized.pages = pages;
        continue;
      }
      const definition = schema[name];
      const range = definition && typeof definition === 'object' && !Array.isArray(definition) ? definition as FieldDefinition : {};
      const minimum = range.min ?? (name === 'dpi' ? 36 : name === 'angle' ? 90 : 1);
      const maximum = range.max ?? (name === 'dpi' ? 600 : name === 'angle' ? 270 : 100000);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > maximum) nextErrors[name] = `Enter a whole number from ${minimum} to ${maximum}.`;
      if (Array.isArray(definition) && !definition.some(choice => String(choice) === value)) nextErrors[name] = 'Choose one of the available values.';
      if (name === 'angle' && ![90, 180, 270].includes(Number(value))) nextErrors.angle = 'Choose 90°, 180° or 270° clockwise.';
      normalized[name] = value;
    }
    setErrors(nextErrors);
    setApplyError('');
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onApply(outputFormat, normalized);
    } catch (error) {
      setApplyError(errorMessage(error));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return <dialog ref={dialogRef} className="pdf-workspace" aria-labelledby={`${identifier}-title`} aria-describedby={`${identifier}-description`} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')).filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className="pdf-workspace__header">
      <div className="pdf-workspace__identity"><span className="pdf-workspace__mark"><FileText size={23} aria-hidden="true"/></span><div><p className="pdf-workspace__eyebrow">A LITTLE LESS PAPERWORK</p><h1 id={`${identifier}-title`}>{details.title}</h1></div></div>
      <div className="pdf-workspace__header-actions"><span className="pdf-workspace__local"><ShieldCheck size={15} aria-hidden="true"/>On your device</span><button ref={closeButtonRef} type="button" className="pdf-workspace__close" aria-label="Close PDF workspace" onClick={onClose}><X size={21} aria-hidden="true"/></button></div>
    </header>
    <div className="pdf-workspace__body">
      <section className="pdf-workspace__preview" aria-labelledby={`${identifier}-preview-title`}>
        <div className="pdf-workspace__preview-toolbar"><div><span className="pdf-workspace__eyebrow">YOUR DOCUMENT</span><h2 id={`${identifier}-preview-title`}>First page preview</h2></div><span className="pdf-workspace__source-badge">Source · page 1</span></div>
        {files.length > 1 && <label className="pdf-workspace__document-picker" htmlFor={`${identifier}-document`}>Preview document<select id={`${identifier}-document`} value={file?.id || ''} onChange={event => setActiveFileId(event.target.value)}>{files.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.name}</option>)}</select></label>}
        <figure className="pdf-workspace__figure">
          <div className="pdf-workspace__canvas" aria-busy={Boolean(previewPath && (!visiblePreview || visiblePreview.status === 'loading'))}>
            {!previewPath ? <div className="pdf-workspace__preview-message"><FileText size={36} aria-hidden="true"/><h3>No PDF to preview</h3><p>Close this workspace and select a PDF document.</p></div>
              : !visiblePreview || visiblePreview.status === 'loading' ? <div className="pdf-workspace__preview-message" role="status"><LoaderCircle size={30} className="pdf-workspace__spinner" aria-hidden="true"/><h3>Preparing the first page…</h3><p>Your preview is generated locally.</p></div>
                : visiblePreview.status === 'error' ? <div className="pdf-workspace__preview-message pdf-workspace__preview-message--error" role="alert"><FileText size={34} aria-hidden="true"/><h3>Preview unavailable</h3><p>{visiblePreview.error}</p><button type="button" className="pdf-workspace__secondary" onClick={() => setRetry(previous => previous + 1)}><RefreshCw size={15} aria-hidden="true"/>Retry preview</button><small>You can still apply this operation without a preview.</small></div>
                  : <img key={`${previewPath}-${retry}`} className="pdf-workspace__page" src={visiblePreview.url} alt={`First page of ${file?.name || 'the selected PDF'}`} aria-describedby={previewCaptionId} onError={() => setPreview(previous => previous?.path === previewPath ? { path: previewPath, status: 'error', error: 'The generated page image could not be displayed. Retry the preview.' } : previous)} />}
          </div>
          <figcaption id={previewCaptionId}><strong title={file?.name}>{file?.name || 'No document selected'}</strong><span>The preview shows the original first page. Settings are applied to the saved output.</span></figcaption>
        </figure>
      </section>
      <form className="pdf-workspace__settings" noValidate onSubmit={event => void apply(event)} aria-label="PDF output settings" aria-busy={submitting}>
        <div className="pdf-workspace__settings-content">
          <div className="pdf-workspace__settings-heading"><span className="pdf-workspace__eyebrow">MAKE IT YOURS</span><h2>Output settings</h2><p id={`${identifier}-description`}>{details.description}</p></div>
          {blockingError && <div className="pdf-workspace__error" role="alert">{blockingError}</div>}
          {operation === 'pdf-merge' && <section className="pdf-workspace__merge" aria-labelledby={`${identifier}-merge-title`}><h3 id={`${identifier}-merge-title`}><Files size={17} aria-hidden="true"/>Selection order <span>{files.length} PDFs</span></h3><ol>{files.map(item => <li key={item.id}><FileText size={16} aria-hidden="true"/><span title={item.name}>{item.name}</span></li>)}</ol><p>All pages are merged in the order shown. Document-level metadata is discarded.</p></section>}
          <fieldset className="pdf-workspace__fields" disabled={submitting}>
            <legend className="pdf-workspace__sr-only">Operation and output options</legend>
            <div className="pdf-workspace__field"><label htmlFor={`${identifier}-format`}>Output format</label><select id={`${identifier}-format`} value={outputFormat} aria-invalid={Boolean(errors.format)} aria-describedby={errors.format ? `${identifier}-format-error` : undefined} onChange={event => { setOutputFormat(event.target.value); setErrors(previous => { const next = { ...previous }; delete next.format; return next; }); setApplyError(''); }}>{capability.outputs.map(choice => <option key={choice} value={choice}>{choice.toUpperCase()}</option>)}</select>{errors.format && <p className="pdf-workspace__field-error" id={`${identifier}-format-error`}>{errors.format}</p>}</div>
            {fields.map(name => {
              const definition = schema[name];
              const choices = Array.isArray(definition) ? definition : null;
              const range = definition && typeof definition === 'object' && !choices ? definition as FieldDefinition : {};
              const help = name === 'pages' ? 'Use 1-z for all pages. z means the last page.' : name === 'page' ? 'One page per input PDF. The preview continues to show page 1.' : name === 'dpi' ? 'Higher resolution produces larger images and uses more memory.' : 'Rotation is added clockwise to the selected pages.';
              return <div className="pdf-workspace__field" key={name}><label htmlFor={`${identifier}-${name}`}>{name === 'pages' && operation === 'pdf-rotate' ? 'Pages to rotate' : fieldLabels[name]}</label>{choices ? <select id={`${identifier}-${name}`} value={values[name] ?? ''} aria-invalid={Boolean(errors[name])} aria-describedby={`${identifier}-${name}-help${errors[name] ? ` ${identifier}-${name}-error` : ''}`} onChange={event => updateValue(name, event.target.value)}>{choices.map(choice => <option key={String(choice)} value={String(choice)}>{name === 'angle' ? `${choice}° clockwise` : String(choice)}</option>)}</select> : <input id={`${identifier}-${name}`} type={name === 'pages' ? 'text' : 'number'} inputMode={name === 'pages' ? 'text' : 'numeric'} min={name === 'pages' ? undefined : range.min ?? (name === 'dpi' ? 36 : 1)} max={range.max} step={name === 'pages' ? undefined : 1} value={values[name] ?? ''} placeholder={name === 'pages' ? '3,1-2,6-z' : fieldDefaults[name]} spellCheck={false} autoComplete="off" aria-invalid={Boolean(errors[name])} aria-describedby={`${identifier}-${name}-help${errors[name] ? ` ${identifier}-${name}-error` : ''}`} onChange={event => updateValue(name, event.target.value)}/>}<p className="pdf-workspace__field-help" id={`${identifier}-${name}-help`}>{help}</p>{errors[name] && <p className="pdf-workspace__field-error" id={`${identifier}-${name}-error`}>{errors[name]}</p>}</div>;
            })}
          </fieldset>
          {operation === 'pdf-extract' && <div className="pdf-workspace__note"><Info size={17} aria-hidden="true"/><div><strong>Your pages, your order</strong><p>qpdf follows your explicit order: <code>3,1,2</code> puts page 3 first. Ranges such as <code>5-1</code> run backwards. Page bounds are checked when the job runs.</p></div></div>}
          {operation === 'compress' && <div className="pdf-workspace__note"><Info size={17} aria-hidden="true"/><div><strong>Structural compression</strong><p>Rebuilds PDF streams and structure without downsampling images. File size may stay the same or increase.</p></div></div>}
          {operation === 'render' && <div className="pdf-workspace__note"><Info size={17} aria-hidden="true"/><div><strong>One selected page per PDF</strong><p>This operation saves the page number above as one image for each input PDF. The preview stays on the original first page.</p></div></div>}
          {capabilityWarning && <p className="pdf-workspace__capability-note">{capabilityWarning}</p>}
          {applyError && <div className="pdf-workspace__error" ref={errorRef} role="alert" tabIndex={-1}><strong>Could not apply these settings</strong><p>{applyError}</p></div>}
          {Object.keys(errors).length > 0 && <p className="pdf-workspace__field-error" role="alert">Check the highlighted settings before continuing.</p>}
        </div>
        <footer className="pdf-workspace__footer"><p><span className="pdf-workspace__citrus-dot" aria-hidden="true"/>{operation === 'pdf-merge' ? 'One merged PDF' : `${files.length} ${files.length === 1 ? 'document' : 'documents'}`}<span>· Originals kept</span></p><button type="submit" className="pdf-workspace__apply" disabled={Boolean(blockingError) || submitting}>{submitting ? <><LoaderCircle size={17} className="pdf-workspace__spinner" aria-hidden="true"/>Applying…</> : <>{details.action}<ArrowRight size={17} aria-hidden="true"/></>}</button><button type="button" className="pdf-workspace__cancel" onClick={onClose}>Cancel <kbd>Esc</kbd></button></footer>
      </form>
    </div>
  </dialog>;
}
