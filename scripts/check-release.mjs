import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const tauri = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const linux = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.linux.conf.json'), 'utf8'));
const windows = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.windows.conf.json'), 'utf8'));
const failures = [];
if (metadata.main || metadata.dependencies?.electron || metadata.devDependencies?.electron || metadata.devDependencies?.['electron-builder']) failures.push('Electron runtime or packaging remains');
if (tauri.identifier !== 'io.santra.app' || tauri.productName !== 'Santra' || tauri.mainBinaryName !== 'santra') failures.push('Tauri package identity differs from Santra');
if (!['deb', 'appimage'].every(bundle => linux.bundle.targets.includes(bundle))) failures.push('Linux bundles are incomplete');
if (!windows.bundle.targets.includes('nsis')) failures.push('Windows NSIS bundle is missing');
if (JSON.stringify(tauri).toLowerCase().includes('dmg') || JSON.stringify(tauri).toLowerCase().includes('macos')) failures.push('Unsupported macOS packaging found');
for (const filename of ['dist/index.html', 'build/icon.png', 'build/icon.ico', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  try { await access(path.join(root, filename)); } catch { failures.push(`Missing ${filename}`); }
}
if (failures.length) throw new Error(failures.join('\n'));
console.log('Tauri release inputs and Windows/Linux bundle configuration are present. Native acceptance remains in Phase 8.');
