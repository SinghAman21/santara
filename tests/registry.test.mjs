import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBackends, getCapabilities, probe } from '../electron/registry.mjs';

test('full registry stays visible when optional binaries are missing', () => {
  const capabilities = getCapabilities({});
  assert.ok(capabilities.length > 20);
  assert.deepEqual(capabilities.filter(item => item.available).map(item => item.id), ['subtitle:convert', 'archive:create', 'archive:extract']);
  assert.equal(capabilities.find(item => item.id === 'archive:rar').available, false);
  for (const capability of capabilities) for (const field of ['id', 'label', 'category', 'inputs', 'outputs', 'backend', 'available', 'batch', 'preservesMetadata', 'options']) assert.ok(field in capability);
});
test('codec, filter and coder support gate exact outputs', () => {
  const backends = { ffmpeg: { available: true, encoders: 'libx264 aac pcm_s16le', muxers: 'mp4 wav', filters: 'scale', demuxers: 'mov wav' }, imagemagick: { available: true, coders: { png: { read: true, write: true }, jpeg: { read: true, write: false } } } };
  const capabilities = getCapabilities(backends);
  assert.deepEqual(capabilities.find(item => item.id === 'video:convert').outputs, ['mp4']);
  assert.equal(capabilities.find(item => item.id === 'video:rotate').available, false);
  assert.deepEqual(capabilities.find(item => item.id === 'image:convert').outputs, ['png']);
});
test('missing configured executable fails honestly', async () => {
  const backends = await detectBackends(Object.fromEntries(['ffmpeg', 'ffprobe', 'imagemagick', 'qpdf', 'poppler', 'pandoc', 'libreoffice'].map(key => [key, key === 'ffmpeg' ? '/definitely/missing/santara' : false])));
  assert.equal(backends.ffmpeg.available, false);
  assert.match(backends.ffmpeg.error, /ENOENT/);
  assert.equal(backends.qpdf.available, false);
});
test('probes stop on timeout', async () => {
  const result = await probe(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 50);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Probe timed out');
});

test('crop requires probing dimensions and SVG stays unavailable', () => {
  const backends = { ffmpeg: { available: true, encoders: 'libx264 aac mpeg4 libmp3lame wmav2 wmv2 pcm_s16be', muxers: 'mp4 mov avi asf aiff', demuxers: 'mov avi asf aiff', filters: 'crop' } };
  let capabilities = getCapabilities(backends);
  assert.equal(capabilities.find(item => item.id === 'video:crop').available, false);
  backends.ffprobe = { available: true };
  capabilities = getCapabilities(backends);
  assert.equal(capabilities.find(item => item.id === 'video:crop').available, true);
  assert.ok(capabilities.find(item => item.id === 'video:convert').outputs.includes('wmv'));
  assert.ok(capabilities.find(item => item.id === 'audio:convert').outputs.includes('aiff'));
  assert.equal(capabilities.find(item => item.id === 'image:svg').available, false);
  assert.equal(capabilities.find(item => item.id === 'video:convert').preservesMetadata, true);
  assert.equal(capabilities.find(item => item.id === 'video:strip-metadata').preservesMetadata, false);
  assert.ok(capabilities.find(item => item.id === 'subtitle:convert').outputs.includes('txt'));
});

test('document registry requires sandbox and self-tested readers/writers', () => {
  const pandoc = { available: true, readers: ['md', 'txt'], writers: ['txt', 'md'] };
  assert.equal(getCapabilities({ pandoc }).find(item => item.id === 'document:convert').available, false);
  pandoc.sandbox = true;
  const capability = getCapabilities({ pandoc }).find(item => item.id === 'document:convert');
  assert.equal(capability.available, true);
  assert.deepEqual(capability.inputs, ['md', 'txt']);
  assert.deepEqual(capability.outputs, ['txt', 'md']);
  assert.equal(capability.outputs.includes('pdf'), false);
});

test('bundled Sharp takes primary raster outputs without duplicate ImageMagick routes', () => {
  const backends = { sharp: { available: true, inputs: ['jpg', 'png', 'svg'], outputs: ['png', 'jpg'] }, imagemagick: { available: true, coders: { png: { read: true, write: true }, jpeg: { read: true, write: true }, tiff: { read: true, write: true } } } };
  const capabilities = getCapabilities(backends);
  const primary = capabilities.find(item => item.id === 'image:convert');
  assert.equal(primary.backend, 'sharp');
  assert.ok(!primary.inputs.includes('svg'));
  assert.deepEqual(primary.outputs, ['png', 'jpg']);
  const fallback = capabilities.find(item => item.id === 'image:convert:imagemagick');
  assert.deepEqual(fallback.outputs, ['tif', 'tiff']);
  assert.equal(new Set(capabilities.map(item => item.id)).size, capabilities.length);
});
