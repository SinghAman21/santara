export type Mode = 'all' | 'convert' | 'tools' | 'actions';
export type ImageAction = {
    id: string;
    label: string;
    mode: Mode;
    description: string;
    mime?: string;
    icon?: 'text'|'archive'|'audio'|'video'|'file';
};
// Deliberately bounded browser capabilities, separate from the desktop backend registry.
export const imageActions: ImageAction[] = [
    { id: 'png', label: 'PNG', mode: 'convert', mime: 'image/png', description: 'A lossless PNG copy. Transparency is preserved.' },
    { id: 'jpg', label: 'JPG', mode: 'convert', mime: 'image/jpeg', description: 'A JPEG copy at 90% quality, with a warm white background.' },
    { id: 'webp', label: 'WebP', mode: 'convert', mime: 'image/webp', description: 'A WebP copy at 90% quality, when your browser supports it.' },
    { id: 'resize', label: 'Resize', mode: 'tools', description: 'Scale to half the width and height. Save a new PNG.' },
    { id: 'rotate', label: 'Rotate', mode: 'tools', description: 'Turn 90° clockwise. Save a new PNG.' },
    { id: 'flip', label: 'Flip', mode: 'tools', description: 'Mirror horizontally. Save a new PNG.' },
    { id: 'original', label: 'Download original', mode: 'actions', description: 'Download an untouched copy. Browser access cannot reveal local paths.' },
];
export function getBrowserActions() {
    if (typeof document === 'undefined')
        return imageActions;
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    return imageActions.filter(action => {
        if (action.mode === 'actions')
            return true;
        if (typeof createImageBitmap !== 'function' || !probe.getContext('2d'))
            return false;
        return action.id !== 'webp' || probe.toDataURL('image/webp').startsWith('data:image/webp');
    });
}
export type Output = {
    name: string;
    blob: Blob;
    duration: number;
    operation: string;
};
export function sizeLabel(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export async function validateImage(file: File) {
    if (file.size > 20 * 1024 * 1024)
        throw new Error('Choose an image under 20 MB. Larger files belong in the desktop app.');
    const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v);
    const jpg = b[0] === 255 && b[1] === 216 && b[2] === 255;
    const webp = String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
    if (!png && !jpg && !webp)
        throw new Error('This browser workspace accepts PNG, JPEG and WebP images. Explore the desktop tools for other files.');
}
export async function processImage(file: File, action: ImageAction): Promise<Output> {
    const start = performance.now();
    await validateImage(file);
    if (action.id === 'original')
        return { name: file.name, blob: file, duration: performance.now() - start, operation: action.label };
    if (typeof createImageBitmap !== 'function')
        throw new Error('Image editing is unavailable in this browser. Use Santara desktop.');
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    }
    catch {
        throw new Error('This image could not be decoded. It may be damaged or unsupported by your browser.');
    }
    try {
        if (bitmap.width * bitmap.height > 24000000)
            throw new Error('This image exceeds the browser workspace limit of 24 megapixels. Use Santara desktop.');
        const rotate = action.id === 'rotate';
        const scale = action.id === 'resize' ? .5 : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((rotate ? bitmap.height : bitmap.width) * scale));
        canvas.height = Math.max(1, Math.round((rotate ? bitmap.width : bitmap.height) * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('Your browser cannot create an image canvas. Try the desktop app.');
        if (action.id === 'jpg') {
            ctx.fillStyle = '#fff6e8';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        if (rotate) {
            ctx.translate(canvas.width, 0);
            ctx.rotate(Math.PI / 2);
        }
        if (action.id === 'flip') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(bitmap, 0, 0, rotate ? canvas.height : canvas.width, rotate ? canvas.width : canvas.height);
        const mime = action.mime ?? 'image/png';
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Image encoding failed. Try another format.')), mime, .9));
        if (blob.type !== mime)
            throw new Error('Your browser does not support this output format. Choose PNG or JPG.');
        const stem = file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} _-]/gu, '_').slice(0, 100) || 'image';
        return { name: `${stem}-${action.id}.${mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]}`, blob, duration: performance.now() - start, operation: action.label };
    }
    finally {
        bitmap.close();
    }
}
