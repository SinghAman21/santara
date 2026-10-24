# Tauri packaging work in progress

The Tauri package identity is `io.santara.app`, with executable name `santara`. Windows and Ubuntu x64 are the only supported release targets. The commands below are build inputs, not evidence that installation or feature parity has passed.

## Build commands

On Ubuntu LTS x64, run `npm run dist:linux` to request `.deb` and AppImage artifacts. GTK 3, WebKitGTK 4.1, Ayatana AppIndicator, and normal Tauri native build dependencies must be present. `patchelf`, libvips development files, and `xvfb` are now available on this host; Santara did not install them. The current Rust raster backend does not link to libvips. The user handles any further sudo package installation.

On a Windows 10/11 x64 MSVC build host, run `npm run dist:windows`. The command builds and self-tests the isolated `native/windows/` drag watcher when its source has changed, then includes it as a Tauri resource under `native/`. The Tauri host starts only that fixed local helper path. A missing helper leaves the workspace and direct file drops usable, but the global Windows wheel trigger is unavailable.

Windows NSIS embeds the WebView2 offline installer. [Tauri's Windows installer guidance](https://tauri.app/distribute/windows-installer/) estimates that this choice adds around 127 MB; this is a **third-party estimate**, not a Santara artifact measurement. It must be checked with the network disconnected on native Windows. Linux AppImage is configured to bundle the media framework for local video and audio preview. [Tauri's AppImage guidance](https://tauri.app/distribute/appimage/) estimates an additional 15–35 MB for this setting; the actual Santara size and GStreamer plugin licenses remain to be audited. `.deb` depends on installed GTK/WebKitGTK system packages. AppImage portability and system-library requirements need a clean Ubuntu LTS check.

## Final measurements and review

For each final artifact, record bytes, SHA-256, native install/uninstall/launch result, and the installed footprint from the package manager or installation directory. Keep installer bytes separate from installed bytes. Record the embedded WebView2 and GStreamer/license inventory. Shell-only prototype sizes are in `TAURI_SHELL_VALIDATION.md`; they are not final release sizes. See `TAURI_VALIDATION_CHECKLIST.md` for the Phase 8 gate.

### Interim Ubuntu code build, 2026-10-24

`npx tauri build --bundles deb` succeeded on the local Ubuntu x64 host. The generated `Santara_0.1.0_amd64.deb` is **8,909,118 bytes** (SHA-256 `e4171c14a8b68d86660be591b43e4ac42ad48dea54e338e8bc87130b0943a639`). Its extracted regular files total **24,826,277 bytes**; Debian metadata reports `Installed-Size: 24280` KiB. These are actual artifact and extracted-payload measurements for the **interim code build**. They are not an installed footprint or final release measurement. The package declares `libayatana-appindicator3-1`, `libwebkit2gtk-4.1-0`, and `libgtk-3-0` dependencies. AppImage and NSIS artifacts, native installation, and measured installed bytes remain pending.

An interim `npx tauri build --bundles appimage` attempt reached `linuxdeploy` and failed without a more specific surfaced error. `patchelf` is absent on this host. The cause still needs diagnosis in Phase 8; no AppImage size is claimed from this attempt.

### Integrated code build on this Ubuntu host, 2026-10-24

After the build dependencies became available, `npm run dist:linux` completed both Tauri bundles. The current `.deb` is **8,974,508 bytes** (SHA-256 `de29f0ebf9d0def166ab69fcf9ea4b086f0711e2c103a9366579d0d261c0007e`); the AppImage is **201,791,992 bytes** (SHA-256 `9d3d80b47adc60fca5e7e6e1cedf996114a3bdae1c25812c43cc19b18eb351e7`). These are **actual installer artifact measurements**, not installed sizes. Debian metadata says `Installed-Size: 24426` KiB; the AppImage AppDir occupies 590,052,888 bytes on this build filesystem. Neither figure is a measured installed footprint. Later source changes to window authorization mean these are interim artifacts; rebuild and remeasure the final tree in Phase 8. The previous AppImage error is no longer a current build blocker, but portability and installed behavior remain unverified.
