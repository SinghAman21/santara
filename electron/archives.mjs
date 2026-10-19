import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';
import yauzl from 'yauzl';
import yazl from 'yazl';
import tar from 'tar-stream';

export const ARCHIVE_LIMITS = Object.freeze({ entryBytes: 64 * 1024 * 1024, totalBytes: 128 * 1024 * 1024, archiveBytes: 160 * 1024 * 1024, entries: 10000 });
const ungzip = promisify(gunzip);
const compress = promisify(gzip);
const decoder = new TextDecoder('utf-8', { fatal: true });
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function check(signal) { signal?.throwIfAborted(); }
function formatOf(format, filename) {
  const result = String(format || path.extname(filename).slice(1)).toLowerCase();
  if (result === 'rar') throw new Error('RAR archives are unavailable');
  if (!['zip', 'tar', 'gzip', 'gz'].includes(result)) throw new Error('Unsupported archive format');
  return result === 'gz' ? 'gzip' : result;
}
function safeName(name) {
  if (typeof name !== 'string' || !name || /[\\\0:]/.test(name) || name.startsWith('/') || name.length > 4096) throw new Error('Unsafe archive entry name');
  const parts = name.replace(/\/$/, '').split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Unsafe archive entry name');
  return parts.join('/');
}
async function checkedPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('Expected a filesystem path');
  const absolute = path.resolve(value);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Symlink paths are not permitted');
  }
  return absolute;
}
async function readFile(input, limit, signal) {
  const absolute = await checkedPath(input);
  const handle = await fs.open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('Only regular files without hardlinks are permitted');
    if (stat.size > limit) throw new Error('Archive size limit exceeded');
    const buffer = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      check(signal);
      const { bytesRead } = await handle.read(buffer, offset, Math.min(1024 * 1024, buffer.length - offset), offset);
      if (!bytesRead) throw new Error('File changed while reading');
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('File changed while reading');
    return buffer;
  } finally { await handle.close(); }
}
function validateEntries(entries) {
  if (entries.length > ARCHIVE_LIMITS.entries) throw new Error('Archive entry count limit exceeded');
  const names = new Map();
  let totalBytes = 0;
  for (const entry of entries) {
    entry.name = safeName(entry.name);
    if (names.has(entry.name.toLowerCase())) throw new Error('Duplicate archive entry');
    names.set(entry.name.toLowerCase(), entry.type);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > ARCHIVE_LIMITS.entryBytes) throw new Error('Archive entry size limit exceeded');
    totalBytes += entry.size;
    if (totalBytes > ARCHIVE_LIMITS.totalBytes) throw new Error('Archive total size limit exceeded');
  }
  for (const entry of entries) {
    const parts = entry.name.toLowerCase().split('/');
    parts.pop();
    while (parts.length) {
      if (names.get(parts.join('/')) === 'file') throw new Error('Archive file/directory conflict');
      parts.pop();
    }
  }
  return totalBytes;
}
async function collect(stream, limit, signal) {
  const chunks = [];
  let size = 0;
  const abort = () => stream.destroy(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    check(signal);
    for await (const chunk of stream) {
      check(signal);
      size += chunk.length;
      if (size > limit) throw new Error('Archive decompression size limit exceeded');
      chunks.push(chunk);
    }
    check(signal);
    return Buffer.concat(chunks, size);
  } finally {
    signal?.removeEventListener('abort', abort);
    if (!stream.readableEnded) stream.destroy();
  }
}
async function parseZip(buffer, signal) {
  const zip = await new Promise((resolve, reject) => yauzl.fromBuffer(buffer, {
    lazyEntries: true, decodeStrings: false, validateEntrySizes: true, autoClose: false,
  }, (error, archive) => error ? reject(error) : resolve(archive)));
  const entries = [];
  try {
    if (zip.entryCount > ARCHIVE_LIMITS.entries) throw new Error('Archive entry count limit exceeded');
    await new Promise((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', header => {
        try {
          check(signal);
          const flags = header.generalPurposeBitFlag;
          const kind = (header.externalFileAttributes >>> 16) & 0xf000;
          if (flags & ~0x808 || ![0, 8].includes(header.compressionMethod) || ![0, 0x8000, 0x4000].includes(kind)) throw new Error('Unsupported ZIP entry or link');
          if (!(flags & 0x800) && header.fileName.some(byte => byte > 127)) throw new Error('ZIP filename must use UTF-8');
          const rawName = decoder.decode(header.fileName);
          const type = rawName.endsWith('/') || kind === 0x4000 ? 'directory' : 'file';
          const name = safeName(rawName);
          if (type === 'directory' && (header.uncompressedSize || header.compressedSize)) throw new Error('Invalid ZIP directory data');
          entries.push({ name, type, size: header.uncompressedSize, header });
          if (entries.length > ARCHIVE_LIMITS.entries) throw new Error('Archive entry count limit exceeded');
          zip.readEntry();
        } catch (error) { reject(error); }
      });
      zip.readEntry();
    });
    validateEntries(entries);
    for (const entry of entries) {
      check(signal);
      const stream = await new Promise((resolve, reject) => zip.openReadStream(entry.header, (error, readable) => error ? reject(error) : resolve(readable)));
      entry.data = await collect(stream, entry.size, signal);
      if (entry.data.length !== entry.size || crc32(entry.data) !== entry.header.crc32) throw new Error('ZIP CRC32 or size mismatch');
      delete entry.header;
    }
    return entries;
  } finally { zip.close(); }
}
async function parseTar(buffer, signal) {
  const extractor = tar.extract();
  const entries = [];
  let nextOffset = 0;
  let totalBytes = 0;
  const abort = () => extractor.destroy(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await new Promise((resolve, reject) => {
      extractor.on('error', reject);
      extractor.on('finish', resolve);
      extractor.on('entry', (header, stream, next) => {
        stream.on('error', reject);
        try {
          check(signal);
          if (!['file', 'directory'].includes(header.type) || header.linkname) throw new Error('Unsupported TAR entry or link');
          if (header.pax && Object.keys(header.pax).some(key => key !== 'path')) throw new Error('Unsupported TAR extension or link');
          if (header.byteOffset !== nextOffset + 512 && !header.pax) throw new Error('Unsupported TAR extension or link');
          const entry = { name: safeName(header.name), size: header.size, type: header.type };
          if (entry.type === 'directory' && entry.size) throw new Error('Invalid TAR directory data');
          if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > ARCHIVE_LIMITS.entryBytes) throw new Error('Archive entry size limit exceeded');
          totalBytes += entry.size;
          if (totalBytes > ARCHIVE_LIMITS.totalBytes) throw new Error('Archive total size limit exceeded');
          if (entries.length >= ARCHIVE_LIMITS.entries) throw new Error('Archive entry count limit exceeded');
          nextOffset = header.byteOffset + Math.ceil(entry.size / 512) * 512;
          collect(stream, entry.size, signal).then(data => {
            if (data.length !== entry.size) throw new Error('TAR entry size mismatch');
            entry.data = data;
            entries.push(entry);
            next();
          }).catch(error => { reject(error); extractor.destroy(error); });
        } catch (error) { reject(error); extractor.destroy(error); }
      });
      try { check(signal); extractor.end(buffer); } catch (error) { reject(error); }
    });
    if (buffer.length < nextOffset + 1024 || buffer.subarray(nextOffset).some(byte => byte !== 0)) throw new Error('Invalid TAR end records, extension or link');
    return entries;
  } finally {
    signal?.removeEventListener('abort', abort);
    extractor.destroy();
  }
}
async function load(input, format, signal) {
  check(signal);
  const selected = formatOf(format, input);
  const buffer = await readFile(input, ARCHIVE_LIMITS.archiveBytes, signal);
  let entries;
  if (selected === 'zip') entries = await parseZip(buffer, signal);
  else if (selected === 'tar') entries = await parseTar(buffer, signal);
  else {
    const data = await ungzip(buffer, { maxOutputLength: ARCHIVE_LIMITS.entryBytes });
    entries = [{ name: 'content', size: data.length, type: 'file', data }];
  }
  const totalBytes = validateEntries(entries);
  check(signal);
  return { format: selected, entries, totalBytes };
}
function summary(archive) { return { format: archive.format, totalBytes: archive.totalBytes, entries: archive.entries.map(({ name, size, type }) => ({ name, size, type })) }; }
export async function inspectArchive({ input, format, signal } = {}) { return summary(await load(input, format, signal)); }
async function targetPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('Expected output path');
  const target = path.resolve(value);
  await checkedPath(path.dirname(target));
  if (!(await fs.stat(path.dirname(target))).isDirectory()) throw new Error('Output parent must be a directory');
  return target;
}
export async function extractArchive({ input, outputDirectory, format, signal } = {}) {
  const archive = await load(input, format, signal);
  const target = await targetPath(outputDirectory);
  const stage = await fs.mkdtemp(path.join(path.dirname(target), '.santara-extract-'));
  let reserved = false;
  try {
    await fs.chmod(stage, 0o700);
    for (const entry of archive.entries) {
      check(signal);
      const destination = path.join(stage, ...entry.name.split('/'));
      await fs.mkdir(entry.type === 'directory' ? destination : path.dirname(destination), { recursive: true, mode: 0o700 });
      await checkedPath(path.dirname(destination));
      if (entry.type === 'file') await fs.writeFile(destination, entry.data, { flag: 'wx', mode: 0o600, signal });
    }
    check(signal);
    await checkedPath(path.dirname(target));
    await fs.mkdir(target, { mode: 0o700 });
    reserved = true;
    await fs.rename(stage, target);
    reserved = false;
    return { outputDirectory: target, ...summary(archive) };
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
    if (reserved) await fs.rmdir(target);
  }
}
async function gather(inputs, signal) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('inputs must be a nonempty array of filesystem paths');
  const entries = [];
  let total = 0;
  async function visit(input, name) {
    check(signal);
    name = safeName(name);
    const absolute = await checkedPath(input);
    const stat = await fs.lstat(absolute);
    if (stat.isDirectory()) {
      entries.push({ name, type: 'directory', size: 0 });
      if (entries.length > ARCHIVE_LIMITS.entries) throw new Error('Archive entry count limit exceeded');
      for (const child of (await fs.readdir(absolute)).sort()) await visit(path.join(absolute, child), `${name}/${child}`);
    } else {
      const data = await readFile(absolute, ARCHIVE_LIMITS.entryBytes, signal);
      total += data.length;
      if (total > ARCHIVE_LIMITS.totalBytes) throw new Error('Archive total size limit exceeded');
      entries.push({ name, type: 'file', size: data.length, data });
      if (entries.length > ARCHIVE_LIMITS.entries) throw new Error('Archive entry count limit exceeded');
    }
  }
  for (const input of inputs) {
    if (typeof input !== 'string') throw new Error('inputs must contain filesystem paths');
    await visit(input, path.basename(path.resolve(input)));
  }
  validateEntries(entries);
  return entries;
}
async function makeZip(entries, signal) {
  const zip = new yazl.ZipFile();
  zip.on('error', error => zip.outputStream.destroy(error));
  const result = collect(zip.outputStream, ARCHIVE_LIMITS.archiveBytes, signal);
  try {
    for (const entry of entries) {
      check(signal);
      if (entry.type === 'directory') zip.addEmptyDirectory(entry.name, { mode: 0o40700 });
      else zip.addBuffer(entry.data, entry.name, { compress: false, mode: 0o100600 });
    }
    zip.end();
  } catch (error) { zip.outputStream.destroy(error); }
  return result;
}
async function makeTar(entries, signal) {
  const pack = tar.pack();
  const result = collect(pack, ARCHIVE_LIMITS.archiveBytes, signal);
  try {
    for (const entry of entries) {
      check(signal);
      if (Buffer.byteLength(entry.name) > 100) throw new Error('TAR creation requires names of at most 100 UTF-8 bytes');
      const sink = pack.entry({ name: entry.name, type: entry.type, size: entry.size, mode: entry.type === 'directory' ? 0o700 : 0o600, mtime: new Date(0) }, entry.data || Buffer.alloc(0), error => {
        if (error) pack.destroy(error);
      });
      sink.on('error', error => pack.destroy(error));
    }
    pack.finalize();
  } catch (error) { pack.destroy(error); }
  return result;
}
export async function createArchive({ inputs, output, format, signal } = {}) {
  const selected = formatOf(format, output || '');
  const entries = await gather(inputs, signal);
  const target = await targetPath(output);
  let data;
  if (selected === 'zip') data = await makeZip(entries, signal);
  else if (selected === 'tar') data = await makeTar(entries, signal);
  else {
    if (entries.length !== 1 || entries[0].type !== 'file') throw new Error('GZIP requires exactly one regular file');
    data = await compress(entries[0].data);
  }
  if (data.length > ARCHIVE_LIMITS.archiveBytes) throw new Error('Archive size limit exceeded');
  check(signal);
  const stage = await fs.mkdtemp(path.join(path.dirname(target), '.santara-create-'));
  try {
    const temporary = path.join(stage, 'archive');
    await fs.writeFile(temporary, data, { flag: 'wx', mode: 0o600, signal });
    check(signal);
    await checkedPath(path.dirname(target));
    await fs.link(temporary, target);
    return { output: target, ...summary({ format: selected, entries, totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0) }) };
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
}
