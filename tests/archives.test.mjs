import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync, gzipSync } from 'node:zlib';
import tar from 'tar-stream';
import { createArchive, extractArchive, inspectArchive, crc32, ARCHIVE_LIMITS } from '../electron/archives.mjs';

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'santara-archives-test-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function zipFixture(name, data = Buffer.from('original test fixture'), { mode = 0x8180, deflate = false, size = data.length, crc = crc32(data) } = {}) {
  const filename = Buffer.from(name);
  const payload = deflate ? deflateRawSync(data) : data;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(deflate ? 8 : 0, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(size, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(0x314, 4);
  local.copy(central, 6, 4, 30);
  central.writeUInt32LE((mode * 65536) >>> 0, 38);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + filename.length, 12);
  end.writeUInt32LE(30 + filename.length + payload.length, 16);
  return Buffer.concat([local, filename, payload, central, filename, end]);
}

function tarFixture(name, type = '0', link = '') {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write('00000000000\0', 124, 12);
  header.fill(32, 148, 156);
  header.write(type, 156, 1);
  header.write(link, 157, 100);
  header.write('ustar\0', 257, 6);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return Buffer.concat([header, Buffer.alloc(1024)]);
}

function zipMany(items) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const item of items) {
    const archive = zipFixture(item.name, Buffer.alloc(0), { size: item.size || 0, deflate: true });
    const centralOffset = archive.readUInt32LE(archive.length - 6);
    const local = archive.subarray(0, centralOffset);
    const central = Buffer.from(archive.subarray(centralOffset, archive.length - 22));
    central.writeUInt32LE(offset, 42);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(items.length, 8);
  end.writeUInt16LE(items.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test('CRC32 standard reference vector', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

for (const format of ['zip', 'tar']) {
  test(`${format} roundtrip retains directories, empty files, Unicode and binary`, async context => {
    const root = await fixture(context);
    const source = path.join(root, 'source');
    await fs.mkdir(path.join(source, 'empty'), { recursive: true });
    await fs.writeFile(path.join(source, '世界.txt'), 'Hello 世界');
    await fs.writeFile(path.join(source, 'zero'), '');
    await fs.writeFile(path.join(source, 'binary'), Buffer.from([0, 255, 13, 10]));
    const output = path.join(root, `archive.${format}`);
    const created = await createArchive({ inputs: [source], output, format });
    assert.equal(created.entries.length, 5);
    assert.equal((await inspectArchive({ input: output })).totalBytes, Buffer.byteLength('Hello 世界') + 4);
    const destination = path.join(root, 'out');
    await extractArchive({ input: output, outputDirectory: destination });
    assert.equal(await fs.readFile(path.join(destination, 'source', '世界.txt'), 'utf8'), 'Hello 世界');
    assert.deepEqual(await fs.readFile(path.join(destination, 'source', 'binary')), Buffer.from([0, 255, 13, 10]));
    assert.deepEqual(await fs.readdir(path.join(destination, 'source', 'empty')), []);
    assert.equal((await fs.stat(destination)).mode & 0o777, 0o700);
    await assert.rejects(createArchive({ inputs: [source], output, format }), /EEXIST/);
    await assert.rejects(extractArchive({ input: output, outputDirectory: destination }), /EEXIST/);
  });
}

test('GZIP roundtrip uses a safe fixed output filename', async context => {
  const root = await fixture(context);
  const input = path.join(root, 'hello.txt');
  await fs.writeFile(input, 'gzip original fixture');
  const archive = path.join(root, 'hello.gz');
  await createArchive({ inputs: [input], output: archive });
  const destination = path.join(root, 'out');
  await extractArchive({ input: archive, outputDirectory: destination });
  assert.equal(await fs.readFile(path.join(destination, 'content'), 'utf8'), 'gzip original fixture');
  await assert.rejects(createArchive({ inputs: [root], output: path.join(root, 'multi.gz') }), /GZIP requires/);
});

test('ZIP accepts DEFLATE and verifies CRC and declared sizes', async context => {
  const root = await fixture(context);
  for (const [label, options, valid] of [
    ['valid', { deflate: true }, true],
    ['bad-crc', { crc: 123 }, false],
    ['small-size', { deflate: true, size: 1 }, false],
    ['large-size', { size: ARCHIVE_LIMITS.entryBytes + 1 }, false],
  ]) {
    const input = path.join(root, `${label}.zip`);
    await fs.writeFile(input, zipFixture('file.txt', Buffer.from('compress me'), options));
    if (valid) assert.equal((await inspectArchive({ input })).entries[0].size, 11);
    else await assert.rejects(inspectArchive({ input }));
  }
});

test('DEFLATE CRC corruption and understated expansion never publish a destination', async context => {
  const root = await fixture(context);
  const payload = Buffer.alloc(1024 * 1024, 65);
  for (const [label, options] of [
    ['crc', { deflate: true, crc: (crc32(payload) ^ 1) >>> 0 }],
    ['expansion', { deflate: true, size: 1 }],
  ]) {
    const input = path.join(root, `${label}.zip`);
    const outputDirectory = path.join(root, label);
    await fs.writeFile(input, zipFixture('payload', payload, options));
    await assert.rejects(extractArchive({ input, outputDirectory }), /CRC32|too many bytes|size limit/);
    await assert.rejects(fs.lstat(outputDirectory), /ENOENT/);
  }
  assert.deepEqual((await fs.readdir(root)).filter(name => name.startsWith('.santara-')), []);
});

test('tar-stream generated link headers and PAX traversal metadata are rejected', async context => {
  const root = await fixture(context);
  for (const [index, header] of [
    { name: 'symlink', type: 'symlink', linkname: '../outside' },
    { name: 'hardlink', type: 'link', linkname: '../outside' },
    { name: 'safe', type: 'file', pax: { path: '../outside' } },
    { name: 'safe', type: 'file', pax: { linkpath: '../outside' } },
  ].entries()) {
    const pack = tar.pack();
    const collected = (async () => {
      const chunks = [];
      for await (const chunk of pack) chunks.push(chunk);
      return Buffer.concat(chunks);
    })();
    pack.entry(header, Buffer.alloc(0));
    pack.finalize();
    const input = path.join(root, `backend-${index}.tar`);
    const outputDirectory = path.join(root, `out-${index}`);
    await fs.writeFile(input, await collected);
    await assert.rejects(extractArchive({ input, outputDirectory }), /link|Unsafe/);
    await assert.rejects(fs.lstat(outputDirectory), /ENOENT/);
  }
});

test('TAR declared entry cap and GZIP actual decompression cap fail closed', async context => {
  const root = await fixture(context);
  const oversizedTar = tarFixture('oversized');
  oversizedTar.write((ARCHIVE_LIMITS.entryBytes + 1).toString(8).padStart(11, '0') + '\0', 124, 12);
  oversizedTar.fill(32, 148, 156);
  const checksum = oversizedTar.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
  oversizedTar.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  const tarInput = path.join(root, 'oversized.tar');
  await fs.writeFile(tarInput, oversizedTar);
  await assert.rejects(inspectArchive({ input: tarInput }), /entry size limit/);
  const gzipInput = path.join(root, 'oversized.gz');
  await fs.writeFile(gzipInput, gzipSync(Buffer.alloc(ARCHIVE_LIMITS.entryBytes + 1)));
  const outputDirectory = path.join(root, 'out');
  await assert.rejects(extractArchive({ input: gzipInput, outputDirectory }), /larger than|size limit/);
  await assert.rejects(fs.lstat(outputDirectory), /ENOENT/);
});

test('entry counts, total expansion caps, duplicates and file/parent conflicts fail before publication', async context => {
  const root = await fixture(context);
  const cases = [
    [{ name: 'one', size: ARCHIVE_LIMITS.entryBytes }, { name: 'two', size: ARCHIVE_LIMITS.entryBytes }, { name: 'three', size: 1 }],
    [{ name: 'duplicate' }, { name: 'DUPLICATE' }],
    [{ name: 'parent' }, { name: 'parent/child' }],
    Array.from({ length: ARCHIVE_LIMITS.entries + 1 }, (_, index) => ({ name: `entry-${index}` })),
  ];
  for (const [index, entries] of cases.entries()) {
    const input = path.join(root, `limits-${index}.zip`);
    const outputDirectory = path.join(root, `out-${index}`);
    await fs.writeFile(input, zipMany(entries));
    await assert.rejects(extractArchive({ input, outputDirectory }), /limit|Duplicate|conflict/);
    await assert.rejects(fs.lstat(outputDirectory), /ENOENT/);
  }
});

test('competing extractions publish exactly one complete directory', async context => {
  const root = await fixture(context);
  const input = path.join(root, 'race.zip');
  const outputDirectory = path.join(root, 'out');
  await fs.writeFile(input, zipFixture('complete.txt', Buffer.from('complete')));
  const results = await Promise.allSettled([
    extractArchive({ input, outputDirectory }),
    extractArchive({ input, outputDirectory }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await fs.readFile(path.join(outputDirectory, 'complete.txt'), 'utf8'), 'complete');
  assert.deepEqual((await fs.readdir(root)).filter(name => name.startsWith('.santara-')), []);
});

test('archive slip names fail before publishing or writing outside stage', async context => {
  const root = await fixture(context);
  const names = ['../escape', '/absolute', 'C:/drive', '//server/share', 'a\\b', 'a/../../escape', 'a\0evil', 'a/./b', 'a//b'];
  for (const format of ['zip', 'tar']) {
    for (const [index, name] of names.entries()) {
      if (format === 'tar' && name.includes('\0')) continue;
      const input = path.join(root, `bad-${index}.${format}`);
      const destination = path.join(root, `out-${format}-${index}`);
      await fs.writeFile(input, format === 'zip' ? zipFixture(name) : tarFixture(name));
      await assert.rejects(extractArchive({ input, outputDirectory: destination }), /Unsafe/);
      await assert.rejects(fs.lstat(destination), /ENOENT/);
    }
  }
  await assert.rejects(fs.lstat(path.join(root, 'escape')), /ENOENT/);
});

test('ZIP symlink and special headers; TAR symlink, hardlink and extension headers are rejected', async context => {
  const root = await fixture(context);
  const zip = path.join(root, 'link.zip');
  await fs.writeFile(zip, zipFixture('link', Buffer.from('../outside'), { mode: 0xa1ff }));
  await assert.rejects(inspectArchive({ input: zip }), /link/);
  for (const type of ['1', '2', '3', '6', 'x', 'g', 'L']) {
    const input = path.join(root, `link-${type}.tar`);
    await fs.writeFile(input, tarFixture('link', type, '../outside'));
    await assert.rejects(inspectArchive({ input }), /link/);
  }
});

test('filesystem symlinks, hardlinks and destination symlink parents are rejected', async context => {
  const root = await fixture(context);
  const source = path.join(root, 'source');
  const alias = path.join(root, 'alias');
  await fs.writeFile(source, 'test');
  await fs.symlink(source, alias);
  await assert.rejects(createArchive({ inputs: [alias], output: path.join(root, 'bad.zip') }), /Symlink/);
  const archive = path.join(root, 'ok.zip');
  await createArchive({ inputs: [source], output: archive });
  const directoryAlias = path.join(root, 'directory-alias');
  await fs.symlink(root, directoryAlias);
  await assert.rejects(extractArchive({ input: archive, outputDirectory: path.join(directoryAlias, 'out') }), /Symlink/);
  await assert.rejects(createArchive({ inputs: [source], output: path.join(directoryAlias, 'out.zip') }), /Symlink/);
  await fs.link(source, path.join(root, 'hardlink'));
  await assert.rejects(createArchive({ inputs: [source], output: path.join(root, 'hard.zip') }), /hardlinks/);
});

test('existing empty directories and symlinks never become extraction targets', async context => {
  const root = await fixture(context);
  const archive = path.join(root, 'fixture.zip');
  await fs.writeFile(archive, zipFixture('file'));
  const output = path.join(root, 'empty');
  await fs.mkdir(output);
  await assert.rejects(extractArchive({ input: archive, outputDirectory: output }), /EEXIST/);
  assert.deepEqual(await fs.readdir(output), []);
  await fs.symlink(output, path.join(root, 'alias'));
  await assert.rejects(extractArchive({ input: archive, outputDirectory: path.join(root, 'alias') }), /EEXIST/);
  assert.deepEqual((await fs.readdir(root)).filter(name => name.startsWith('.santara-')), []);
});

test('corrupt TAR and GZIP fail closed; RAR is explicitly unavailable; cancellation cleans up', async context => {
  const root = await fixture(context);
  const tar = tarFixture('file');
  tar[0] ^= 1;
  const input = path.join(root, 'bad.tar');
  await fs.writeFile(input, tar);
  await assert.rejects(inspectArchive({ input }), /checksum|Invalid tar header/);
  const gz = gzipSync('fixture');
  gz[gz.length - 8] ^= 1;
  const gzipInput = path.join(root, 'bad.gz');
  await fs.writeFile(gzipInput, gz);
  await assert.rejects(inspectArchive({ input: gzipInput }));
  await assert.rejects(inspectArchive({ input, format: 'rar' }), /RAR archives are unavailable/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(extractArchive({ input, outputDirectory: path.join(root, 'out'), signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(createArchive({ inputs: [input], output: path.join(root, 'out.zip'), signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual((await fs.readdir(root)).filter(name => name.startsWith('.santara-')), []);
});
