import { spawnSync } from 'node:child_process';

if (process.platform === 'win32') process.exit(0);

const missing = [];
const wine = spawnSync('wine', ['--version'], { encoding: 'utf8', timeout: 10_000 });
if (wine.error?.code === 'ENOENT') missing.push('Wine');
else if (wine.error || wine.status !== 0) {
  console.error(`Wine is installed but unavailable (${wine.error?.message || wine.stderr || `exit ${wine.status}`}). Fix Wine, or build on Windows.`);
  process.exit(1);
}

const compiler = process.env.WINDOWS_CXX || 'x86_64-w64-mingw32-g++';
const compilerCheck = spawnSync(compiler, ['--version'], { encoding: 'utf8', timeout: 10_000 });
if (compilerCheck.error?.code === 'ENOENT') missing.push('MinGW-w64 x64 C++ compiler');
else if (compilerCheck.error || compilerCheck.status !== 0) {
  console.error(`Windows cross-compiler is installed but unavailable (${compilerCheck.error?.message || compilerCheck.stderr || `exit ${compilerCheck.status}`}).`);
  process.exit(1);
}

if (missing.length) {
  console.error(`Windows cross-build prerequisites missing: ${missing.join(', ')}.`);
  console.error('On Ubuntu, install them with: sudo apt update && sudo apt install wine g++-mingw-w64-x86-64');
  console.error('Then run: npm run dist:windows. Plain npm run dist builds for the current OS.');
  process.exit(1);
}
