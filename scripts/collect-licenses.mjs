import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const sections = ['Santara runtime dependency notices\nGenerated from package-lock.json. Electron ships additional LICENSE and LICENSES.chromium.html notices.\n'];
for (const [location, metadata] of Object.entries(lock.packages).sort(([first], [second]) => first.localeCompare(second))) {
  if (!location || metadata.dev || !location.includes('node_modules/')) continue;
  const directory = path.join(root, location);
  let entries;
  try { entries = await readdir(directory); } catch { continue; }
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  sections.push(`\n${'='.repeat(72)}\n${manifest.name}@${manifest.version}\nDeclared license: ${manifest.license || 'See upstream terms'}\n`);
  let notices = entries.filter(filename => /^(licen[cs]e|copying|notice)(\.|$)/i.test(filename));
  if (!notices.length && manifest.name.startsWith('@img/sharp-libvips-')) {
    notices = entries.filter(filename => ['README.md', 'versions.json'].includes(filename));
    sections.push('Upstream distributes this composite native library with license declarations and component versions below. Generic LGPL/GPL/MPL texts accompany this package. Component-specific source and attribution review remains required before public distribution.\nSource/build recipes: https://github.com/lovell/sharp-libvips\n');
  }
  if (!notices.length) throw new Error(`Missing shipped license text for ${manifest.name}; review before packaging`);
  for (const filename of notices) {
    sections.push(`\n--- ${filename} ---\n${await readFile(path.join(directory, filename), 'utf8')}\n`);
  }
}
for (const filename of await readdir(path.join(root, 'licenses'))) {
  sections.push(`\n--- ${filename} ---\n${await readFile(path.join(root, 'licenses', filename), 'utf8')}\n`);
}
await mkdir(path.join(root, 'build'), { recursive: true });
await writeFile(path.join(root, 'build/THIRD_PARTY_LICENSES.txt'), sections.join('\n'));
console.log('Collected installed production dependency license texts.');
