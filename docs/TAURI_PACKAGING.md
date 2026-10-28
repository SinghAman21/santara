# Tauri packaging work in progress

The Tauri package identity is `io.santra.app`, with executable name `santra`. Windows and Ubuntu x64 are the only supported release targets. The commands below are build inputs, not evidence that installation or feature parity has passed.

## Build commands

On Ubuntu LTS x64, run `npm run dist:linux` to request `.deb` and AppImage artifacts. GTK 3, WebKitGTK 4.1, Ayatana AppIndicator, and normal Tauri native build dependencies must be present. `patchelf`, libvips development files, and `xvfb` are now available on this host; Santra did not install them. The current Rust raster backend does not link to libvips. The user handles any further sudo package installation.

On a Windows 10/11 x64 MSVC build host, run `npm run dist:windows`. The command builds and self-tests the isolated `native/windows/` drag watcher when its source has changed, then includes it as a Tauri resource under `native/`. The Tauri host starts only that fixed local helper path. A missing helper leaves the workspace and direct file drops usable, but the global Windows wheel trigger is unavailable.

The Windows NSIS installer uses `webviewInstallMode: skip`, with a preinstall hook that checks the per-machine and per-user Evergreen Runtime registry entries. If none exists, setup asks permission, downloads Microsoft's small Evergreen Bootstrapper over HTTPS, checks its Authenticode signature, installs WebView2, and continues only after verifying the Runtime. Declining, network failure, or installation failure stops Santra setup. Users with an existing Runtime skip the download. This preserves the shared system runtime without bundling its offline installer. The previous 222,176,073-byte result below is the historical offlineInstaller build. Linux AppImage is configured to bundle the media framework for local video and audio preview. [Tauri's AppImage guidance](https://tauri.app/distribute/appimage/) estimates an additional 15–35 MB for this setting; the actual Santra size and GStreamer plugin licenses remain to be audited. `.deb` depends on installed GTK/WebKitGTK system packages. AppImage portability and system-library requirements need a clean Ubuntu LTS check.

## Final measurements and review

For each final artifact, record bytes, SHA-256, native install/uninstall/launch result, and the installed footprint from the package manager or installation directory. Keep installer bytes separate from installed bytes. Record the downloaded WebView2 Bootstrapper and GStreamer/license inventory. Shell-only prototype sizes are in `TAURI_SHELL_VALIDATION.md`; they are not final release sizes. See `TAURI_VALIDATION_CHECKLIST.md` for the Phase 8 gate.

### Interim Ubuntu code build, 2026-10-24

`npx tauri build --bundles deb` succeeded on the local Ubuntu x64 host. The generated `Santra_0.1.0_amd64.deb` is **8,909,118 bytes** (SHA-256 `e4171c14a8b68d86660be591b43e4ac42ad48dea54e338e8bc87130b0943a639`). Its extracted regular files total **24,826,277 bytes**; Debian metadata reports `Installed-Size: 24280` KiB. These are actual artifact and extracted-payload measurements for the **interim code build**. They are not an installed footprint or final release measurement. The package declares `libayatana-appindicator3-1`, `libwebkit2gtk-4.1-0`, and `libgtk-3-0` dependencies. AppImage and NSIS artifacts, native installation, and measured installed bytes remain pending.

An interim `npx tauri build --bundles appimage` attempt reached `linuxdeploy` and failed without a more specific surfaced error. `patchelf` is absent on this host. The cause still needs diagnosis in Phase 8; no AppImage size is claimed from this attempt.

### Integrated code build on this Ubuntu host, 2026-10-24

After the build dependencies became available, `npm run dist:linux` completed both Tauri bundles. That interim `.deb` was **8,974,508 bytes** (SHA-256 `de29f0ebf9d0def166ab69fcf9ea4b086f0711e2c103a9366579d0d261c0007e`); the AppImage was **201,791,992 bytes** (SHA-256 `9d3d80b47adc60fca5e7e6e1cedf996114a3bdae1c25812c43cc19b18eb351e7`). These are **actual installer artifact measurements**, not installed sizes. Debian metadata says `Installed-Size: 24426` KiB; the AppImage AppDir occupies 590,052,888 bytes on this build filesystem. Neither figure is a measured installed footprint. Later source changes to window authorization mean these are interim artifacts; rebuild and remeasure the final tree in Phase 8. The previous AppImage error is no longer a current build blocker, but portability and installed behavior remain unverified.

### Double-tap and drop-handoff build, 2026-10-24

The rebuilt Ubuntu x64 `.deb` is **8,998,186 bytes** (SHA-256 `75308777d174b4a4df801db272ea92066e3511062c34148d0ef95f6facad77b9`). Its regular-file payload is **25,034,545 bytes** and Debian metadata reports `Installed-Size: 24495` KiB. The rebuilt AppImage is **201,812,472 bytes** (SHA-256 `8bcb91dfd74baaba51ab82bd82787f1ec90358a9d6e6fb52ef5022421057ce11`), with an AppDir using **590,126,616 bytes** on this build filesystem. These are actual package and unpacked measurements, **not** final installed footprints. Both the unpackaged release binary and AppImage stayed running under an Xvfb smoke test until the planned timeout; this is startup evidence, not a real GNOME interaction test. The already installed `santra` package is an older build; its files occupy 25,092,096 bytes on this filesystem and do not represent the rebuilt package. Native installation, uninstall, real file-manager drags, and installed-size measurement for these new artifacts remain open.

### Editor lifecycle and wheel feedback build, 2026-10-24

The latest `.deb` is **8,995,988 bytes** (SHA-256 `fa7f06e733157c12c7cba6b319a89f030c779773f1af7e1646eba562282ae543`). Its regular-file payload is **25,033,921 bytes**; Debian metadata reports `Installed-Size: 24495` KiB. The release binary stayed running in an isolated D-Bus/Xvfb startup smoke test until the planned timeout. These are actual package and payload measurements, **not** the installed size. The active `/usr/bin/santra` process and the installed `.deb` still use the previous build. The AppImage above also predates this editor fix. Reinstall the `.deb` and fully quit the old process before native feature testing.

### Strict double-tap build, 2026-10-24

`npm run dist:linux` completed both bundles. The `.deb` is **8,996,388 bytes** (SHA-256 `d5b7930a164cfdb54a1484c5347d5afed940b78cf2f52a1093b29ceb339a0f3e`); its extracted regular-file payload is **25,033,745 bytes**, and Debian metadata reports `Installed-Size: 24495` KiB. The AppImage is **201,816,568 bytes** (SHA-256 `f68620943a5a36895f0aabc6eafef385c3687f9325bcbcf0f26359342f7e944f`); its build AppDir occupies **590,122,520 bytes**. These are actual package and unpacked measurements, **not** installed sizes. The AppImage stayed running for a planned 12-second timeout under isolated D-Bus/Xvfb, which checks startup only. The installed `/usr/bin/santra` is still an older build. Native installation and GNOME/Windows file-manager drags remain to be checked.

### Background conversion and native pointer drop build, 2026-10-25

`npx tauri build --bundles deb` produced a `.deb` of **8,998,682 bytes** (SHA-256 `9a354c0f50d6354edd4a8a2fbb95eeae8adbc3a69c5332dcd520b84cb399efab`). The extracted package payload is **25,080,721 bytes**; Debian metadata reports `Installed-Size: 24540` KiB. The extracted executable stayed running for a planned 10-second isolated D-Bus/Xvfb smoke test. These are actual artifact and payload measurements, **not** an installed footprint or a real GNOME file-manager drag test. The AppImage from the prior build does not include this change.

### Windows x64 NSIS cross build, 2026-10-25

Using user-level `rustup` and `cargo-xwin` plus the installed Ubuntu NSIS/LLVM tools, the Windows target compiled and `makensis` produced `Santra_0.1.0_x64-setup.exe`. The installer is **222,176,073 bytes** (SHA-256 `6cc50959715b9a40be6923b1ae1a4404da4693f3852c1e97338d99353da84c10`). The bundled `santra.exe` is a **17,795,072-byte** x86-64 PE application. The generated NSIS script targets x64 and embeds the offline WebView2 installer and the 589,054-byte Windows drag watcher. This is a historical artifact before moving WebView2 to a separate prerequisite; **Windows installed size has not been measured**. The cross built installer is unsigned and still needs install/uninstall, wheel, editor, conversion, accessibility, and offline checks on native Windows 10 and 11 x64.

### Separate WebView2 prerequisite NSIS build, 2026-10-25

### Interactive online WebView2 bootstrapper NSIS build, 2026-10-25

The x64 cross build now asks permission when no existing WebView2 Runtime is registered, downloads Microsoft's small Evergreen Bootstrapper to a temporary file, validates its Authenticode signer, runs it, and checks the Runtime registry again before Santra installation proceeds. The setup is **4,559,700 bytes** (SHA-256 `1e69c854d6d3e2321305e8460bab028ceaef05b9d6e32d7df1222b423a9a0378`); the large Runtime installer is not embedded. This is a cross-build result only. The prompt, download, signature check, Runtime setup, failure path, and successful Santra installation still need validation on native Windows 10/11.
