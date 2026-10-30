import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.platform === 'linux') {
  run('node', ['scripts/build-windows-hook.mjs', '--cross']);
  run('npx', ['tauri', 'build', '--bundles', 'nsis', '--runner', 'cargo-xwin', '--target', 'x86_64-pc-windows-msvc']);
} else if (process.platform === 'win32') {
  run('npm', ['run', 'tauri:dist:windows']);
} else {
  console.error('Windows installer builds are supported from Linux and Windows hosts.');
  process.exit(1);
}
