import { families, familyOptions } from '../tools-data';
import { getBrowserActions, processImage, validateImage, type ImageAction, type Output, type Mode } from './image-actions';
export type FileKind = 'images' | 'pdf' | 'documents' | 'subtitles' | 'archives' | 'audio' | 'video' | 'spreadsheets' | 'unknown';
export type FileInfo = {
    kind: FileKind;
    extension: string;
    mime: string;
    warning?: string;
    text?: string;
};
export type FileAction = ImageAction & {
    engine?: 'image' | 'subtitle' | 'zip' | 'gzip' | 'original' | 'desktop';
    target?: string;
    unavailable?: string;
};
const extensionOf = (name: string) => name.toLowerCase().split('.').pop() ?? '';
const original: FileAction = { id: 'original', label: 'Download original', mode: 'actions', description: 'Download the exact source bytes. The original remains on your desktop.', engine: 'original' };
const zip: FileAction = { id: 'zip', label: 'Create ZIP', mode: 'actions', description: 'Package this file in a real ZIP using STORE, matching the desktop archive scope. Size may increase.', engine: 'zip', icon: 'archive' };
export async function inspectFile(file: File): Promise<FileInfo> {
    if (file.size > 20 * 1024 * 1024)
        throw new Error('Choose a file under 20 MB for this browser playground. Use the desktop app for larger files.');
    const bytes = new Uint8Array(await file.slice(0, 65536).arrayBuffer()), extension = extensionOf(file.name);
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    if ((bytes[0] === 137 && ascii(1, 4) === 'PNG') || (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) || (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP')) {
        await validateImage(file);
        if (typeof createImageBitmap === 'function') {
            let decoded: ImageBitmap;
            try {
                decoded = await createImageBitmap(file);
            }
            catch {
                throw new Error('This image could not be decoded. It may be damaged or unsupported.');
            }
            const pixels = decoded.width * decoded.height;
            decoded.close();
            if (pixels > 24000000)
                throw new Error('This image exceeds the browser limit of 24 megapixels.');
        }
        return { kind: 'images', extension, mime: bytes[0] === 137 ? 'image/png' : bytes[0] === 255 ? 'image/jpeg' : 'image/webp' };
    }
    if (['png', 'jpg', 'jpeg', 'webp'].includes(extension))
        throw new Error('The file signature does not match a supported image. PNG, JPEG and WebP are accepted; renaming another file does not convert it.');
    if (ascii(0, 5) === '%PDF-')
        return { kind: 'pdf', extension: 'pdf', mime: 'application/pdf', warning: 'PDF operations require the desktop app with detected qpdf or Poppler. No PDF engine is loaded in this browser.' };
    if (ascii(0, 2) === 'PK' && ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6))) {
        if (extension === 'docx' && new TextDecoder().decode(bytes).includes('word/'))
            return { kind: 'documents', extension, mime: file.type, warning: 'DOCX conversion requires detected Pandoc in the desktop app.' };
        return { kind: 'archives', extension: 'zip', mime: 'application/zip', warning: 'Archive extraction is desktop-only. This browser never extracts or executes archive entries.' };
    }
    if (bytes[0] === 31 && bytes[1] === 139)
        return { kind: 'archives', extension: 'gz', mime: 'application/gzip', warning: 'GZIP extraction requires the desktop app.' };
    if (ascii(257, 262) === 'ustar')
        return { kind: 'archives', extension: 'tar', mime: 'application/x-tar', warning: 'TAR extraction requires the desktop app.' };
    if ((ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') || ascii(0, 3) === 'ID3' || ascii(0, 4) === 'fLaC')
        return { kind: 'audio', extension, mime: file.type, warning: 'Audio conversion requires a compatible local FFmpeg installation in Santra desktop.' };
    if (ascii(4, 8) === 'ftyp' || ascii(0, 4) === 'OggS')
        return { kind: extension === 'mp4' || extension === 'mov' ? 'video' : 'audio', extension, mime: file.type, warning: 'Media processing requires detected FFmpeg in the desktop app.' };
    if (['txt', 'md', 'markdown', 'srt', 'vtt', 'csv', 'tsv'].includes(extension)) {
        let text: string;
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
        }
        catch {
            throw new Error('Text and subtitles must be valid UTF-8.');
        }
        if (text.includes('\0'))
            throw new Error('This file contains binary data; it is not a supported text file.');
        if (extension === 'vtt' || extension === 'srt')
            return { kind: 'subtitles', extension, mime: extension === 'vtt' ? 'text/vtt' : 'application/x-subrip', text };
        if (['csv', 'tsv'].includes(extension))
            return { kind: 'spreadsheets', extension, mime: 'text/csv', text, warning: 'Spreadsheet conversion is disabled in the current product. You can download the source or create an archive.' };
        return { kind: 'documents', extension, mime: 'text/plain', text, warning: 'Document format conversion requires locally verified Pandoc routes in the desktop app.' };
    }
    return { kind: 'unknown', extension, mime: file.type || 'application/octet-stream', warning: 'No verified editing or conversion route is available for this file. Its contents will not be executed.' };
}
export function actionsFor(info: FileInfo, mode: Mode): FileAction[] {
    const fileActions = [original, zip];
    if (typeof CompressionStream !== 'undefined')
        fileActions.push({ id: 'gzip', icon: 'archive', label: 'Create GZIP', mode: 'actions', engine: 'gzip', description: 'GZIP this single file locally. Size may increase; no source file is modified.' });
    if (mode === 'actions')
        return fileActions;
    let primary: FileAction[] = [];
    if (info.kind === 'images')
        primary = getBrowserActions().filter(a => a.mode !== 'actions' && familyOptions(families.find(f => f.id === 'images')!, a.mode === 'convert' ? 'convert' : 'tools', { includeConcepts: false }).some(option => option.label === a.label)).map(a => ({ ...a, engine: 'image' }));
    else if (info.kind === 'subtitles')
        primary = (families.find(f => f.id === 'subtitles')!.outputs).map(option => ({ id: `subtitle-${option.label.toLowerCase()}`, icon: 'text', label: option.label, mode: 'convert', description: `${option.detail} Runs locally with the same cue/timestamp rules as the desktop converter. Styling is not preserved.`, engine: 'subtitle', target: option.label.toLowerCase() }));
    else {
        const family = families.find(f => f.id === info.kind);
        if (family && family.status !== 'disabled') {
            primary = (['convert', 'tools'] as const).flatMap(kind => familyOptions(family, kind, { includeConcepts: false }).map(option => ({
                id: `desktop-${kind}-${option.label.toLowerCase().replaceAll(' ', '-')}`,
                icon: info.kind === 'archives' ? 'archive' as const : info.kind === 'audio' ? 'audio' as const : info.kind === 'video' ? 'video' as const : 'text' as const,
                label: option.label, mode: kind, description: option.detail, engine: 'desktop' as const,
                unavailable: option.backend ? `${option.backend} is required in Santra desktop.` : info.warning || 'This operation needs Santra desktop and a detected local engine.',
            })));
        }
    }
    if (mode !== 'all')
        return primary.filter(a => a.mode === mode);
    return primary.length ? primary : fileActions;
}
function stamp(value: string) {
    const match = value.trim().match(/^(?:(\d{2}):)?(\d{2}):(\d{2})[,.](\d{3})$/);
    if (!match || Number(match[2]) > 59 || Number(match[3]) > 59)
        throw new Error('Invalid subtitle timestamp. Use HH:MM:SS,mmm or MM:SS.mmm.');
    return (Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000 + Number(match[4]);
}
function subtitle(source: string, input: string, target: string) {
    let body = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (input === 'vtt') {
        if (!body.startsWith('WEBVTT'))
            throw new Error('Missing WEBVTT header.');
        body = body.slice(body.indexOf('\n') < 0 ? body.length : body.indexOf('\n')).trim();
    }
    const cues = body ? body.split(/\n\s*\n/).filter(block => input !== 'vtt' || !['NOTE', 'STYLE', 'REGION'].some(prefix => block.startsWith(prefix))).map(block => {
        const lines = block.split('\n'), at = lines.findIndex(line => line.includes('-->'));
        if (at < 0 || at > 1)
            throw new Error('Invalid subtitle cue.');
        const timing = lines[at].split('-->');
        if (timing.length !== 2)
            throw new Error('Invalid subtitle timing.');
        const start = stamp(timing[0]), end = stamp(timing[1].trim().split(/\s/)[0]);
        if (end < start)
            throw new Error('Subtitle ends before it starts.');
        return { start, end, text: lines.slice(at + 1).join('\n') };
    }) : [];
    if (cues.length > 100000)
        throw new Error('Too many subtitle cues.');
    if (target === 'txt')
        return cues.map(c => {
            let plain = '', inside = false;
            for (const character of c.text) {
                if (character === '<')
                    inside = true;
                else if (character === '>' && inside)
                    inside = false;
                else if (!inside)
                    plain += character;
            }
            return plain;
        }).join('\n\n') + '\n';
    const time = (n: number) => `${String(Math.floor(n / 3600000)).padStart(2, '0')}:${String(Math.floor(n / 60000) % 60).padStart(2, '0')}:${String(Math.floor(n / 1000) % 60).padStart(2, '0')}${target === 'srt' ? ',' : '.'}${String(n % 1000).padStart(3, '0')}`;
    return (target === 'vtt' ? 'WEBVTT\n\n' : '') + cues.map((c, i) => `${target === 'srt' ? `${i + 1}\n` : ''}${time(c.start)} --> ${time(c.end)}\n${c.text}`).join('\n\n') + '\n';
}
export async function makeZip(file: File): Promise<Blob> {
    if (file.size > 20 * 1024 * 1024)
        throw new Error('Archive source exceeds the 20 MB browser limit.');
    const data = new Uint8Array(await file.arrayBuffer());
    let safe = file.name.replace(/[^\p{L}\p{N} ._-]/gu, '_').slice(0, 100).trim();
    if (!safe || safe === '.' || safe === '..')
        safe = 'file';
    const name = new TextEncoder().encode(safe);
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let b = 0; b < 8; b++)
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + name.length), central = new Uint8Array(46 + name.length), end = new Uint8Array(22);
    const l = new DataView(local.buffer), c = new DataView(central.buffer), e = new DataView(end.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    central.set(name, 46);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, 1, true);
    e.setUint16(10, 1, true);
    e.setUint32(12, central.length, true);
    e.setUint32(16, local.length + data.length, true);
    return new Blob([local, data, central, end], { type: 'application/zip' });
}
export async function processFile(file: File, info: FileInfo, action: FileAction): Promise<Output> {
    const start = performance.now();
    if (action.engine === 'desktop')
        throw new Error(action.unavailable);
    if (action.engine === 'image')
        return processImage(file, action);
    let blob: Blob, name = file.name;
    const stem = file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} _-]/gu, '_').slice(0, 100) || 'file';
    if (action.engine === 'subtitle') {
        if (file.size > 16 * 1024 * 1024)
            throw new Error('Subtitle exceeds 16 MiB.');
        blob = new Blob([subtitle(await file.text(), info.extension, action.target!)], { type: action.target === 'vtt' ? 'text/vtt' : 'text/plain' });
        name = `${stem}-converted.${action.target}`;
    }
    else if (action.engine === 'zip') {
        blob = await makeZip(file);
        name = `${stem}-archive.zip`;
    }
    else if (action.engine === 'gzip') {
        const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
        blob = new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' });
        name = `${file.name.replace(/[^\p{L}\p{N} ._-]/gu, '_')}.gz`;
    }
    else
        blob = file;
    return { name, blob, duration: performance.now() - start, operation: action.label };
}
