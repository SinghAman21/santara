import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { createEngine, parseSegments, parseSnapshotTimes, validateSignature } from '../electron/engine.mjs';
import { detectBackends, getCapabilities } from '../electron/registry.mjs';

async function workspace(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'santara-editor-engine-'));
  try { await callback(directory); } finally { await rm(directory, { force: true, recursive: true }); }
}

async function finish(engine) {
  const deadline = Date.now() + 20000;
  while (engine.list().some(job => ['queued', 'preparing', 'processing'].includes(job.status))) {
    if (Date.now() > deadline) throw new Error('Editor job did not finish');
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  return engine.list();
}

function tone() {
  const rate = 8000, samples = rate;
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) data.writeInt16LE(Math.round(Math.sin(index / rate * 440 * Math.PI * 2) * 10000), 44 + index * 2);
  return data;
}

test('time ranges validate order, syntax and bounded job expansion', () => {
  assert.deepEqual(parseSegments('0-0.5, 1.25-3'), [{ start: 0, duration: 0.5 }, { start: 1.25, duration: 1.75 }]);
  for (const value of ['', '1-0', '0-0', '-1-2', '0-4;touch', '0-999999', Array(101).fill('0-1').join(',')]) assert.throws(() => parseSegments(value));
});

test('frame timestamps are bounded, deduplicated, sorted, and expanded into safe PNG outputs', () => {
  assert.deepEqual(parseSnapshotTimes(['2.5', 0, 1, 1]), [{ time: 0 }, { time: 1 }, { time: 2.5 }]);
  for (const value of [[], Array(101).fill(0), ['1,drawbox'], [''], [' '], [true], [null], [{}], [-1], [604801], [NaN]]) assert.throws(() => parseSnapshotTimes(value));
});

test('video signature validation rejects misleading extensions before codec processing', async () => workspace(async directory => {
  const mp4 = path.join(directory, 'sample.mp4');
  await writeFile(mp4, Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 6, 0, 0, 0, 1]));
  await validateSignature(mp4);
  const misleading = path.join(directory, 'renamed.mp4');
  await writeFile(misleading, Buffer.from('not a video'));
  await assert.rejects(validateSignature(misleading), /signature does not match/);
}));

test('photo editor recipes pass through the queue without changing originals', () => workspace(async directory => {
  const input = path.join(directory, 'source.png');
  await sharp({ create: { width: 30, height: 20, channels: 4, background: '#ff880080' } }).png().toFile(input);
  const original = await readFile(input);
  const backends = { sharp: { available: true, inputs: ['png'], outputs: ['png'] } };
  const engine = createEngine({ backends });
  await engine.enqueue({ files: [input], operation: 'edit-image', format: 'png', options: { cropX: '0', cropY: '0', cropWidth: '20', cropHeight: '10', angle: '90', padding: '3', backgroundType: 'solid', backgroundColor: '#234567', flipHorizontal: 'true', brightness: '1.1', contrast: '1', saturation: '1', quality: '85' } });
  const [job] = await finish(engine);
  assert.equal(job.status, 'completed', job.error);
  const metadata = await sharp(job.output).metadata();
  assert.equal(metadata.width, 16); assert.equal(metadata.height, 26);
  const pixels = await sharp(job.output).raw().toBuffer();
  assert.deepEqual([...pixels.subarray(0, 3)], [35, 69, 103]);
  assert.deepEqual(await readFile(input), original);
  assert.equal((await readdir(directory)).some(name => name.startsWith('.santara-')), false);
}));

test('visualizer and split/merge export real queued media with safe names', async context => {
  const backends = await detectBackends();
  const capabilities = getCapabilities(backends);
  if (!['audio:visualize', 'audio:split', 'audio:merge'].every(id => capabilities.find(cap => cap.id === id)?.available)) return context.skip('Optional FFmpeg/FFprobe codecs unavailable');
  await workspace(async directory => {
    const first = path.join(directory, 'tone.wav'), second = path.join(directory, 'tone two.wav');
    await writeFile(first, tone()); await writeFile(second, tone());
    const engine = createEngine({ backends, settings: { concurrency: 1 } });
    await engine.enqueue({ files: [first], operation: 'visualize', format: 'mp4', options: { width: '320', height: '180', fps: '12', backgroundColor: '#17291f', waveColor: '#ff9933', style: 'line' } });
    let jobs = await finish(engine);
    assert.equal(jobs[0].status, 'completed', jobs[0].error);
    assert.equal((await readFile(jobs[0].output)).toString('ascii', 4, 8), 'ftyp');
    const split = await engine.enqueue({ files: [first], operation: 'split', format: 'wav', options: { segments: '0-0.25,0.5-0.9' } });
    assert.equal(split.length, 2);
    jobs = await finish(engine);
    for (const job of jobs.filter(item => item.operation === 'split')) {
      assert.equal(job.status, 'completed', job.error);
      assert.match(path.basename(job.output), /^tone-00[12]\.wav$/);
      assert.ok((await readFile(job.output)).length > 44);
    }
    await engine.enqueue({ files: [first, second], operation: 'merge', format: 'wav', options: { reencode: true } });
    jobs = await finish(engine);
    const merged = jobs.at(-1);
    assert.equal(merged.status, 'completed', merged.error);
    assert.ok((await readFile(merged.output)).length > tone().length * 1.9);
    assert.deepEqual(await readFile(first), tone());
    assert.equal((await readdir(directory)).some(name => name.startsWith('.santara-')), false);
  });
});

test('new visual tools stay unavailable without their required codecs and filters', () => {
  const backends = { ffmpeg: { available: true, encoders: 'libx264 aac', muxers: 'mp4', demuxers: 'mov wav', filters: 'showwaves' } };
  const capabilities = getCapabilities(backends);
  assert.equal(capabilities.find(cap => cap.id === 'audio:visualize').available, false);
  assert.equal(capabilities.find(cap => cap.id === 'audio:merge').available, false);
  assert.equal(capabilities.find(cap => cap.id === 'video:snapshot').available, false);
  assert.equal(capabilities.find(cap => cap.id === 'image:background').available, false);
});
