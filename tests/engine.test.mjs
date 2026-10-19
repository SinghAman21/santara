import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm, symlink, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { crc32 } from '../electron/archives.mjs';
import { createEngine, inspectFiles, validateSignature } from '../electron/engine.mjs';
import { detectBackends, getCapabilities, probe } from '../electron/registry.mjs';

const source = '1\n00:00:00,000 --> 00:00:01,000\nHello\n';
async function fixture(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'santara-test-'));
  try { await writeFile(path.join(directory, 'sample.srt'), source); await callback(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
async function settled(engine) {
  const deadline = Date.now() + 5000;
  while (engine.list().some(job => ['queued', 'preparing', 'processing'].includes(job.status))) {
    if (Date.now() > deadline) throw new Error('Jobs did not finish');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return engine.list();
}
test('inspect file shape, deduplication and symlink rejection', () => fixture(async directory => {
  const filename = path.join(directory, 'sample.srt');
  const files = await inspectFiles([filename, filename]);
  assert.equal(files.length, 1);
  assert.equal(files[0].category, 'subtitle');
  assert.equal(files[0].isDirectory, false);
  assert.equal(typeof files[0].id, 'string');
  assert.equal((await inspectFiles([directory]))[0].isDirectory, true);
  await symlink(filename, path.join(directory, 'link.srt'));
  await assert.rejects(inspectFiles([path.join(directory, 'link.srt')]), /Symbolic/);
}));
test('real subtitle conversion, atomic collision renaming and cleanup', () => fixture(async directory => {
  const updates = [];
  const engine = createEngine({ backends: {}, onUpdate: job => updates.push(job.status) });
  for (let index = 0; index < 2; index++) {
    await engine.enqueue({ files: [path.join(directory, 'sample.srt')], operation: 'convert', format: 'vtt' });
    await settled(engine);
  }
  const jobs = engine.list();
  assert.ok(jobs.every(job => job.status === 'completed' && job.progress === 100));
  assert.notEqual(jobs[0].output, jobs[1].output);
  assert.match(await readFile(jobs[0].output, 'utf8'), /^WEBVTT/);
  assert.equal(await readFile(path.join(directory, 'sample.srt'), 'utf8'), source);
  assert.ok(!(await readdir(directory)).some(name => name.startsWith('.santara-')));
  assert.ok(updates.includes('preparing'));
  assert.ok(updates.includes('processing'));
  jobs[0].status = 'corrupted';
  assert.equal(engine.list()[0].status, 'completed');
}));
test('skip and ask policies never overwrite, failed jobs retry', () => fixture(async directory => {
  const output = path.join(directory, 'sample-converted.vtt');
  await writeFile(output, 'keep me');
  const engine = createEngine({ backends: {}, settings: { collision: 'skip' } });
  await engine.enqueue({ files: [path.join(directory, 'sample.srt')], format: 'vtt' });
  assert.equal((await settled(engine))[0].status, 'skipped');
  engine.updateSettings({ collision: 'ask' });
  engine.retry(engine.list()[0].id);
  assert.equal((await settled(engine))[0].status, 'failed');
  assert.match(engine.list()[0].error, /Output exists/);
  assert.equal(await readFile(output, 'utf8'), 'keep me');
  engine.updateSettings({ collision: 'autorenaming' });
  engine.retry(engine.list()[0].id);
  assert.equal((await settled(engine))[0].status, 'completed');
}));
test('unsafe output naming fails with no output and no temporary files', () => fixture(async directory => {
  const engine = createEngine({ backends: {} });
  await engine.enqueue({ files: [path.join(directory, 'sample.srt')], format: 'vtt', options: { filename: '../escape.vtt' } });
  assert.equal((await settled(engine))[0].status, 'failed');
  assert.match(engine.list()[0].error, /Unsafe/);
  assert.deepEqual(await readdir(directory), ['sample.srt']);
}));
test('cancel preparing conversion and restore interrupted jobs without executing', () => fixture(async directory => {
  let engine;
  engine = createEngine({ backends: {}, onUpdate: job => { if (job.status === 'preparing') engine.cancel(job.id); } });
  await engine.enqueue({ files: [path.join(directory, 'sample.srt')], format: 'vtt' });
  assert.equal((await settled(engine))[0].status, 'cancelled');
  const restored = createEngine({ backends: {} });
  restored.restore([{ ...engine.list()[0], status: 'processing' }]);
  assert.equal(restored.list()[0].status, 'failed');
  assert.match(restored.list()[0].error, /Interrupted/);
  restored.restore(restored.list());
  assert.equal(restored.list().length, 1);
}));
test('unavailable conversions are skipped and invalid settings rejected', () => fixture(async directory => {
  const engine = createEngine({ backends: {} });
  const [job] = await engine.enqueue({ files: [path.join(directory, 'sample.srt')], format: 'exe' });
  assert.equal(job.status, 'skipped');
  assert.match(job.error, /unavailable/);
  assert.throws(() => engine.updateSettings({ concurrency: 0 }));
}));

test('installed FFmpeg performs real video, audio and GIF conversions', async context => {
  const backends = await detectBackends();
  if (!getCapabilities(backends).find(item => item.id === 'video:convert')?.available) return context.skip('FFmpeg codecs unavailable');
  await fixture(async directory => {
    const input = path.join(directory, 'clip.mp4');
    const generated = await probe(backends.ffmpeg.path, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x48:d=0.5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', input], 10000);
    assert.equal(generated.ok, true, generated.output);
    const engine = createEngine({ backends });
    for (const [operation, format, options] of [['convert', 'mp4', {}], ['resize', 'mp4', { width: 32, height: 24 }], ['crop', 'mp4', { width: 32, height: 24, x: 2, y: 4 }], ['rotate', 'mp4', {}], ['flip', 'mp4', {}], ['trim', 'mp4', { duration: 0.2 }], ['extract-audio', 'wav', {}], ['gif', 'gif', {}], ['strip-metadata', 'mp4', {}]]) {
      if (!getCapabilities(backends).find(item => item.id === `video:${operation}`)?.available) continue;
      await engine.enqueue({ files: [input], operation, format, options });
    }
    const jobs = await settled(engine);
    for (const job of jobs) assert.equal(job.status, 'completed', `${job.operation}: ${job.error}`);
    if (backends.ffprobe.available) {
      const result = await probe(backends.ffprobe.path, ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', jobs.find(job => job.operation === 'convert').output]);
      assert.equal(result.ok, true);
      const types = JSON.parse(result.output).streams.map(stream => stream.codec_type);
      assert.ok(types.includes('video') && types.includes('audio'));
    }
  });
});

test('installed ImageMagick converts a real raster image', async context => {
  const backends = await detectBackends();
  if (!backends.imagemagick?.available) return context.skip('ImageMagick unavailable');
  await fixture(async directory => {
    const input = path.join(directory, 'pixel.png');
    const generated = await probe(backends.imagemagick.path, ['-size', '2x2', 'xc:red', input]);
    assert.equal(generated.ok, true, generated.output);
    const engine = createEngine({ backends: { ...backends, sharp: { available: false } } });
    await engine.enqueue({ files: [input], format: 'png', operation: 'resize', options: { width: 1, height: 1 } });
    const [job] = await settled(engine);
    assert.equal(job.status, 'completed', job.error);
    assert.deepEqual((await readFile(job.output)).subarray(1, 4).toString(), 'PNG');
  });
});

function minimalPdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Resources << >> /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream'];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

test('installed Poppler renders a real PDF page', async context => {
  const backends = await detectBackends();
  if (!backends.poppler.available) return context.skip('Poppler unavailable');
  await fixture(async directory => {
    const input = path.join(directory, 'page.pdf');
    await writeFile(input, minimalPdf());
    const engine = createEngine({ backends });
    await engine.enqueue({ files: [input], operation: 'render', format: 'png', options: { dpi: 72 } });
    const [job] = await settled(engine);
    assert.equal(job.status, 'completed', job.error);
    assert.equal((await readFile(job.output)).subarray(1, 4).toString(), 'PNG');
  });
});

test('installed qpdf extracts, rotates, compresses and merges PDFs', async context => {
  const backends = await detectBackends();
  if (!backends.qpdf.available) return context.skip('qpdf unavailable');
  await fixture(async directory => {
    const input = path.join(directory, 'page.pdf');
    const second = path.join(directory, 'second.pdf');
    await writeFile(input, minimalPdf());
    await writeFile(second, minimalPdf());
    const engine = createEngine({ backends });
    for (const operation of ['pdf-extract', 'pdf-rotate', 'compress', 'pdf-merge']) await engine.enqueue({ files: operation === 'pdf-merge' ? [input, second] : [input], operation, format: 'pdf' });
    for (const job of await settled(engine)) {
      assert.equal(job.status, 'completed', job.error);
      assert.equal((await readFile(job.output)).subarray(0, 5).toString(), '%PDF-');
    }
  });
});

test('concurrent publication never replaces an existing output or input', () => fixture(async directory => {
  const engine = createEngine({ backends: {}, settings: { concurrency: 2 } });
  await engine.enqueue({ files: [path.join(directory, 'sample.srt')], format: 'vtt' });
  await engine.enqueue({ files: [path.join(directory, 'sample.srt')], format: 'vtt' });
  const jobs = await settled(engine);
  assert.ok(jobs.every(job => job.status === 'completed'));
  assert.equal(new Set(jobs.map(job => job.output)).size, 2);
}));

test('basic signatures reject disguised files and accept known headers', () => fixture(async directory => {
  const headers = {
    png: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), jpg: Buffer.from([255, 216, 255, 224]),
    pdf: Buffer.from('%PDF-1.4\n'), wav: Buffer.from('RIFF0000WAVE'), zip: Buffer.from([80, 75, 5, 6]),
  };
  for (const [ext, header] of Object.entries(headers)) {
    const filename = path.join(directory, `signature.${ext}`);
    await writeFile(filename, 'disguised content');
    await assert.rejects(inspectFiles([filename]), /signature/);
    await writeFile(filename, header);
    await validateSignature(filename);
    assert.equal((await inspectFiles([filename]))[0].ext, ext);
  }
}));

test('mixed enqueue skips incompatible, missing and disguised inputs independently', () => fixture(async directory => {
  const disguised = path.join(directory, 'fake.png');
  await writeFile(disguised, source);
  const engine = createEngine({ backends: {} });
  await engine.enqueue({ files: [path.join(directory, 'sample.srt'), disguised, path.join(directory, 'missing.srt'), directory], operation: 'convert', format: 'txt' });
  const jobs = await settled(engine);
  assert.equal(jobs[0].status, 'completed');
  assert.equal(await readFile(jobs[0].output, 'utf8'), 'Hello\n');
  assert.deepEqual(jobs.slice(1).map(job => job.status), ['skipped', 'skipped', 'skipped']);
  assert.match(jobs[1].error, /signature/);
  assert.match(jobs[3].error, /Directory/);
}));

test('cancel during processing leaves no published or temporary output', () => fixture(async directory => {
  let engine;
  engine = createEngine({ backends: {}, onUpdate: job => { if (job.status === 'processing') engine.cancel(job.id); } });
  await engine.enqueue({ files: [path.join(directory, 'sample.srt')], format: 'txt' });
  assert.equal((await settled(engine))[0].status, 'cancelled');
  assert.deepEqual(await readdir(directory), ['sample.srt']);
}));

test('installed FFmpeg preserves supported tags, strips on request, and converts added formats', async context => {
  const backends = await detectBackends();
  if (!backends.ffmpeg.available || !backends.ffprobe.available) return context.skip('FFmpeg/ffprobe unavailable');
  await fixture(async directory => {
    const input = path.join(directory, 'tagged.mp4');
    const generated = await probe(backends.ffmpeg.path, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x48:d=0.5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-c:v', 'libx264', '-c:a', 'aac', '-metadata', 'title=Santara title', '-shortest', input], 10000);
    if (!generated.ok) return context.skip('Fixture codecs unavailable');
    const engine = createEngine({ backends, settings: { stripMetadata: true } });
    await engine.enqueue({ files: [input], format: 'mp4', options: { stripMetadata: false } });
    await engine.enqueue({ files: [input], format: 'mp4' });
    await engine.enqueue({ files: [input], operation: 'strip-metadata', format: 'mp4', options: { stripMetadata: false } });
    for (const format of ['mov', 'avi', 'wmv']) {
      if (getCapabilities(backends).find(item => item.id === 'video:convert').outputs.includes(format)) await engine.enqueue({ files: [input], format });
    }
    for (const format of ['aiff', 'wma']) {
      if (getCapabilities(backends).find(item => item.id === 'video:extract-audio').outputs.includes(format)) await engine.enqueue({ files: [input], operation: 'extract-audio', format });
    }
    const jobs = await settled(engine);
    for (const job of jobs) assert.equal(job.status, 'completed', `${job.format}: ${job.error}`);
    const titles = [];
    for (const job of jobs.slice(0, 3)) {
      const result = await probe(backends.ffprobe.path, ['-v', 'error', '-show_entries', 'format_tags=title', '-of', 'json', job.output]);
      assert.equal(result.ok, true, result.output);
      titles.push(JSON.parse(result.output).format?.tags?.title);
    }
    assert.deepEqual(titles, ['Santara title', undefined, undefined]);
    const formats = jobs.slice(3).map(job => job.format);
    for (const format of ['mov', 'avi', 'wmv', 'aiff', 'wma']) if (getCapabilities(backends).some(item => item.available && item.outputs.includes(format))) assert.ok(formats.includes(format));
    await engine.enqueue({ files: [input], operation: 'crop', format: 'mp4', options: { width: 64, height: 48, x: 2, y: 0 } });
    assert.equal((await settled(engine)).at(-1).status, 'failed');
    assert.match(engine.list().at(-1).error, /exceeds/);
    await engine.enqueue({ files: [input], operation: 'crop', format: 'mp4', options: { width: '32;injection', height: 24 } });
    assert.equal((await settled(engine)).at(-1).status, 'failed');
  });
});

test('Poppler defaults to 300 DPI', async context => {
  const backends = await detectBackends();
  if (!backends.poppler.available) return context.skip('Poppler unavailable');
  await fixture(async directory => {
    const input = path.join(directory, 'page.pdf');
    await writeFile(input, minimalPdf());
    const engine = createEngine({ backends });
    await engine.enqueue({ files: [input], operation: 'render', format: 'png' });
    const [job] = await settled(engine);
    assert.equal(job.status, 'completed', job.error);
    const png = await readFile(job.output);
    assert.equal(png.readUInt32BE(16), 300);
    assert.equal(png.readUInt32BE(20), 300);
  });
});

test('image command arguments auto-orient, strip profiles, flatten JPEG and bound crop', () => fixture(async directory => {
  const executable = path.join(directory, 'image-fixture.mjs');
  const log = path.join(directory, 'image-args.jsonl');
  await writeFile(executable, `#!${process.execPath}\nimport {appendFileSync,writeFileSync} from 'node:fs';\nconst args=process.argv.slice(2);\nappendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');\nif(args.at(-1)==='info:') process.stdout.write('10 10');\nelse { const target=args.at(-1); const colon=target.indexOf(':'); writeFileSync(target.slice(colon+1), target.startsWith('jpeg:') ? Buffer.from([255,216,255,224]) : Buffer.from([137,80,78,71,13,10,26,10])); }\n`, { mode: 0o700 });
  const input = path.join(directory, 'pixel.png');
  await writeFile(input, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const backends = { imagemagick: { available: true, path: executable, coders: { png: { read: true, write: true }, jpeg: { read: true, write: true } } } };
  const engine = createEngine({ backends, settings: { stripMetadata: true, namingPattern: '{name}-custom' } });
  await engine.enqueue({ files: [input], format: 'jpg' });
  await engine.enqueue({ files: [input], operation: 'compress', format: 'png' });
  await engine.enqueue({ files: [input], operation: 'crop', format: 'png', options: { width: 2, height: 3, x: 1, y: 2, stripMetadata: false } });
  for (const job of await settled(engine)) assert.equal(job.status, 'completed', job.error);
  assert.equal(path.basename(engine.list().find(job => job.operation === 'compress').output), 'pixel-compressed.png');
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const jpeg = calls.find(args => args.at(-1).startsWith('jpeg:'));
  assert.ok(jpeg.indexOf('-auto-orient') < jpeg.indexOf('-strip'));
  assert.deepEqual(jpeg.slice(jpeg.indexOf('-background'), -1), ['-background', 'white', '-alpha', 'remove', '-alpha', 'off']);
  const crop = calls.find(args => args.includes('-crop'));
  assert.ok(crop.includes('2x3+1+2') && crop.includes('+repage'));
  assert.ok(!crop.includes('-strip'));
  await engine.enqueue({ files: [input], operation: 'crop', format: 'png', options: { width: 10, height: 10, x: 1 } });
  assert.equal((await settled(engine)).at(-1).status, 'failed');
  assert.match(engine.list().at(-1).error, /exceeds/);
}));

test('installed Pandoc uses only self-tested sandbox formats', async context => {
  const backends = await detectBackends();
  const capability = getCapabilities(backends).find(item => item.id === 'document:convert');
  if (!capability.available) return context.skip('Sandboxed Pandoc unavailable');
  await fixture(async directory => {
    const input = path.join(directory, 'document.md');
    await writeFile(input, '# Santara\n\nHello world.\n');
    const engine = createEngine({ backends });
    for (const format of capability.outputs) await engine.enqueue({ files: [input], format });
    for (const job of await settled(engine)) assert.equal(job.status, 'completed', `${job.format}: ${job.error}`);
    assert.equal(capability.outputs.includes('pdf'), false);
  });
});

test('archive creation groups files, removes parent/child overlaps and extracts into new folders', () => fixture(async directory => {
  const folder = path.join(directory, 'folder');
  const child = path.join(folder, 'hello.txt');
  await mkdir(folder);
  await writeFile(child, 'archive contents');
  const engine = createEngine({ backends: {} });
  const created = await engine.enqueue({ files: [folder, child, folder, path.join(directory, 'sample.srt')], operation: 'create-archive', format: 'zip' });
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].options.inputs, [folder, path.join(directory, 'sample.srt')]);
  const [archive] = await settled(engine);
  assert.equal(archive.status, 'completed', archive.error);
  for (let index = 0; index < 2; index++) {
    await engine.enqueue({ files: [archive.output], operation: 'extract', format: 'directory' });
    assert.equal((await settled(engine)).at(-1).status, 'completed', engine.list().at(-1).error);
  }
  const outputs = engine.list().slice(1).map(job => job.output);
  assert.notEqual(outputs[0], outputs[1]);
  assert.equal(await readFile(path.join(outputs[0], 'folder', 'hello.txt'), 'utf8'), 'archive contents');
  assert.equal(await readFile(path.join(outputs[0], 'sample.srt'), 'utf8'), source);
  engine.updateSettings({ collision: 'skip' });
  await engine.enqueue({ files: [archive.output], operation: 'extract', format: 'directory' });
  assert.equal((await settled(engine)).at(-1).status, 'skipped');
  assert.ok(!(await readdir(directory)).some(name => name.startsWith('.santara-')));
}));

test('TAR/GZIP archive engine round trips and GZIP rejects grouped input', () => fixture(async directory => {
  const engine = createEngine({ backends: {} });
  for (const format of ['tar', 'gz']) {
    await engine.enqueue({ files: [path.join(directory, 'sample.srt')], operation: 'create-archive', format });
    const archive = (await settled(engine)).at(-1);
    assert.equal(archive.status, 'completed', archive.error);
    await engine.enqueue({ files: [archive.output], operation: 'extract', format: 'directory' });
    const extracted = (await settled(engine)).at(-1);
    assert.equal(extracted.status, 'completed', extracted.error);
    assert.equal(await readFile(path.join(extracted.output, format === 'gz' ? 'content' : 'sample.srt'), 'utf8'), source);
  }
  await engine.enqueue({ files: [directory], operation: 'create-archive', format: 'gz' });
  assert.equal(engine.list().at(-1).status, 'skipped');
  assert.match(engine.list().at(-1).error, /GZIP/);
}));

test('default conversion naming and conversion-only naming patterns are safe', () => fixture(async directory => {
  const engine = createEngine({ backends: {} });
  await engine.enqueue({ files: [path.join(directory, 'sample.srt')], format: 'vtt' });
  assert.equal(path.basename((await settled(engine))[0].output), 'sample-converted.vtt');
  engine.updateSettings({ namingPattern: '{name}-custom.{ext}' });
  await engine.enqueue({ files: [path.join(directory, 'sample.srt')], format: 'vtt' });
  assert.equal(path.basename((await settled(engine)).at(-1).output), 'sample-custom.vtt');
  engine.updateSettings({ namingPattern: '../{name}' });
  await engine.enqueue({ files: [path.join(directory, 'sample.srt')], format: 'vtt' });
  assert.equal((await settled(engine)).at(-1).status, 'failed');
  assert.match(engine.list().at(-1).error, /Unsafe/);
}));

test('retry overrides a persisted ask policy with rename without replacing output', () => fixture(async directory => {
  const output = path.join(directory, 'sample-converted.vtt');
  await writeFile(output, 'original output');
  const engine = createEngine({ backends: {} });
  const [queued] = await engine.enqueue({ files: [path.join(directory, 'sample.srt')], format: 'vtt', options: { collision: 'ask' } });
  assert.equal((await settled(engine))[0].status, 'failed');
  assert.throws(() => engine.retry(queued.id, { collision: 'overwrite' }), /collision/);
  assert.throws(() => engine.retry(queued.id, { outputDirectory: directory }), /only/);
  assert.equal(engine.list()[0].options.collision, 'ask');
  const retried = engine.retry(queued.id, { collision: 'rename' });
  assert.equal(retried.options.collision, 'rename');
  const [completed] = await settled(engine);
  assert.equal(completed.status, 'completed', completed.error);
  assert.equal(path.basename(completed.output), 'sample-converted (1).vtt');
  assert.equal(await readFile(output, 'utf8'), 'original output');
}));

test('retry filename overrides retain execution-time path safety', () => fixture(async directory => {
  const engine = createEngine({ backends: {} });
  const [job] = await engine.enqueue({ files: [path.join(directory, 'sample.srt')], format: 'vtt', options: { filename: '../unsafe.vtt' } });
  assert.equal((await settled(engine))[0].status, 'failed');
  engine.retry(job.id, { filename: '../still-unsafe.vtt' });
  assert.equal((await settled(engine))[0].status, 'failed');
  engine.retry(job.id, { filename: 'chosen.vtt' });
  const [completed] = await settled(engine);
  assert.equal(completed.status, 'completed');
  assert.equal(path.basename(completed.output), 'chosen.vtt');
}));

test('bundled Sharp converts PNG to JPEG and JPEG to PNG through engine atomic outputs', async context => {
  const detected = await detectBackends();
  if (!detected.sharp?.available) return context.skip('Sharp adapter/native addon unavailable');
  const jpeg = detected.sharp.outputs.find(ext => ['jpg', 'jpeg'].includes(ext));
  if (!jpeg || !detected.sharp.outputs.includes('png')) return context.skip('Sharp JPEG/PNG codecs unavailable');
  await fixture(async directory => {
    const chunk = (type, data) => {
      const buffer = Buffer.alloc(data.length + 12);
      buffer.writeUInt32BE(data.length);
      buffer.write(type, 4, 4, 'ascii');
      data.copy(buffer, 8);
      buffer.writeUInt32BE(crc32(buffer.subarray(4, -4)), buffer.length - 4);
      return buffer;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
    const input = path.join(directory, 'red.png');
    await writeFile(input, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0]))), chunk('IEND', Buffer.alloc(0))]));
    const engine = createEngine({ backends: { sharp: detected.sharp } });
    await engine.enqueue({ files: [input], format: jpeg, options: { filename: `sharp-first.${jpeg}`, outputDirectory: directory, collision: 'ask', quality: 80 } });
    const [first] = await settled(engine);
    assert.equal(first.status, 'completed', first.error);
    await validateSignature(first.output);
    await engine.enqueue({ files: [first.output], format: 'png' });
    const last = (await settled(engine)).at(-1);
    assert.equal(last.status, 'completed', last.error);
    await validateSignature(last.output);
    assert.ok(!(await readdir(directory)).some(name => name.startsWith('.santara-')));
  });
});

test('Sharp engine normalizes numeric UI strings and omits blank optional values', async context => {
  const detected = await detectBackends();
  if (!detected.sharp?.available) return context.skip('Sharp adapter/native addon unavailable');
  const { default: sharp } = await import('sharp');
  await fixture(async directory => {
    const input = path.join(directory, 'large.png');
    await sharp({ create: { width: 64, height: 48, channels: 3, background: '#ff0000' } }).png().toFile(input);
    const engine = createEngine({ backends: { sharp: detected.sharp } });
    for (const [operation, options] of [
      ['resize', { width: '32', height: '24', quality: '80', compressionLevel: '6', stripMetadata: false }],
      ['rotate', { angle: '90', quality: '', compressionLevel: ' ', autoOrient: true }],
      ['crop', { width: '32', height: '24', x: '2', y: '4' }],
      ['resize', { width: '32', height: '' }],
    ]) await engine.enqueue({ files: [input], operation, format: 'png', options });
    const jobs = await settled(engine);
    const dimensions = [];
    for (const job of jobs) {
      assert.equal(job.status, 'completed', `${job.operation}: ${job.error}`);
      const metadata = await sharp(job.output).metadata();
      dimensions.push([metadata.width, metadata.height]);
    }
    assert.deepEqual(dimensions, [[32, 24], [48, 64], [32, 24], [32, 24]]);
    await engine.enqueue({ files: [input], operation: 'resize', format: 'png', options: { width: 'invalid' } });
    assert.equal((await settled(engine)).at(-1).status, 'failed');
  });
});
