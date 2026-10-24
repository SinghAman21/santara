# Build and distribution

Santara's sole desktop runtime on `tauri-rt` is Tauri 2. `npm run build` produces the React/Vite renderer; `npm run dist` builds the current host's Tauri package. Builds target Windows x64 and Linux x64 only. The package identity is `io.santara.app`, executable `santara`.

## Ubuntu LTS x64

Install the Tauri build dependencies yourself:

```bash
sudo apt update && sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev libgtk-3-dev librsvg2-dev libssl-dev patchelf
```

For optional media, document, metadata, and headless checks, install the tools you intend to test:

```bash
sudo apt install ffmpeg poppler-utils qpdf pandoc libreoffice libimage-exiftool-perl xvfb xauth
```

These optional tools are not downloaded or bundled by Santara. Run `npm ci`, `npm run test`, `npm run build`, then `npm run dist:linux`. The `.deb` relies on system GTK/WebKitGTK packages. The AppImage requests bundled media framework components; verify its actual portability and licenses on a clean Ubuntu LTS system.

## Windows 10/11 x64

Install Node.js 22, Rust MSVC, Visual Studio Build Tools with Desktop development with C++, and Windows SDK. In an MSVC x64 Developer PowerShell, run `npm ci`, `npm run test`, `npm run build`, and `npm run dist:windows`. This builds and self-tests the isolated drag watcher before NSIS packaging. The NSIS configuration embeds a WebView2 offline installer; check actual offline installation and package size on both Windows versions. The release is unsigned until a reviewed signing setup is supplied.

## Release records

Run `npm run check:release` and, after packaging, `npm run release:report`. The latter writes `build/release-report.json` with actual installer byte counts and SHA-256 hashes and `build/dependency-inventory.json` with npm and Cargo packages. It deliberately leaves installed bytes unset until native installation is measured. Review exact bundled notices, source obligations, platform WebView/media licenses, signatures, installation, removal, and clean-checkout builds before publication. See [packaging](TAURI_PACKAGING.md), [notices](../THIRD_PARTY_NOTICES.md), and the [Phase 8 checklist](TAURI_VALIDATION_CHECKLIST.md).
