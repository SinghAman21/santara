import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const failures = [];

for (const field of ['version', 'description', 'license']) {
  if (!metadata[field]) failures.push(`Missing package field: ${field}`);
}
if (metadata.main !== 'electron/main.mjs') failures.push('main must be electron/main.mjs');
const author = metadata.author;
const email = typeof author === 'object' ? author?.email : author?.match(/<([^>]+)>/)?.[1];
const buildConfig = await readFile(path.join(root, 'electron-builder.yml'), 'utf8');
if (!email && !/^  maintainer: .+$/m.test(buildConfig)) failures.push('Set linux.maintainer or a real author email for Debian metadata');
if (!metadata.homepage && !metadata.repository && !process.env.SANTARA_HOMEPAGE) failures.push('Set package homepage/repository or SANTARA_HOMEPAGE for the Debian project URL');
for (const name of ['typecheck', 'test', 'build', 'preview', 'dist']) {
  if (!metadata.scripts?.[name]) failures.push(`Missing npm script: ${name}`);
}
for (const filename of ['dist/index.html', 'electron/main.mjs', 'electron/preload.cjs', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  try {
    await access(path.join(root, filename));
  } catch {
    failures.push(`Missing release input: ${filename}`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Release input contract passed; signing, licenses, engines, and installed artifacts still require review.');
}
