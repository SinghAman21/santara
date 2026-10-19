import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { convertImage, imageCapabilities, inspectImage } from '../electron/images.mjs';

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
});

test('PNG quality does not quantize colour or alpha', async context => {
  const { input, output } = await fixture(context, { background: '#12345680' });
  await convertImage({ input, output, options: { quality: 1, stripMetadata: true } });
  assert.deepEqual(await sharp(output).raw().toBuffer(), await sharp(input).raw().toBuffer());
  assert.equal((await sharp(output).metadata()).isPalette, false);
});
