import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { convertImage, imageCapabilities, imageOptionNames, inspectImage, previewImage } from '../electron/images.mjs';

async function fixture(context, { width = 8, height = 4, background = '#ff0000', format = 'png', orientation } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'santara-images-test-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, `input.${format}`);
  let image = sharp({ create: { width, height, channels: 4, background } });
  if (orientation) image = image.withMetadata({ orientation });
  await image.toFormat(format).toFile(input);
  return { root, input, output: path.join(root, 'output.png') };
}

test('capabilities advertise only installed encoders and exclude unsafe or missing decoders', () => {
  const capabilities = imageCapabilities();
  assert.equal(capabilities.available, true);
  assert.equal(capabilities.version, sharp.versions.sharp);
  assert.ok(capabilities.inputs.includes('jpeg'));
  assert.ok(capabilities.outputs.includes('png'));
  assert.ok(!capabilities.inputs.includes('svg'));
  assert.equal(capabilities.inputs.includes('bmp'), Boolean(sharp.format.bmp?.input.buffer));
  assert.equal(capabilities.inputs.includes('heic'), Boolean(sharp.format.heif.input.buffer && sharp.format.heif.input.fileSuffix.includes('.heic')));
});

test('JPG converts to a real PNG and existing outputs remain intact', async context => {
  const { input, output } = await fixture(context, { format: 'jpeg' });
  const result = await convertImage({ input, output, format: 'png' });
  assert.equal(result.width, 8);
  assert.equal((await sharp(output).metadata()).format, 'png');
  const original = await fs.readFile(output);
  await assert.rejects(convertImage({ input, output, format: 'png' }), /EEXIST/);
  assert.deepEqual(await fs.readFile(output), original);
});

test('JPEG alpha is flattened onto white and output is progressive', async context => {
  const { input, root } = await fixture(context, { background: '#00000000' });
  const output = path.join(root, 'white.jpg');
  await convertImage({ input, output, format: 'jpg', options: { quality: 100 } });
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.hasAlpha, false);
  assert.equal(metadata.isProgressive, true);
  const pixels = await sharp(output).raw().toBuffer();
  assert.ok(pixels.every(value => value >= 250));
});

test('orientation is applied before crop and can be disabled', async context => {
  const { input, output, root } = await fixture(context, { format: 'jpeg', orientation: 6 });
  const inspected = await inspectImage({ input });
  assert.equal(inspected.orientedWidth, 4);
  assert.equal(inspected.orientedHeight, 8);
  await convertImage({ input, output });
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 4);
  assert.equal(metadata.height, 8);
  assert.ok(!metadata.orientation || metadata.orientation === 1);
  await convertImage({ input, output: path.join(root, 'crop.png'), operation: 'crop', options: { x: 1, y: 5, width: 3, height: 3 } });
  await assert.rejects(convertImage({ input, output: path.join(root, 'bad.png'), operation: 'crop', options: { width: 5, height: 2 } }), /width|bounds/);
  await convertImage({ input, output: path.join(root, 'unoriented.png'), options: { autoOrient: false } });
  assert.equal((await sharp(path.join(root, 'unoriented.png')).metadata()).width, 8);
});

test('resize preserves aspect ratio and crop rejects invalid geometry', async context => {
  const { input, output, root } = await fixture(context);
  await convertImage({ input, output, operation: 'resize', options: { width: 4 } });
  assert.equal((await sharp(output).metadata()).height, 2);
  for (const options of [{ width: 0 }, { width: NaN }, { width: '4' }, { width: 16385 }]) {
    await assert.rejects(convertImage({ input, output: path.join(root, 'bad.png'), operation: 'resize', options }), /width/);
  }
  for (const options of [{ x: -1, width: 1, height: 1 }, { x: 7, width: 2, height: 1 }, { width: 1, height: 5 }]) {
    await assert.rejects(convertImage({ input, output: path.join(root, 'bad.png'), operation: 'crop', options }), /x|height|bounds/);
  }
});

test('flip and rotate transform pixels and dimensions', async context => {
  const { input, output, root } = await fixture(context, { width: 2, height: 1 });
  await sharp(Buffer.from([255, 0, 0, 0, 0, 255]), { raw: { width: 2, height: 1, channels: 3 } }).png().toFile(input);
  await convertImage({ input, output, operation: 'flip', options: { direction: 'horizontal', stripMetadata: true } });
  assert.deepEqual([...await sharp(output).raw().toBuffer()], [0, 0, 255, 255, 0, 0]);
  const rotated = path.join(root, 'rotated.png');
  await convertImage({ input, output: rotated, operation: 'rotate', options: { angle: 90 } });
  assert.equal((await sharp(rotated).metadata()).height, 2);
  const vertical = path.join(root, 'vertical.png');
  await convertImage({ input: rotated, output: vertical, operation: 'flip', options: { direction: 'vertical' } });
  assert.deepEqual([...await sharp(vertical).removeAlpha().raw().toBuffer()], [0, 0, 255, 255, 0, 0]);
});

test('metadata is retained by default and removed explicitly', async context => {
  const { input, output, root } = await fixture(context, { format: 'jpeg', orientation: 1 });
  await convertImage({ input, output });
  assert.ok((await sharp(output).metadata()).exif);
  for (const operation of ['strip-metadata', 'convert']) {
    const stripped = path.join(root, `${operation}.png`);
    await convertImage({ input, output: stripped, operation, options: { stripMetadata: true } });
    const metadata = await sharp(stripped).metadata();
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
  }
});

test('image compression publishes a smaller result and refuses to create a larger copy', async context => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'santara-compress-test-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, 'photo.jpg');
  const output = path.join(root, 'photo-compressed.jpg');
  const width = 640, height = 480;
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 17;
  for (let index = 0; index < pixels.length; index++) {
    seed = (seed * 48271) % 2147483647;
    pixels[index] = seed & 255;
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toFile(input);
  await convertImage({ input, output, operation: 'compress', format: 'jpeg', options: { quality: 70, stripMetadata: true } });
  assert.ok((await fs.stat(output)).size < (await fs.stat(input)).size);

  const tiny = path.join(root, 'tiny.jpg');
  const tinyOutput = path.join(root, 'tiny-compressed.jpg');
  await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).jpeg({ quality: 90 }).toFile(tiny);
  await assert.rejects(convertImage({ input: tiny, output: tinyOutput, operation: 'compress', format: 'jpeg' }), /already highly optimized/);
  await assert.rejects(fs.stat(tinyOutput), /ENOENT/);
});

test('PNG compression uses palette quantization and produces a visibly smaller file', async context => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'santara-png-compress-test-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, 'gradient.png');
  const output = path.join(root, 'gradient-compressed.png');
  const width = 512, height = 384;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 3;
    pixels[offset] = (x + y) % 256;
    pixels[offset + 1] = (x * 3 + y) % 256;
    pixels[offset + 2] = (x + y * 3) % 256;
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 1 }).toFile(input);
  await convertImage({ input, output, operation: 'compress', format: 'png', options: { quality: 70, stripMetadata: true } });
  assert.ok((await fs.stat(output)).size < (await fs.stat(input)).size * 0.9);
  assert.equal((await sharp(output).metadata()).format, 'png');
});

test('background tool creates requested final canvas with visible solid padding', async context => {
  const { input, root } = await fixture(context, { width: 24, height: 12, format: 'png', background: '#ff0000' });
  const output = path.join(root, 'canvas.png');
  await convertImage({ input, output, operation: 'background', format: 'png', options: { width: 88, height: 76, padding: 20, fit: 'contain', backgroundType: 'solid', backgroundColor: '#00ff00', stripMetadata: true } });
  const result = await sharp(output).metadata();
  assert.equal(result.width, 88);
  assert.equal(result.height, 76);
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data.subarray(0, 3)], [0, 255, 0]);
  const center = ((Math.floor(info.height / 2) * info.width) + Math.floor(info.width / 2)) * info.channels;
  assert.ok(data[center] > 240 && data[center + 1] < 10 && data[center + 2] < 10);
});

test('metadata editor writes the requested EXIF text fields and previews source dimensions', async context => {
  const { input, root } = await fixture(context, { width: 24, height: 12, format: 'jpeg' });
  const output = path.join(root, 'metadata-copy.jpg');
  await convertImage({ input, output, operation: 'metadata', format: 'jpeg', options: { artist: 'Santara Artist', copyright: 'Local Copyright', description: 'Edited locally', dateTime: '2026:10:20 12:00:00' } });
  const metadata = await sharp(output).metadata();
  assert.ok(metadata.exif);
  assert.match(metadata.exif.toString('latin1'), /Santara Artist/);
  assert.match(metadata.exif.toString('latin1'), /2026:10:20 12:00:00/);
  assert.match(metadata.exif.toString('latin1'), /Local Copyright/);
  assert.match(metadata.exif.toString('latin1'), /Edited locally/);
  const preview = await previewImage({ input, maxWidth: 8, maxHeight: 8 });
  assert.equal(preview.sourceWidth, 24);
  assert.equal(preview.sourceHeight, 12);
  assert.ok(preview.width <= 8 && preview.height <= 8);
});

test('invalid formats, external resource options, SVG and corrupt input fail closed', async context => {
  const { input, output, root } = await fixture(context);
  await assert.rejects(convertImage({ input, output, format: 'svg' }), /format/);
  await assert.rejects(convertImage({ input, output, options: { icc: '/tmp/profile' } }), /option/);
  await assert.rejects(convertImage({ input, output, options: { quality: 0 } }), /quality/);
  const bad = path.join(root, 'bad.png');
  await fs.writeFile(bad, '<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd"/></svg>');
  await assert.rejects(convertImage({ input: bad, output }), /SVG/);
  await fs.writeFile(bad, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]));
  await assert.rejects(convertImage({ input: bad, output }));
  await assert.rejects(fs.stat(output), /ENOENT/);
});

test('pre-aborted and in-flight conversions do not publish output', async context => {
  const { input, output, root } = await fixture(context, { width: 1800, height: 1800 });
  const before = new AbortController();
  before.abort();
  await assert.rejects(convertImage({ input, output, signal: before.signal }), { name: 'AbortError' });
  const during = new AbortController();
  const pending = convertImage({ input, output, format: 'avif', signal: during.signal });
  setTimeout(() => during.abort(), 10);
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(fs.stat(output), /ENOENT/);
  assert.deepEqual((await fs.readdir(root)).filter(name => name.startsWith('.santara-')), []);
});

test('40 megapixel decode limit rejects oversized headers before publishing', async context => {
  const { input, output } = await fixture(context, { format: 'jpeg' });
  const bytes = await fs.readFile(input);
  const marker = bytes.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(marker >= 0);
  bytes.writeUInt16BE(5000, marker + 5);
  bytes.writeUInt16BE(10000, marker + 7);
  await fs.writeFile(input, bytes);
  await assert.rejects(convertImage({ input, output }), /pixel limit|megapixel/i);
  await assert.rejects(fs.stat(output), /ENOENT/);
});

test('animated WebP emits a first-frame warning and a single frame', async context => {
  const { input, output } = await fixture(context, { format: 'webp', width: 2, height: 2 });
  const pixels = Buffer.from([...Array(4).fill([255, 0, 0]).flat(), ...Array(4).fill([0, 0, 255]).flat()]);
  await sharp(pixels, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ lossless: true, delay: [100, 100] }).toFile(input);
  assert.equal((await sharp(input).metadata()).pages, 2);
  const result = await convertImage({ input, output, options: { stripMetadata: true } });
  assert.match(result.warnings.join(' '), /first frame/i);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.height, 2);
  assert.ok(!metadata.pages || metadata.pages === 1);
  assert.deepEqual([...await sharp(output).raw().toBuffer()].slice(0, 3), [255, 0, 0]);
  const preview = await previewImage({ input, options: { padding: 1, backgroundColor: '#fff' } });
  assert.match(preview.warnings.join(' '), /first frame/i);
  const previewMetadata = await sharp(Buffer.from(preview.dataURL.split(',')[1], 'base64')).metadata();
  assert.equal(previewMetadata.width, 4);
  assert.equal(previewMetadata.height, 4);
  assert.ok(!previewMetadata.pages || previewMetadata.pages === 1);
});

test('PNG quality does not quantize colour or alpha', async context => {
  const { input, output } = await fixture(context, { background: '#12345680' });
  await convertImage({ input, output, options: { quality: 1, stripMetadata: true } });
  assert.deepEqual(await sharp(output).raw().toBuffer(), await sharp(input).raw().toBuffer());
  assert.equal((await sharp(output).metadata()).isPalette, false);
});

test('the exported option contract includes the flat renderer recipe and is immutable', () => {
  assert.ok(Object.isFrozen(imageOptionNames));
  for (const name of ['cropX', 'cropY', 'cropWidth', 'cropHeight', 'width', 'height', 'angle', 'flipHorizontal', 'flipVertical', 'brightness', 'saturation', 'contrast', 'backgroundColor', 'backgroundColor2', 'backgroundType', 'padding', 'fit', 'dateTime']) assert.ok(imageOptionNames.includes(name), name);
});

test('edit-image applies crop, rotation and both flips in recipe order before padding and background', async context => {
  const { input, output } = await fixture(context, { width: 3, height: 2 });
  const red = [255, 0, 0];
  const green = [0, 255, 0];
  const blue = [0, 0, 255];
  const yellow = [255, 255, 0];
  const magenta = [255, 0, 255];
  const cyan = [0, 255, 255];
  await sharp(Buffer.from([red, green, blue, yellow, magenta, cyan].flat()), { raw: { width: 3, height: 2, channels: 3 } }).png().toFile(input);
  const result = await convertImage({ input, output, operation: 'edit-image', options: { cropX: 1, cropY: 0, cropWidth: 2, cropHeight: 2, width: 2, height: 2, angle: 90, flipHorizontal: true, flipVertical: true, padding: 1, backgroundColor: '#123', stripMetadata: true } });
  assert.equal(result.width, 4);
  assert.equal(result.height, 4);
  const { data, info } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (left, top) => [...data.subarray((top * info.width + left) * 3, (top * info.width + left) * 3 + 3)];
  assert.deepEqual(pixel(0, 0), [17, 34, 51]);
  assert.deepEqual(pixel(1, 1), blue);
  assert.deepEqual(pixel(2, 1), cyan);
  assert.deepEqual(pixel(1, 2), green);
  assert.deepEqual(pixel(2, 2), magenta);
});

test('recipe resize occurs before rotation and fit modes provide an exact canvas', async context => {
  const { input, output, root } = await fixture(context);
  await convertImage({ input, output, operation: 'edit-image', options: { cropWidth: 6, cropHeight: 4, width: 3, angle: 90, padding: 1 } });
  const rotated = await sharp(output).metadata();
  assert.equal(rotated.width, 4);
  assert.equal(rotated.height, 5);
  for (const fit of ['inside', 'contain', 'cover', 'fill']) {
    const target = path.join(root, `${fit}.png`);
    await convertImage({ input, output: target, operation: 'edit-image', options: { width: 8, height: 8, fit, stripMetadata: true } });
    const { data, info } = await sharp(target).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 8);
    assert.equal(info.height, fit === 'inside' ? 4 : 8);
    assert.equal(data[3], fit === 'contain' ? 0 : 255);
  }
});

test('solid backgrounds blend alpha and gradient backgrounds are genuine generated raster pixels', async context => {
  const { input, output, root } = await fixture(context, { width: 3, height: 2, background: '#00000000' });
  await convertImage({ input, output, operation: 'background', options: { backgroundType: 'gradient', backgroundColor: '#f00', backgroundColor2: '#00f', stripMetadata: true } });
  assert.equal((await sharp(output).metadata()).format, 'png');
  const gradient = await sharp(output).removeAlpha().raw().toBuffer();
  assert.deepEqual([...gradient], [255, 0, 0, 128, 0, 128, 0, 0, 255, 255, 0, 0, 128, 0, 128, 0, 0, 255]);
  const solid = path.join(root, 'solid.png');
  await sharp({ create: { width: 3, height: 2, channels: 4, background: '#ff000080' } }).png().toFile(input);
  await convertImage({ input, output: solid, operation: 'background', options: { backgroundColor: '#0000ff', stripMetadata: true } });
  const pixel = [...await sharp(solid).ensureAlpha().raw().toBuffer()].slice(0, 4);
  assert.ok(Math.abs(pixel[0] - 128) <= 1);
  assert.equal(pixel[1], 0);
  assert.ok(Math.abs(pixel[2] - 127) <= 1);
  assert.equal(pixel[3], 255);
});

test('background defaults to white while an empty edit recipe retains alpha', async context => {
  const { input, output, root } = await fixture(context, { background: '#00000000' });
  await convertImage({ input, output, operation: 'background', options: { stripMetadata: true } });
  assert.deepEqual([...await sharp(output).ensureAlpha().raw().toBuffer()].slice(0, 4), [255, 255, 255, 255]);
  const transparent = path.join(root, 'transparent.png');
  await convertImage({ input, output: transparent, operation: 'edit-image', options: { stripMetadata: true, padding: 1 } });
  assert.ok([...await sharp(transparent).ensureAlpha().raw().toBuffer()].every((value, index) => index % 4 !== 3 || value === 0));
});

test('brightness, saturation and contrast change color while preserving alpha', async context => {
  const { input, root } = await fixture(context, { width: 1, height: 1, background: '#50647880' });
  const base = [...await sharp(input).raw().toBuffer()];
  for (const options of [{ brightness: 0 }, { brightness: 1.5 }, { saturation: 0 }, { contrast: 0 }, { contrast: 2 }]) {
    const output = path.join(root, `${Object.keys(options)[0]}-${Object.values(options)[0]}.png`);
    await convertImage({ input, output, operation: 'edit-image', options: { ...options, stripMetadata: true } });
    const pixel = [...await sharp(output).ensureAlpha().raw().toBuffer()];
    assert.equal(pixel[3], base[3]);
    assert.notDeepEqual(pixel.slice(0, 3), base.slice(0, 3));
    if (options.brightness === 0) assert.deepEqual(pixel.slice(0, 3), [0, 0, 0]);
    if (options.saturation === 0) assert.ok(Math.max(...pixel.slice(0, 3)) - Math.min(...pixel.slice(0, 3)) <= 1);
    if (options.contrast === 0) assert.deepEqual(pixel.slice(0, 3), [128, 128, 128]);
    if (options.contrast === 2) assert.deepEqual(pixel.slice(0, 3), base.slice(0, 3).map(value => value * 2 - 128));
  }
});

test('recipe crop uses oriented dimensions and metadata survives intermediate stages', async context => {
  const { input, output, root } = await fixture(context, { format: 'jpeg', orientation: 6 });
  const options = { cropY: 4, cropWidth: 4, cropHeight: 4, width: 2, angle: 90, flipHorizontal: true, padding: 1, backgroundType: 'gradient', backgroundColor: '#fff', backgroundColor2: '#000' };
  await convertImage({ input, output, operation: 'edit-image', options });
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 4);
  assert.equal(metadata.height, 4);
  assert.ok(metadata.exif);
  assert.ok(!metadata.orientation || metadata.orientation === 1);
  const stripped = path.join(root, 'stripped.png');
  await convertImage({ input, output: stripped, operation: 'edit-image', options: { ...options, stripMetadata: true } });
  const strippedMetadata = await sharp(stripped).metadata();
  assert.equal(strippedMetadata.exif, undefined);
  assert.equal(strippedMetadata.icc, undefined);
  await assert.rejects(convertImage({ input, output: path.join(root, 'bad.png'), operation: 'edit-image', options: { ...options, autoOrient: false } }), /cropY|bounds/);
});

test('invalid flat recipes and injected background sources fail without publishing', async context => {
  const { input, output, root } = await fixture(context);
  const recipes = [
    { cropWidth: 3 }, { cropX: 7, cropWidth: 2, cropHeight: 1 }, { cropWidth: '2', cropHeight: 1 },
    { width: 0 }, { width: 16385 }, { fit: 'outside' }, { fit: 'contain', width: 4 },
    { angle: Infinity }, { angle: '90' }, { flipHorizontal: 'true' }, { flipVertical: 1 },
    { brightness: -1 }, { brightness: NaN }, { saturation: 5 }, { contrast: '1' },
    { padding: -1 }, { padding: 0.5 }, { padding: 16385 },
    { backgroundType: 'svg' }, { backgroundColor: 'file:///etc/passwd' },
    { backgroundColor: '<svg/>' }, { backgroundColor2: { input: '/etc/passwd' } },
    { background: '/etc/passwd' }, { input: '/etc/passwd' }, { composite: [] },
  ];
  for (const options of recipes) await assert.rejects(convertImage({ input, output, operation: 'edit-image', options }), /Invalid|requires|bounds|Unsupported/);
  await assert.rejects(fs.stat(output), /ENOENT/);
  assert.deepEqual((await fs.readdir(root)).filter(name => name.startsWith('.santara-')), []);
});

test('recipe resize, rotation and padding enforce output pixel limits before allocation', async context => {
  const { input, output } = await fixture(context);
  for (const options of [{ width: 10000, height: 10000, fit: 'fill' }, { width: 16384 }, { width: 6000, height: 6000, fit: 'fill', angle: 45 }, { width: 10000, height: 3000, fit: 'fill', padding: 1000 }]) {
    await assert.rejects(convertImage({ input, output, operation: 'edit-image', options }), /megapixel|width|height/);
  }
  await assert.rejects(fs.stat(output), /ENOENT/);
});

test('recipe exports are atomic, private, cannot overwrite files, and honor cancellation', async context => {
  const { input, output, root } = await fixture(context, { width: 1800, height: 1800 });
  const options = { backgroundType: 'gradient', backgroundColor: '#123', backgroundColor2: '#abc', padding: 1 };
  await fs.writeFile(output, 'keep existing output');
  await assert.rejects(convertImage({ input, output, operation: 'edit-image', options }), /EEXIST/);
  assert.equal(await fs.readFile(output, 'utf8'), 'keep existing output');
  await assert.rejects(convertImage({ input, output: input, operation: 'edit-image', options }), /differ/);
  const cancelled = path.join(root, 'cancelled.png');
  const controller = new AbortController();
  const pending = convertImage({ input, output: cancelled, operation: 'background', options, signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(fs.stat(cancelled), /ENOENT/);
  const saved = path.join(root, 'saved.png');
  await convertImage({ input, output: saved, operation: 'edit-image', options: { width: 10, stripMetadata: true } });
  assert.equal((await fs.stat(saved)).mode & 0o777, 0o600);
  assert.deepEqual((await fs.readdir(root)).filter(name => name.startsWith('.santara-')), []);
});

test('preview returns a bounded real PNG using the export recipe without filesystem writes', async context => {
  const { input, output, root } = await fixture(context, { width: 80, height: 40 });
  const options = { cropX: 10, cropWidth: 60, cropHeight: 40, width: 30, angle: 90, flipVertical: true, padding: 2, backgroundType: 'gradient', backgroundColor: '#123456', backgroundColor2: '#fedcba', contrast: 1.2, stripMetadata: true };
  const before = await fs.readdir(root);
  const preview = await previewImage({ input, options, maxWidth: 16, maxHeight: 16 });
  assert.match(preview.dataURL, /^data:image\/png;base64,/);
  assert.equal(preview.width, 11);
  assert.equal(preview.height, 16);
  assert.deepEqual(await fs.readdir(root), before);
  const previewBytes = Buffer.from(preview.dataURL.split(',')[1], 'base64');
  const metadata = await sharp(previewBytes).metadata();
  assert.equal(metadata.width, preview.width);
  assert.equal(metadata.height, preview.height);
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.exif, undefined);
  await convertImage({ input, output, operation: 'edit-image', options });
  const expected = await sharp(output).resize({ width: 16, height: 16, fit: 'inside', withoutEnlargement: true }).raw().toBuffer();
  assert.deepEqual(await sharp(previewBytes).raw().toBuffer(), expected);
});

test('preview defaults to no enlargement and rejects invalid bounds, unsafe input and aborted work', async context => {
  const { input, root } = await fixture(context, { format: 'jpeg', orientation: 6 });
  const preview = await previewImage({ input });
  assert.equal(preview.width, 4);
  assert.equal(preview.height, 8);
  for (const bounds of [{ maxWidth: 2049 }, { maxHeight: 0 }, { maxWidth: '16' }]) await assert.rejects(previewImage({ input, ...bounds }), /maxWidth|maxHeight/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(previewImage({ input, signal: controller.signal }), { name: 'AbortError' });
  const unsafe = path.join(root, 'unsafe.png');
  await fs.writeFile(unsafe, '<svg><image href="file:///etc/passwd"/></svg>');
  await assert.rejects(previewImage({ input: unsafe }), /SVG/);
  await assert.rejects(previewImage({ input, options: { backgroundColor: { input: unsafe } } }), /backgroundColor/);
});

test('new exports and preview share the bounded decoder and reject input symlinks', async context => {
  const { input, output, root } = await fixture(context, { format: 'jpeg' });
  const linked = path.join(root, 'linked.jpg');
  await fs.symlink(input, linked);
  for (const operation of ['edit-image', 'background']) await assert.rejects(convertImage({ input: linked, output, operation }), /ELOOP/);
  await assert.rejects(previewImage({ input: linked }), /ELOOP/);
  const bytes = await fs.readFile(input);
  const marker = bytes.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(marker >= 0);
  bytes.writeUInt16BE(5000, marker + 5);
  bytes.writeUInt16BE(10000, marker + 7);
  await fs.writeFile(input, bytes);
  for (const operation of ['edit-image', 'background']) await assert.rejects(convertImage({ input, output, operation, options: { width: 1 } }), /pixel limit|megapixel/i);
  await assert.rejects(previewImage({ input, maxWidth: 1, maxHeight: 1 }), /pixel limit|megapixel/i);
  await assert.rejects(fs.stat(output), /ENOENT/);
});

test('preview enforces its default size bound and aborts in-flight recipes without writes', async context => {
  const { input, root } = await fixture(context, { width: 2400, height: 1200 });
  const preview = await previewImage({ input });
  assert.equal(preview.width, 1024);
  assert.equal(preview.height, 512);
  const before = await fs.readdir(root);
  const controller = new AbortController();
  const pending = previewImage({ input, options: { backgroundType: 'gradient', padding: 2 }, signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(await fs.readdir(root), before);
});
