import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/santara.png', import.meta.url));
const assetDirectory = new URL('../public/', import.meta.url);
const buildDirectory = new URL('../build/', import.meta.url);
await mkdir(assetDirectory, { recursive: true });
await mkdir(buildDirectory, { recursive: true });

async function roundedPng(size) {
  const radius = Math.round(size * 0.2);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="white"/></svg>`);
  return sharp(source)
    .resize(size, size, { fit: 'cover' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const logo = await roundedPng(512);
await writeFile(new URL('santara.png', assetDirectory), logo);
await writeFile(new URL('favicon.png', assetDirectory), await roundedPng(64));
await writeFile(new URL('icon.png', buildDirectory), logo);

const sizes = [16, 24, 32, 48, 64, 128, 256];
const frames = await Promise.all(sizes.map(size => roundedPng(size)));
const headerSize = 6;
const entrySize = 16;
const header = Buffer.alloc(headerSize + entrySize * frames.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);

let offset = header.length;
frames.forEach((frame, index) => {
  const entry = headerSize + index * entrySize;
  const size = sizes[index];
  header.writeUInt8(size === 256 ? 0 : size, entry);
  header.writeUInt8(size === 256 ? 0 : size, entry + 1);
  header.writeUInt8(0, entry + 2);
  header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});

await writeFile(new URL('icon.ico', buildDirectory), Buffer.concat([header, ...frames]));
console.log('Generated rounded Santara logo, favicon, PNG app icon, and multi-size Windows ICO.');
