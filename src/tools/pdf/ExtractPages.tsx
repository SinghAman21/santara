import { Info } from 'lucide-react';
export default function ExtractPages() { return <div className="pdf-workspace__note"><Info size={17} aria-hidden="true"/><div><strong>Your pages, your order</strong><p>qpdf follows your explicit order: <code>3,1,2</code> puts page 3 first. Ranges such as <code>5-1</code> run backwards. Page bounds are checked when the job runs.</p></div></div>; }
