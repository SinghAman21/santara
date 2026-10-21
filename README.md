# Santara

Santara is a desktop file-conversion workspace being developed for Windows x64 and Linux x64. It uses a React/Vite interface and an Electron host. Feature availability depends on the implemented engine and locally installed optional tools; a visible option is not evidence that a conversion works.

The application includes a local queue, detected capability registry, native bridge, settings, and accessible file-operation picker. It remains a development preview. No signed installer, universal format support, or production readiness is claimed here.

Raster conversion is bundled through Sharp/libvips, so JPG/PNG workflows do not require a separately installed image engine. Built-in subtitle and constrained ZIP/TAR/GZ processing are also available. FFmpeg, ImageMagick, qpdf, Poppler, and Pandoc remain optional system tools for their detected routes. See the [implementation status and next steps](docs/ROADMAP.md) for supported, partial, disabled, and unsupported capabilities.

## Development

Install Node.js 22 and npm, then run `npm ci`, `npm run typecheck`, `npm run test`, and `npm run build`. Run `npm run desktop` for Electron or `npm run dev` for the restricted browser preview. Project status and remaining production requirements are in the [roadmap](docs/ROADMAP.md).

Run `npx playwright install --with-deps chromium` once, then `npx playwright test` for browser smoke tests. These use the Vite preview and a mock preload bridge, not a live Electron process. See [testing](docs/TESTING.md).


## Packaging

`npm run dist` builds for the current host OS: on Windows 10/11 x64 it creates the NSIS `.exe`; on Linux x64 it creates the `.deb` and AppImage. Use Node.js 22 and npm. On Windows, install Visual Studio Build Tools with the **Desktop development with C++** workload and Windows SDK so Santara can build its native drag watcher. From the repository root, install dependencies and generate the app icons once:

```bash
npm ci
npx playwright install chromium
npm run icons
```

On Ubuntu/Debian x64, build both Linux packages:

```bash
npm run dist:linux
```

On Windows 10/11 x64, build the NSIS installer executable:

Open **Developer PowerShell for Visual Studio (x64)** first, so the MSVC compiler is available, then run:

```powershell
npm ci
npx playwright install chromium
npm run icons
npm run dist:windows
```

The Windows build compiles and bundles `santara-drag-watcher.exe`; the installer is written to `release/` as `Santara-<version>-win-x64.exe`. Linux builds produce a `.deb` and `.AppImage` in `release/`. Builds are unsigned by default; the Windows installer may show a publisher warning. Do not disable SmartScreen. Signing is configured separately for trusted CI runs; see [build and signing](docs/BUILD.md).

On Ubuntu, `npm run dist:windows` cross-builds the watcher with MinGW-w64 and packages the Windows NSIS installer with Wine. Install the prerequisites with `sudo apt update && sudo apt install wine g++-mingw-w64-x86-64`, then run `npm run dist:windows`. If your Wine setup cannot run the NSIS tools, build natively on Windows or download the Windows CI artifact. Plain `npm run dist` builds packages for the current OS.

### Install on Linux

Install the Debian package (use the single matching package in `release/`):

```bash
sudo apt install ./release/Santara-*.deb
```

Launch Santara from the desktop app menu or by running `santara`. To uninstall, run `sudo apt remove santara`.

Run the portable AppImage without installing it:

```bash
chmod +x release/Santara-*.AppImage
./release/Santara-*.AppImage
```

If the AppImage reports a missing FUSE runtime, install the FUSE compatibility package provided by your distribution. To remove it, delete the AppImage file; per-user settings are separate from the AppImage.

### Install on Windows

Double-click `release/Santara-<version>-win-x64.exe` and follow the installer. Santara appears in the Start menu. To uninstall, use **Settings → Apps → Installed apps → Santara → Uninstall**. An unsigned build may receive a Windows publisher warning; install only builds from a source you trust.

See [build and signing](docs/BUILD.md), [architecture](docs/ARCHITECTURE.md), [capabilities and public sources](docs/CAPABILITIES.md), [image-wheel architecture](docs/IMAGE_WHEEL_ARCHITECTURE.md), and [roadmap](docs/ROADMAP.md).

Santara has no affiliation with Tangerine. Public product research informs requirements, not a claim of implementation parity. Original Santara code is offered under [MIT](LICENSE); dependency obligations are separate and tracked in [third-party notices](THIRD_PARTY_NOTICES.md).

`npm run licenses` generates the installed production dependency/license inventory at `build/THIRD_PARTY_LICENSES.txt`. Packaging runs it automatically and includes the text in `resources/licenses/THIRD_PARTY_LICENSES.txt`, supplementing Santara's notices and Electron's shipped license files.

Linux `.deb` and `.AppImage` builds have been exercised. Windows NSIS packaging runs on the native Windows CI runner; Windows signing, clean-machine installation, and remaining feature/release requirements are not complete; see the [roadmap](docs/ROADMAP.md).
