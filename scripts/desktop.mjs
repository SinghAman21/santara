import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];
let stopping = false;
let startupTimer;
let forceTimer;

function probePort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      const selected = server.address().port;
      server.close((error) => error ? reject(error) : resolve(selected));
    });
  });
}

function signalChild(child, signal) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    killer.on('error', () => child.kill(signal));
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') console.error(`[desktop] Could not stop child ${child.pid}: ${error.message}`);
  }
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  clearTimeout(startupTimer);
  for (const { child } of children) signalChild(child, 'SIGTERM');
  forceTimer = setTimeout(() => {
    for (const { child } of children) signalChild(child, 'SIGKILL');
  }, 5000);
  forceTimer.unref();
}

function startChild(name, executable, args, options = {}) {
  const child = spawn(executable, args, {
    cwd: root,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  const entry = { child, closed: false };
  children.push(entry);
  child.on('error', (error) => {
    console.error(`[desktop] ${name} could not start: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    if (name === 'Vite' || code !== 0) {
      console.error(`[desktop] ${name} exited (${signal || code}).`);
    }
    stop(name === 'Electron' && code === 0 ? 0 : 1);
  });
  child.on('close', () => {
    entry.closed = true;
    if (children.every((record) => record.closed)) clearTimeout(forceTimer);
  });
  return child;
}

function startElectron(executable, url) {
  const environment = { ...process.env, SANTARA_DEV_URL: url };
  delete environment.ELECTRON_RUN_AS_NODE;
  const args = process.platform === 'linux' ? ['--ozone-platform=x11', root] : [root];
  const electron = startChild('Electron', executable, args, { env: environment, stdio: ['ignore', 'inherit', 'pipe'] });
  let diagnostics = '';
  let sandboxReported = false;
  electron.stderr.setEncoding('utf8');
  electron.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    diagnostics = (diagnostics + stripVTControlCharacters(chunk)).slice(-8192);
    if (!sandboxReported && /chrome-sandbox|SUID sandbox|No usable sandbox|Running as root without --no-sandbox|Failed to move to new namespace|Failed to unshare/i.test(diagnostics)) {
      sandboxReported = true;
      console.error('[desktop] Electron sandbox startup failed. Run as a regular user with OS support for Chromium sandboxing (user namespaces or a correctly installed chrome-sandbox helper).');
    }
  });
}

process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));

try {
  let port;
  try {
    port = await probePort(5173);
  } catch (error) {
    if (!['EADDRINUSE', 'EACCES'].includes(error.code)) throw error;
    port = await probePort(0);
  }
  if (!stopping) {
    const url = `http://127.0.0.1:${port}`;
    const viteBin = path.resolve(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
    const electronBin = require('electron');
    console.log(`[desktop] Starting Vite at ${url}`);
    const vite = startChild('Vite', process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--clearScreen', 'false']);
    let output = '';
    let ready = false;
    startupTimer = setTimeout(() => {
      console.error('[desktop] Vite did not report its local URL within 60 seconds.');
      stop(1);
    }, 60000);
    vite.stdout.setEncoding('utf8');
    vite.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      output = stripVTControlCharacters(output + chunk).slice(-8192);
      const localURL = output.match(/\bLocal:\s+(http:\/\/127\.0\.0\.1:\d+)\//)?.[1];
      if (!ready && !stopping && vite.exitCode === null && vite.signalCode === null && localURL === url) {
        ready = true;
        clearTimeout(startupTimer);
        startElectron(electronBin, url);
      }
    });
    vite.stderr.pipe(process.stderr);
  }
} catch (error) {
  console.error(`[desktop] ${error.message}`);
  stop(1);
}
