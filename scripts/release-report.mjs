import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundles = [
  path.join(root, 'src-tauri/target/release/bundle'),
  path.join(root, 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle'),
];
const packages = [];
async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
for (const bundle of bundles) {
  for (const [folder, extension] of [['nsis', '.exe'], ['deb', '.deb'], ['appimage', '.AppImage']]) {
    let names = [];
    try { names = await readdir(path.join(bundle, folder)); } catch {}
    for (const name of names.filter(value => value.startsWith('Santra_') && value.endsWith(extension))) {
      const filename = path.join(bundle, folder, name);
      packages.push({ file: path.relative(root, filename), installerBytes: (await stat(filename)).size,
        sha256: await sha256(filename),
        installedBytes: null, installValidation: 'Phase 8 pending' });
    }
  }
}
if (!packages.length) throw new Error('No Tauri installer artifacts found');
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const npm = Object.entries(lock.packages || {}).filter(([name, entry]) => name && !entry.dev)
  .map(([name, entry]) => ({ name: name.replace(/^.*node_modules\//, ''), version: entry.version, license: entry.license || null }));
const result = spawnSync('cargo', ['metadata', '--locked', '--format-version', '1'], { cwd: path.join(root, 'src-tauri'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (result.status !== 0) throw new Error(`Cargo dependency inventory failed: ${result.stderr.slice(0, 1000)}`);
const rust = JSON.parse(result.stdout).packages.map(({ name, version, license, source }) => ({ name, version, license: license || null, source: source || 'local' }));
await mkdir(path.join(root, 'build'), { recursive: true });
await writeFile(path.join(root, 'build/release-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), packages }, null, 2));
await writeFile(path.join(root, 'build/dependency-inventory.json'), JSON.stringify({ generatedAt: new Date().toISOString(), npm, rust }, null, 2));
console.log(`Recorded ${packages.length} actual installer size(s) and SHA-256 hashes; installed sizes await Phase 8.`);
