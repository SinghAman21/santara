import { inspectFile, makeZip, type FileInfo } from './file-capabilities';
export type Sample = {
    file: File;
    info: FileInfo;
};
function samplePdf() {
    const content = 'BT /F1 20 Tf 50 760 Td (A fresh perspective.) Tj 0 -32 Td /F1 11 Tf (Santra sample brief. Your files stay local.) Tj ET';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
    let text = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, i) => { offsets.push(text.length); text += `${i + 1} 0 obj\n${object}\nendobj\n`; });
    const at = text.length;
    text += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`;
    return new File([text], 'creative-brief.pdf', { type: 'application/pdf' });
}
function sampleWav() {
    const count = 2000, bytes = new Uint8Array(44 + count * 2), view = new DataView(bytes.buffer);
    const word = (s: string, at: number) => { for (let i = 0; i < s.length; i++)
        bytes[at + i] = s.charCodeAt(i); };
    word('RIFF', 0);
    view.setUint32(4, 36 + count * 2, true);
    word('WAVEfmt ', 8);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 16000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    word('data', 36);
    view.setUint32(40, count * 2, true);
    for (let i = 0; i < count; i++)
        view.setInt16(44 + i * 2, Math.round(Math.sin(i / 8000 * 440 * Math.PI * 2) * 1500 * Math.sin(i / count * Math.PI)), true);
    return new File([bytes], 'orchard-tone.wav', { type: 'audio/wav' });
}
export async function createSamples(): Promise<Sample[]> {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#9fcce1';
    c.fillRect(0, 0, 640, 480);
    c.fillStyle = '#234b36';
    c.beginPath();
    c.ellipse(370, 165, 145, 28, -.5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#233d2f';
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(340, 0);
    c.lineTo(330, 170);
    c.stroke();
    c.fillStyle = '#ed8b31';
    c.beginPath();
    c.arc(320, 270, 120, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = '#fff6e8';
    c.font = '20px Georgia';
    c.fillText('a fresh perspective', 37, 436);
    const image = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
    const notes = new File(['# Field notes\n\nOne orange. Many possibilities.\n\n- Keep the original.\n- Work locally.\n- Make something useful.\n'], 'field-notes.md', { type: 'text/markdown' });
    const archive = await makeZip(new File(['A safe, deterministic Santra archive fixture.\n'], 'readme.txt', { type: 'text/plain' }));
    const files = [new File([image], 'orchard.png', { type: 'image/png' }), samplePdf(), notes, new File(['1\n00:00:01,000 --> 00:00:02,500\nA fresh perspective.\n\n2\n00:00:03,000 --> 00:00:05,000\nYour files stay with you.\n'], 'captions.srt', { type: 'application/x-subrip' }), sampleWav(), new File([archive], 'project.zip', { type: 'application/zip' }), new File(['item,quantity\noranges,12\nleaves,24\n'], 'harvest.csv', { type: 'text/csv' })];
    return Promise.all(files.map(async (file) => ({ file, info: await inspectFile(file) })));
}
