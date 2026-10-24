# Santara

Santara is a local, offline-first desktop file tool for Windows 10/11 x64 and Ubuntu LTS x64. The `tauri-rt` branch uses Tauri 2 with a React/Vite interface and Rust processing services. It is a migration preview: native Windows and Ubuntu acceptance remains in [Phase 8](docs/TAURI_VALIDATION_CHECKLIST.md). macOS is unsupported.

During a drag, double-tap Shift for conversion, Alt (or configured Ctrl+Shift) for tools, or Ctrl for file actions. Single modifier presses leave the wheel closed. Shortcuts are configurable. The workspace remains available for settings, queue, history, and keyboard access. Image, subtitle, and ZIP/TAR/GZIP operations run locally in Rust. FFmpeg/FFprobe, Poppler, qpdf, Pandoc, LibreOffice, and ExifTool routes appear only when their local capabilities are detected. Some formats and metadata workflows from the previous implementation are still incomplete; see the [parity matrix](docs/TAURI_PARITY_MATRIX.md).

## Development

Install Node.js 22, npm, Rust, and the platform development dependencies in [build instructions](docs/BUILD.md). On Ubuntu, the required build packages can be installed in one command:

```bash
sudo apt update && sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev libgtk-3-dev librsvg2-dev libssl-dev patchelf
```

The sudo command is for you to run; Santara does not install system packages. Then:

```bash
npm ci
npm run typecheck
npm run test
npm run build
npm run desktop
```

`npm run dev` starts a browser-only UI preview without local file access. `npm run test:e2e` runs its Playwright tests after installing Chromium with `npx playwright install chromium`.

## Packages

Run `npm run dist:linux` on Ubuntu LTS x64 for `.deb` and AppImage, or `npm run dist:windows` in an MSVC x64 Developer PowerShell for NSIS. `npm run check:release` checks source package inputs. `npm run release:report` records actual artifact bytes and SHA-256 plus the npm/Cargo dependency inventory after packages exist. Installer execution, uninstall, installed bytes, real file-manager drags, and offline behavior are Phase 8 checks, not claims from a successful build.

Santara never uploads files, creates accounts, or enables telemetry. Optional engines are separate system installations. See [capabilities](docs/CAPABILITIES.md), [architecture](docs/ARCHITECTURE.md), [packaging](docs/TAURI_PACKAGING.md), and [third-party notices](THIRD_PARTY_NOTICES.md).
