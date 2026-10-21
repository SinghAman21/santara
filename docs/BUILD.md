# Build and distribution

## Package contract

The package declares `main: electron/main.mjs` and scripts listed in `package.json`. Vite outputs `dist/` with relative asset URLs (`base: './'`) so Electron can load the production page from disk. The preload is `electron/preload.cjs`; both files are packaged by `electron/**`. Linux explicitly sets `maintainer: Santara contributors`, which the installed Electron Builder accepts without an author email. Use a real maintainer contact before public Debian distribution. A project homepage or repository is separately required; no contact address or project URL is invented here.

`electron-builder.yml` sets `io.santara.app`, product name Santara, ASAR, and application files `dist/**`, `electron/**`, `package.json`, `LICENSE`, and `THIRD_PARTY_NOTICES.md`. Electron Builder may additionally include production npm dependencies and Electron runtime resources. Keep build-only tools in devDependencies and audit the final archive. Optional engines must resolve from the user's system, never `extraResources` or an embedded download.

`npm run dist` runs the frontend build, then `npm run licenses`, then Electron Builder. The parent's `scripts/collect-licenses.mjs` reads the committed lockfile and actual installed production packages, records their versions and declared licenses, and collects shipped license/notice texts into `build/THIRD_PARTY_LICENSES.txt`. An inspected package without a matching text fails collection. `extraResources` copies this generated inventory to `licenses/THIRD_PARTY_LICENSES.txt` under the packaged resources directory, outside ASAR. This is notice text, not a bundled conversion executable. Retain Electron's separate shipped `LICENSE` and `LICENSES.chromium.html`; the generated npm inventory does not replace them. Direct Electron Builder invocation requires first generating the inventory yourself.

## Local build

1. Install Node.js 22 and npm, then `npm ci` using the committed lockfile.
2. Run `npm run typecheck`, `npm run test`, and `npm run build`.
3. Run browser tests as described in [TESTING.md](TESTING.md).
4. On Windows 10/11 x64, install Visual Studio Build Tools with the Desktop development with C++ workload and Windows SDK. Initialize the MSVC x64 environment, then run `npm run dist:windows`. This builds the drag-watcher helper and NSIS `.exe` installer. On Ubuntu x64, install Wine and MinGW-w64 (`sudo apt install wine g++-mingw-w64-x86-64`) and run the same command to cross-compile the helper and create the NSIS installer.
5. On Linux x64, run `npm run dist:linux`; if package metadata lacks a homepage/repository, append `--config.extraMetadata.homepage=YOUR_REAL_PROJECT_URL` to the underlying Electron Builder command with your actual URL.

Native builds are preferred. CI runs the Windows NSIS build on Windows and Linux `deb`/`AppImage` builds on Ubuntu 22.04. Windows CI uses MSVC; Linux cross-builds use MinGW-w64 for the watcher and Wine for NSIS tooling. Linux installation runtime libraries and AppImage/FUSE compatibility still require clean-machine testing.

Windows installs by running `release/Santara-<version>-win-x64.exe`; uninstall through Windows Settings → Apps → Installed apps. Debian/Ubuntu installs with `sudo apt install ./release/Santara-*.deb` and uninstalls with `sudo apt remove santara`. Run an AppImage with `chmod +x release/Santara-*.AppImage && ./release/Santara-*.AppImage`; removing the AppImage file uninstalls the portable application.

After building, run `node scripts/check-release.mjs` to check required package fields, scripts, and release input paths. This is a preflight check, not an archive audit or installer test.

Run `npm run icons` after installing Playwright Chromium and before packaging. The parent's `scripts/generate-icons.mjs` renders Santara's original SVG into `build/icon.png` and `build/icon.ico`; Linux and Windows reference these generated files. Icon generation uses Playwright; Sharp is a separate application runtime dependency. CI generates icons after browser installation. Linux sets `syncDesktopName: true` for the package's `santara.desktop` identity. File associations are deliberately omitted: no extensions are claimed until the engine supports them and users can opt in.

The preceding icon workflow uses Playwright rather than Sharp; the application itself now has a direct Sharp runtime dependency for built-in raster processing. `asarUnpack` explicitly unpacks `sharp` and `@img` packages so native shared libraries remain available outside ASAR. This follows [Sharp's Electron packaging guidance](https://sharp.pixelplumbing.com/install/#electron). Verify native loading and interface-compatible library replacement in the installed Windows and Linux applications; unpacking alone is not LGPL compliance certification. Preserve component versions, notices, and corresponding-source directions described in [third-party notices](../THIRD_PARTY_NOTICES.md).

The updated collector includes upstream README/license declarations and `versions.json` for composite `@img/sharp-libvips` packages, plus full LGPL-3.0, GPL-3.0, and MPL-1.1 texts from `licenses/`. The parent reports successful collection for all installed production packages. Full component-specific source and attribution review remains a public-release blocker; neither the successful collector nor a generated installer resolves that review.

Final build update, 2026-10-20: the parent reports Sharp-integrated Linux deb (~112 MB) and AppImage (~142 MB) artifacts built successfully, superseding earlier missing-homepage failures and pre-Sharp sizes. Final packaged smoke is being retried sequentially after a clipboard race between concurrent test runners. AppImage portability/extract-and-run and clean-machine installer acceptance are separate checks; their final results will be appended by the parent. The reserved release homepage remains development metadata requiring replacement before public distribution.

The subsequent native smoke passed against `release/linux-unpacked/santara`, and the release-input checker passed. AppImage extract-and-run smoke is now running sequentially with `APPIMAGE_EXTRACT_AND_RUN=1`; its result and artifact SHA256 values remain owned by the parent's validation record. Unpacked executable smoke is distinct from deb installation/uninstallation and AppImage execution.

The current package homepage `https://example.invalid/santara` is an explicitly reserved, nonresolving development placeholder. It supplies required packaging metadata without inventing a project identity. Replace it with the real project URL before any public release. CI overrides it with the actual current repository URL. The initial local AppImage build completed, while the initial deb build failed for missing homepage; the parent's final packaging rerun is pending and must be recorded separately.

## CI and Windows signing

`.github/workflows/build.yml` runs `npm ci`, typecheck, unit tests, frontend build, Chromium browser tests, and per-OS packaging, then uploads installer artifacts. Linux CI installs FFmpeg, Poppler, and qpdf to exercise optional integration tests; those system tools are not bundled. Linux packaging supplies the actual GitHub repository URL through `extraMetadata.homepage`. It does not publish releases, launch AppImages, or attest that installers have been executed. AppImage build-only checks do not require launching FUSE.

Ordinary pushes and PRs build unsigned installers without signing secrets. To request signing, a repository maintainer manually dispatches the workflow with `signed: true` on a reviewed trusted ref and configures:

- `WINDOWS_CSC_LINK`: Electron Builder-compatible certificate source, typically a base64-encoded PFX.
- `WINDOWS_CSC_KEY_PASSWORD`: certificate password.

The signing step passes `forceCodeSigning=true`; absent or unusable credentials must fail instead of producing an unsigned artifact labeled signed. Keep certificates out of the repository, logs, and artifacts. Hardware-backed/cloud signing providers may require a different signing integration; the PFX scaffold is not a guarantee that a certificate authority permits exportable keys. Confirm current provider requirements and protect workflow dispatch permissions.

Signed Windows executables still need certificate-chain, timestamp, installer-signature, and clean-machine verification. Signing does not guarantee SmartScreen reputation. Unsigned installers may show publisher warnings or be blocked by policy. Do not tell users to disable security controls. Linux artifacts are not cryptographically signed by this workflow; publish reviewed hashes and a separately managed signing policy before public distribution.

Configuration references: [targets](https://www.electron.build/cli), [code signing](https://www.electron.build/code-signing), [icons](https://www.electron.build/icons).
