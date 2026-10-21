import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argumentsPassed = process.argv.slice(2);
const requestedWindows = argumentsPassed.includes('--win');
const requestedLinux = argumentsPassed.includes('--linux');
const target = requestedWindows ? 'win32' : requestedLinux ? 'linux' : process.platform;
const platformFlag = target === 'win32' ? '--win' : '--linux';
const expectedModule = target === 'win32' ? 'sharp-win32-x64' : 'sharp-linux-x64';
const expectedLibraryPackage = target === 'win32' ? expectedModule : 'sharp-libvips-linux-x64';

if (requestedWindows && requestedLinux) throw new Error('Choose one packaging platform');
if (!['win32', 'linux'].includes(target)) throw new Error('Santara packages only Windows and Linux');
if (argumentsPassed.some(argument => ['--arm64', '--ia32', '--arm'].includes(argument))) {
  throw new Error('This release supports x64 only');
}
if (argumentsPassed.some(argument => argument.startsWith('--config.directories.app'))) {
  throw new Error('The package staging directory is managed by Santara');
}

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
}

async function requiredFile(filename) {
  try {
    if (!(await stat(filename)).isFile()) throw new Error('not a file');
  } catch {
    throw new Error(`Required package file missing: ${filename}`);
  }
}

async function keepTargetSharp(directory) {
  const imageModules = path.join(directory, 'node_modules/@img');
  for (const name of await readdir(imageModules)) {
    if (name.startsWith('sharp-') && name !== expectedModule && name !== expectedLibraryPackage) {
      await rm(path.join(imageModules, name), { recursive: true, force: true });
    }
  }
}

async function checkSharp(directory, packaged) {
  const moduleRoot = path.join(directory, 'node_modules');
  const sharpManifest = JSON.parse(await readFile(path.join(moduleRoot, 'sharp/package.json'), 'utf8'));
  const nativePackage = path.join(moduleRoot, '@img', expectedModule);
  const nativeManifest = JSON.parse(await readFile(path.join(nativePackage, 'package.json'), 'utf8'));
  if (sharpManifest.version !== nativeManifest.version) {
    throw new Error(`Sharp version mismatch: ${sharpManifest.version} and ${nativeManifest.version}`);
  }
  await requiredFile(path.join(nativePackage, 'lib', `${expectedModule}-${sharpManifest.version}.node`));
  const libraryFiles = await readdir(path.join(moduleRoot, '@img', expectedLibraryPackage, 'lib'));
  const libraryName = target === 'win32' ? 'libvips-42.dll' : libraryFiles.find(name => /^libvips-cpp\.so\./.test(name));
  if (!libraryName) throw new Error(`Sharp native library is missing for ${target} x64`);
  await requiredFile(path.join(moduleRoot, '@img', expectedLibraryPackage, 'lib', libraryName));
  if (target === 'win32') {
    const cppLibrary = libraryFiles.find(name => /^libvips-cpp-.*\.dll$/.test(name));
    if (!cppLibrary) throw new Error('Sharp Windows C++ library is missing');
    await requiredFile(path.join(moduleRoot, '@img', expectedLibraryPackage, 'lib', cppLibrary));
  }
  const siblings = await readdir(path.join(moduleRoot, '@img'));
  const incompatible = siblings.filter(name => name.startsWith('sharp-') && name !== expectedModule && name !== expectedLibraryPackage);
  if (incompatible.length) throw new Error(`Wrong-platform Sharp packages included: ${incompatible.join(', ')}`);
  console.log(`[package] Verified ${target} x64 Sharp ${sharpManifest.version}${packaged ? ' in packaged app' : ' in staged app'}`);
}

async function npmCli(temporaryDirectory) {
  const currentCli = process.env.npm_execpath;
  if (!currentCli) throw new Error('Run packaging through npm so its CLI version can be checked');
  const version = spawnSync(process.execPath, [currentCli, '--version'], { encoding: 'utf8' });
  if (version.error || version.status !== 0) throw new Error('Could not check npm version');
  if (Number.parseInt(version.stdout, 10) >= 10) return currentCli;
  const tooling = path.join(temporaryDirectory, 'tooling');
  run(process.execPath, [currentCli, 'install', '--prefix', tooling, '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', 'npm@10.9.9'], 'npm 10 bootstrap');
  return path.join(tooling, 'node_modules/npm/bin/npm-cli.js');
}

async function main() {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), `santara-${target}-x64-`));
  const appDirectory = path.join(temporaryDirectory, 'app');
  try {
    run(process.execPath, [process.env.npm_execpath, 'run', 'icons'], 'Icon generation');
    run(process.execPath, [process.env.npm_execpath, 'run', 'build'], 'App build');
    if (target === 'win32') {
      if (process.platform === 'linux') {
        run(process.execPath, [path.join(root, 'scripts/check-windows-packager.mjs')], 'Windows cross-build preflight');
        run(process.execPath, [path.join(root, 'scripts/build-windows-hook.mjs'), '--cross'], 'Windows watcher cross-build');
      } else {
        run(process.execPath, [path.join(root, 'scripts/build-windows-hook.mjs')], 'Windows watcher build');
      }
    }
    const packageManager = await npmCli(temporaryDirectory);
    await mkdir(appDirectory);
    for (const filename of ['package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'dist', 'electron']) {
      await cp(path.join(root, filename), path.join(appDirectory, filename), { recursive: true });
    }
    const targetOptions = ['--os', target, '--cpu', 'x64'];
    if (target === 'linux') targetOptions.push('--libc', 'glibc');
    run(process.execPath, [packageManager, 'ci', '--prefix', appDirectory, '--omit=dev', '--include=optional', '--ignore-scripts', '--no-audit', '--no-fund', ...targetOptions], 'Target dependency install');
    await keepTargetSharp(appDirectory);
    await checkSharp(appDirectory, false);
    run(process.execPath, [path.join(root, 'scripts/collect-licenses.mjs'), `--app-dir=${appDirectory}`], 'License collection');
    const builderArguments = ['--config', path.join(root, 'electron-builder.yml'), `--config.directories.app=${appDirectory}`, ...argumentsPassed];
    if (!requestedWindows && !requestedLinux) builderArguments.push(platformFlag);
    if (!argumentsPassed.includes('--x64')) builderArguments.push('--x64');
    run(process.execPath, [path.join(root, 'node_modules/electron-builder/cli.js'), ...builderArguments], 'Electron packaging');

    const outputArgument = argumentsPassed.find(argument => argument.startsWith('--config.directories.output='));
    const outputDirectory = outputArgument ? path.resolve(root, outputArgument.slice('--config.directories.output='.length)) : path.join(root, 'release');
    const unpackedDirectory = path.join(outputDirectory, target === 'win32' ? 'win-unpacked' : 'linux-unpacked');
    await checkSharp(path.join(unpackedDirectory, 'resources/app.asar.unpacked'), true);
    if (target === 'win32') await requiredFile(path.join(unpackedDirectory, 'resources/native/santara-drag-watcher.exe'));
    if (!argumentsPassed.includes('--dir')) {
      const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
      const artifacts = target === 'win32'
        ? [`Santara-${version}-win-x64.exe`]
        : [`Santara-${version}-linux-amd64.deb`, `Santara-${version}-linux-x86_64.AppImage`];
      for (const filename of artifacts) await requiredFile(path.join(outputDirectory, filename));
      console.log(`[package] Verified ${artifacts.join(' and ')}`);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
