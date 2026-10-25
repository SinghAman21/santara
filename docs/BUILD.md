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

Install Node.js 22, Rust MSVC, Visual Studio Build Tools with Desktop development with C++, and Windows SDK. In an MSVC x64 Developer PowerShell, run `npm ci`, `npm run test`, `npm run build`, and `npm run dist:windows`. This builds and self-tests the isolated drag watcher before NSIS packaging. The Santara NSIS installer does not embed the WebView2 Runtime. At install time it reuses a registered per-machine or per-user Runtime. If none exists, it asks the user before downloading Microsoft's small Evergreen Bootstrapper, verifies its Microsoft signature, installs WebView2, and continues with Santara only after confirming the Runtime is available. Internet access is needed only for a machine missing WebView2; declining or failing the prerequisite stops Santara installation. The release is unsigned until a reviewed signing setup is supplied.

## Experimental Windows build from Ubuntu

The Windows drag watcher can be cross compiled with the existing MinGW and Wine tools using `npm run build:windows-hook:cross`. A full x64 NSIS cross build completed on this Ubuntu host on 2026-10-25; see the measured artifact in [packaging](TAURI_PACKAGING.md). [Tauri's cross compilation instructions](https://tauri.app/distribute/windows-installer/#cross-compiling-windows-applications-on-linux) call for `lld`, `llvm`, `nsis`, and `cargo-xwin`; `clang` supports C/C++ build scripts. Install the missing system packages yourself with:

```bash
sudo apt update && sudo apt install lld llvm nsis clang
```

Install rustup for your user, add `x86_64-pc-windows-msvc`, and install `cargo-xwin` before trying the Tauri NSIS cross build. This host now has those user-level tools installed. The Ubuntu `rustup` package conflicts with the currently installed system `cargo` and `rustc`, so it is deliberately excluded from the sudo command. A cross built installer still needs native Windows 10/11 testing.

```bash
rustup target add x86_64-pc-windows-msvc
cargo install --locked cargo-xwin
npm run build:windows-hook:cross
npx tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc
```

## Release records

Run `npm run check:release` and, after packaging, `npm run release:report`. The latter writes `build/release-report.json` with actual installer byte counts and SHA-256 hashes and `build/dependency-inventory.json` with npm and Cargo packages. It deliberately leaves installed bytes unset until native installation is measured. Review exact bundled notices, source obligations, platform WebView/media licenses, signatures, installation, removal, and clean-checkout builds before publication. See [packaging](TAURI_PACKAGING.md), [notices](../THIRD_PARTY_NOTICES.md), and the [Phase 8 checklist](TAURI_VALIDATION_CHECKLIST.md).
