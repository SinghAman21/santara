# Tauri shell validation record

Date: 2026-10-23. Phase 1 implementation is in progress; its gate is **not passed**.

## Implemented prototype

`src-tauri/` contains a Tauri 2 Rust host. `npm run tauri:dev` and `npm run tauri:build` are separate from the Electron entry points and `npm run dist`. Four Tauri windows load the existing Vite renderer: `workspace`, `wheel`, `image`, and `video`. The wheel is configured as a transparent, undecorated, always-on-top window. A tray menu can show the prototype views and quit. Closing a window hides it so the tray can reopen it. The host logs only drag entry/drop counts and window labels for shell testing, never file paths or contents. The only Rust command is `runtime_info`; processing and the production renderer bridge are not migrated yet. No Electron file has been removed.

## Evidence collected on Ubuntu 26.04.1 LTS x64

| Check | Result |
| --- | --- |
| `npx --no-install tauri info` | Parsed the Vite/Tauri configuration; identified installed WebKitGTK 4.1 and missing `rustup`. |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Passed with Tauri 2.12.5 after a clean dependency compile. |
| `npm run tauri:dev -- --no-watch` | Built and launched `target/debug/santara-tauri`; process remained alive until stopped with Ctrl+C. GTK emitted scale-factor critical warnings and Ayatana deprecation warning. Their visual effect remains unassessed. |
| `npm run typecheck`, `npm run build` | Passed after shell scaffold was added. |
| `npm run tauri:build -- --bundles deb,appimage` | Passed on this host for the shell prototype. Final artifact bytes: `.deb` 3,934,772; AppImage 89,553,400. Release executable: 11,118,576 bytes. AppImage AppDir payload: 285,849,465 bytes. Debian `Installed-Size` metadata: 11,095 KiB. These payload figures are not measured installed footprints. |
| GNOME tray and accessibility | The StatusNotifier item registered. Tray opened the wheel, image and video windows; the packaged wheel's Close button hid it, the tray reopened it, and Quit ended the process. The workspace and wheel exposed accessible WebKit content. Editor windows currently show their loading states because the production Tauri bridge is not yet implemented. |

This is a startup and compile proof. It does **not** verify tray clicks, transparency, drag/drop payloads, keyboard handling, font/layout fidelity, editor behavior, shutdown cleanup, or installed package behavior. The prototype renderer currently uses its browser fallback because the Tauri bridge is scheduled for Phase 2. The shell is not a usable replacement for Electron.

## Open Phase 1 gate

- Test all four windows, tray/menu, wheel positioning/lifetime, file and folder drops, keyboard input, shutdown, visual layout, high contrast, and editor surfaces on this Ubuntu LTS GNOME desktop.
- Build, install, launch, and test the shell on native Windows 10 and 11 x64 with WebView2. Wine/MinGW can check cross-build mechanics but cannot substitute for native Explorer and WebView2 behavior. The user will perform native Windows validation later.
- Build the Windows shell installer and measure artifact bytes and **installed** bytes for all targets. The Linux shell-only `.deb` and AppImage were built and measured above; installed footprints remain unmeasured. The Windows offline WebView2 mode needs a native installer build before its size can be measured.
- Decide how the shell exposes editor contexts for a valid WebView visual check without treating a browser fallback or mock as a production workflow.

Under the revised code-first plan, continue implementing Phase 2 while these checks remain on the Phase 8 list. The shell evidence here does not establish parity or release readiness.
