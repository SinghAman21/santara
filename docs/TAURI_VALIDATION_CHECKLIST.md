# Tauri migration validation checklist

Status: deferred integrated validation. Check boxes are evidence requirements, not implementation status. Record command, platform/version, artifact hash, result, and any manual observation when each is run. Do not infer native behavior from Wine or browser tests.

## Phase 0 decisions

- [x] Inventory Electron responsibilities, windows, helpers, backends and routes in ADR 0001.
- [x] Record current tests, measured Electron artifacts, system dependencies, build hosts and licensing direction.
- [x] Define the typed renderer bridge and command/event boundaries.
- [ ] Confirm final Rust image codec licenses and Windows/Linux redistributed dependencies before release.

## Phase 1 shell

- [ ] Ubuntu LTS GNOME: startup, tray/menu, transparent/topmost wheel, pointer placement, close/reopen, folder/file drops, keyboard, shutdown, theme, contrast, fonts and editor layout.
- [ ] Windows 10 x64 and Windows 11 x64: the same checks under WebView2, including multi-monitor and mixed DPI.
- [ ] Measure shell-only installer bytes and installed bytes for `.deb`, AppImage and NSIS; label WebView and system-library dependencies.

## Phase 2 bridge and services

- [ ] Typed command/event tests, origin/window permissions, settings, XDG/Windows paths, local history, queue metadata and diagnostics.
- [ ] File dialogs, clipboard, open/reveal, terminal and safe copy/move; reject unknown paths, symlinks and network paths.
- [ ] Cancellation, retry, collision policy, temporary files and atomic publication; no silent overwrite.

## Phase 3 processing

- [ ] Route-by-route capability parity against the previous implementation, using actual installed backends.
- [ ] Image conversions, orientation, metadata, crop/resize/rotate/flip/compression, preview and output naming.
- [ ] Archive traversal, symlink, decompression-limit and malformed-file tests.
- [ ] FFmpeg, Poppler, qpdf, Pandoc, LibreOffice and ExifTool routes only when detected; missing engines fail safely.
- [ ] Malformed inputs, cancellation, subprocess arguments and process termination leave no partial outputs.

## Phase 4 wheel and integrations

- [ ] Configurable double-tap Shift, Alt/Ctrl+Shift and Ctrl modes (400 ms); a key held before drag, long press, or single new press must not open the wheel; shortcut conflicts, native pointer-selected drop, silent conversion without opening the workspace, failure handoff and keyboard fallback.
- [ ] Drop the same file twice; both selections retain a usable stable ID. Confirm successful conversion opens Activity and failed routes retain the files with visible feedback.
- [ ] Real Explorer drags on Windows 10/11 and real GNOME Files drags on Ubuntu LTS, with optional helper/extension present and absent.
- [ ] Pointer position, focus, Escape, drag ordering, mixed DPI and no stale-window callbacks.

## Phase 5 UI and accessibility

- [ ] Wheel, quick preview, image/video/PDF editors, settings, queue and history on both webviews.
- [ ] Open image and video editors after their hidden windows have loaded, close and reopen with another operation, and verify each receives a fresh file/recipe context.
- [ ] Screen-reader names, tab/arrow/Enter/Escape navigation, focus recovery, scalable text, high contrast and reduced motion.
- [ ] Light/dark/system themes, multi-monitor, screen lock/resume and close/reopen.

## Phase 6 packaging and licensing

- [ ] Native Windows NSIS and Ubuntu `.deb`/AppImage build, install, uninstall and launch on clean target machines.
- [ ] WebView2 offline installer policy verified without network; Linux WebKitGTK/AppImage dependency behavior documented and tested.
- [ ] Final installer bytes, installed bytes, architecture, hashes/signatures, notices and SBOM/dependency inventory.

## Phase 7 cleanup

- [ ] Clean checkout builds without Electron/Node host dependencies; required platform helpers remain isolated.
- [ ] `git diff` review confirms no needed Windows/Linux integration or user-facing workflow was dropped.
- [ ] README, roadmap, capability and architecture documents match the verified Tauri behavior.

## Phase 8 final gate

- [ ] Run all applicable unit, integration, browser and desktop smoke suites on both supported operating systems.
- [ ] Complete the parity matrix with pass/fail evidence and resolve every required failure before release.
- [ ] Verify local/offline behavior with network unavailable; no upload, account or telemetry path exists.
