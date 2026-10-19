import sharp from 'sharp';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const pixelLimit = 40_000_000;
const decodeOptions = { limitInputPixels: pixelLimit, animated: false, pages: 1, failOn: 'warning' };
const formats = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', tiff: 'tiff', avif: 'heif', bmp: 'bmp', heic: 'heif' };
const operations = ['convert', 'compress', 'resize', 'crop', 'rotate', 'flip', 'strip-metadata'];
const optionNames = new Set(['quality', 'compressionLevel', 'progressive', 'autoOrient', 'stripMetadata', 'width', 'height', 'x', 'y', 'angle', 'direction']);

export function imageCapabilities() {
  const inputs = Object.keys(formats).filter(format => {
    const support = sharp.format[formats[format]]?.input;
    if (!support?.buffer) return false;
    if (format === 'heic' || format === 'avif') return support.fileSuffix?.includes(`.${format}`) === true;
    return true;
  });
  const outputs = ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'avif'].filter(format => {
    const support = sharp.format[formats[format]]?.output;
    return support?.file && (format !== 'avif' || support.alias?.includes('avif'));
  });
  return { inputs, outputs, version: sharp.versions.sharp, available: true };
}

function check(signal) { signal?.throwIfAborted(); }

function integer(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid ${name}: expected integer ${minimum}–${maximum}`);
  return value;
}

function sniff(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (['49492a00', '4d4d002a', '49492b00', '4d4d002b'].includes(buffer.subarray(0, 4).toString('hex'))) return 'tiff';
  if (buffer.toString('ascii', 0, 2) === 'BM') return 'bmp';
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brands = buffer.toString('ascii', 8, Math.min(buffer.length, 64));
    if (/avif|avis/.test(brands)) return 'avif';
    if (/heic|heix|hevc|hevx|mif1|msf1/.test(brands)) return 'heic';
  }
  throw new Error('Unsupported image input; SVG and external resources are disabled');
}

async function load(input, signal) {
  check(signal);
  if (typeof input !== 'string' || !input || input.includes('\0')) throw new Error('Expected image input path');
  const handle = await fs.open(input, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 128 * 1024 * 1024) throw new Error('Image must be a regular file no larger than 128 MiB');
    buffer = await handle.readFile({ signal });
  } finally { await handle.close(); }
  check(signal);
  const format = sniff(buffer);
  if (!imageCapabilities().inputs.includes(format)) throw new Error(`Unsupported image input format: ${format}`);
  const reader = sharp(buffer, decodeOptions);
  const metadata = await job(reader, () => reader.metadata(), signal);
  const width = metadata.width;
  const height = metadata.pageHeight || metadata.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > pixelLimit) throw new Error('Image exceeds 40 megapixel decode limit');
  return { buffer, metadata, width, height, format };
}

async function job(pipeline, run, signal) {
  const abort = () => pipeline.destroy();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    check(signal);
    const result = await run();
    check(signal);
    return result;
  } catch (error) {
    check(signal);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    pipeline.destroy();
  }
}

export async function inspectImage({ input, signal } = {}) {
  const { metadata, width, height, format } = await load(input, signal);
  const swapped = [5, 6, 7, 8].includes(metadata.orientation);
  return { format, width, height, orientedWidth: swapped ? height : width, orientedHeight: swapped ? width : height, orientation: metadata.orientation, pages: metadata.pages || 1, hasAlpha: metadata.hasAlpha, warnings: metadata.pages > 1 ? ['Animated or multipage image: only the first frame is used.'] : [] };
}

export async function convertImage({ input, output, operation = 'convert', format, options = {}, signal } = {}) {
  check(signal);
  if (!operations.includes(operation)) throw new Error('Unsupported image operation');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid image options');
  for (const key of Object.keys(options)) if (!optionNames.has(key)) throw new Error(`Unsupported image option: ${key}`);
  for (const key of ['autoOrient', 'stripMetadata', 'progressive']) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new Error(`Invalid ${key}`);
  if (typeof output !== 'string' || !output || output.includes('\0')) throw new Error('Expected image output path');
  const selected = String(format || path.extname(output).slice(1)).toLowerCase();
  if (!imageCapabilities().outputs.includes(selected)) throw new Error(`Unsupported image output format: ${selected}`);
  const quality = integer(options.quality ?? 80, 'quality', 1, 100);
  const compressionLevel = integer(options.compressionLevel ?? 9, 'compressionLevel', 0, 9);
  const loaded = await load(input, signal);
  const swapped = options.autoOrient !== false && [5, 6, 7, 8].includes(loaded.metadata.orientation);
  const width = swapped ? loaded.height : loaded.width;
  const height = swapped ? loaded.width : loaded.height;
  const pipeline = sharp(loaded.buffer, decodeOptions);
  if (options.autoOrient !== false) pipeline.autoOrient();
  if (operation === 'resize') {
    const targetWidth = options.width === undefined ? undefined : integer(options.width, 'width', 1, 16384);
    const targetHeight = options.height === undefined ? undefined : integer(options.height, 'height', 1, 16384);
    if (!targetWidth && !targetHeight) throw new Error('Resize requires width or height');
    if (targetWidth && targetHeight && targetWidth * targetHeight > pixelLimit) throw new Error('Resize exceeds 40 megapixel limit');
    pipeline.resize({ width: targetWidth, height: targetHeight, fit: 'inside', withoutEnlargement: true });
  }
  if (operation === 'crop') {
    const rectangle = { left: integer(options.x ?? 0, 'x', 0, width - 1), top: integer(options.y ?? 0, 'y', 0, height - 1), width: integer(options.width, 'width', 1, width), height: integer(options.height, 'height', 1, height) };
    if (rectangle.left + rectangle.width > width || rectangle.top + rectangle.height > height) throw new Error('Crop bounds exceed oriented image dimensions');
    pipeline.extract(rectangle);
  }
  if (operation === 'rotate') {
    const angle = options.angle ?? 90;
    if (typeof angle !== 'number' || !Number.isFinite(angle) || angle < -360 || angle > 360) throw new Error('Invalid rotation angle');
    const radians = angle * Math.PI / 180;
    const rotatedWidth = Math.ceil(Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)) - 1e-8);
    const rotatedHeight = Math.ceil(Math.abs(height * Math.cos(radians)) + Math.abs(width * Math.sin(radians)) - 1e-8);
    if (rotatedWidth * rotatedHeight > pixelLimit) throw new Error('Rotation exceeds 40 megapixel limit');
    pipeline.rotate(angle, { background: '#ffffff00' });
  }
  if (operation === 'flip') {
    const direction = options.direction ?? 'horizontal';
    if (!['horizontal', 'vertical'].includes(direction)) throw new Error('Invalid flip direction');
    if (direction === 'vertical') pipeline.flip();
    else pipeline.flop();
  }
  if (operation !== 'strip-metadata' && !options.stripMetadata) pipeline.withMetadata();
  if (selected === 'jpg' || selected === 'jpeg') pipeline.flatten({ background: '#ffffff' }).jpeg({ quality, progressive: options.progressive ?? true });
  else if (selected === 'png') pipeline.png({ compressionLevel });
  else if (selected === 'webp') pipeline.webp({ quality });
  else if (selected === 'avif') pipeline.avif({ quality });
  else pipeline.tiff({ compression: 'lzw' });
  const target = path.resolve(output);
  if (target === path.resolve(input)) throw new Error('Image output must differ from input');
  const stage = await fs.mkdtemp(path.join(path.dirname(target), '.santara-image-'));
  let published = false;
  try {
    const temporary = path.join(stage, 'image');
    const info = await job(pipeline, () => pipeline.toFile(temporary), signal);
    await fs.chmod(temporary, 0o600);
    check(signal);
    await fs.link(temporary, target);
    published = true;
    check(signal);
    return { output: target, ...info, warnings: loaded.metadata.pages > 1 ? ['Animated or multipage image: only the first frame is used.'] : [] };
  } catch (error) {
    if (published && signal?.aborted) await fs.unlink(target);
    throw error;
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
}
