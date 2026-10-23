import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.join(root, 'native/windows/build/santara-drag-watcher.exe');
const source = path.join(root, 'native/windows/drag_watcher.cpp');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.platform === 'linux' && process.argv.includes('--cross')) {
  const compiler = process.env.WINDOWS_CXX || 'x86_64-w64-mingw32-g++';
  if (!existsSync(path.dirname(executable))) {
    const mkdir = spawnSync('mkdir', ['-p', path.dirname(executable)], { cwd: root, stdio: 'inherit' });
    if (mkdir.error) throw mkdir.error;
    if (mkdir.status !== 0) process.exit(mkdir.status ?? 1);
  }
  run(compiler, [
    '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror', '-mconsole',
    '-static-libgcc', '-static-libstdc++',
    '-DUNICODE', '-D_UNICODE', source, '-o', executable, '-luser32',
  ]);

  const wine = spawnSync('wine', [executable, '--self-test'], {
    cwd: root, stdio: 'inherit', timeout: 30_000,
  });
  if (wine.error) throw wine.error;
  if (wine.status !== 0) process.exit(wine.status ?? 1);
  console.log(`[windows-hook] Cross-built and self-tested ${path.relative(root, executable)}`);
  process.exit(0);
}

if (process.platform !== 'win32') {
  console.log('[windows-hook] Skipped; the native hook is built on Windows.');
  process.exit(0);
}

if (!existsSync(executable) || statSync(source).mtimeMs > statSync(executable).mtimeMs || statSync(path.join(root, 'native/windows/build.ps1')).mtimeMs > statSync(executable).mtimeMs) {
  run('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'native/windows/build.ps1'),
  ], { windowsHide: true });
}
