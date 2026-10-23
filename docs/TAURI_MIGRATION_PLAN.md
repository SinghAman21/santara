# Santara Tauri Runtime Migration Plan

## Objective

Replace Electron with Tauri 2 while preserving Santara’s Windows x64 and Linux x64 behavior, especially the global citrus wheel, local processing, floating editors, and optional native integrations. Reuse the existing React/Vite interface where practical. Do not add macOS support or weaken privacy, safety, accessibility, or offline behavior to meet a size target.

Phase 0 is recorded in [ADR 0001](adr/0001-tauri-runtime-boundaries.md) and the [parity matrix](TAURI_PARITY_MATRIX.md). Phase 1 has an isolated Tauri shell prototype. On this migration branch, implement Phases 1–7 in order, record the checks for each phase, and run the full validation in Phase 8. The user authorized Electron removal on this branch after its replacements are implemented. Keep all processing local and offline-first; do not add macOS support.

## Baseline and constraints

- Existing release artifacts (from the local build): Windows installer about 116 MiB and unpacked app about 425 MiB; Linux `.deb` about 105 MiB, AppImage about 134 MiB, and unpacked app about 339 MiB.
- Prior Tauri/Wails size figures are planning estimates, not Santara build measurements. Measure both installer and installed/unpacked footprints from actual artifacts before choosing release budgets.
- The local environment has Rust/Cargo, Go, 12 CPU threads, 7 GiB RAM, and ample disk. Linux GTK/WebKitGTK development packages are missing; installing them requires interactive `sudo`. Windows cross-build support and native Windows validation must be assessed separately.
- Windows and Linux are the only supported targets. Windows Explorer integration and Linux GNOME/file-manager integration remain optional and must degrade gracefully.
- Keep FFmpeg, LibreOffice, Pandoc, Poppler, qpdf, and other external engines optional and capability-detected unless a separate reviewed distribution decision says otherwise.
- Tauri uses system WebViews on Windows/Linux. Document the WebView2 offline-install choice and Linux WebKitGTK dependencies; test AppImage portability rather than assuming it.

## Ordered implementation phases and deferred validation

The phase gates below are now acceptance checks collected in [the validation checklist](TAURI_VALIDATION_CHECKLIST.md). They do not stop the next code phase. A failed check blocks declaring migration complete, not continued implementation. Phase 8 runs them against the integrated Tauri tree and fixes failures before release.

### Phase 0 — Inventory, baseline, and migration decisions

- Map Electron main/preload/IPC responsibilities, each native helper, each renderer window, backend module, and capability route.
- Record current tests, release build commands, artifact sizes, installed dependencies, and working interactions.
- Define typed Tauri command/event contracts and a responsibility map before parallel code work.
- Decide the image backend strategy (Rust/libvips bindings or another licensed local backend) and how to preserve format support without retaining an unexamined Node sidecar.
- Decide WebView installation policy for Windows and Linux package/AppImage behavior.
- Produce an Architecture Decision Record and explicit parity matrix.
- **Gate:** migration scope, dependencies, licenses, build hosts, and size measurement method are reviewed; no Electron files deleted.

### Phase 1 — Tauri shell and renderer proof

- Add an isolated Tauri 2 host and build the existing React/Vite renderer inside it.
- Keep the Electron entry points and packaging separate; do not replace `npm run dist` yet.
- Prove app startup, tray/menu behavior where supported, transparent/always-on-top windows, multi-window lifecycle, file/folder drop, keyboard input, and shutdown on Ubuntu LTS and Windows 10/11 x64.
- Verify layout, fonts, high contrast, and editor behavior under WebView2 and WebKitGTK.
- Capture installer and installed sizes for a shell-only prototype, clearly separate from full-feature estimates.
- **Gate:** both platform shell smoke tests pass; wheel window positioning and lifetime are acceptable.

### Phase 2 — Native bridge and application services

- Replace Electron IPC with typed Tauri commands and events behind a small renderer adapter.
- Implement settings, XDG/Windows paths, local logs, diagnostics, history, queue metadata, output selection, open/reveal, clipboard, terminal, and safe file operations.
- Preserve cancellation, collision handling, atomic output creation, retry, and no-silent-overwrite behavior.
- Add permission/capability controls and ensure no command accepts arbitrary executable paths or unsafe filesystem actions.
- **Gate:** service tests pass; renderer can operate through Tauri without importing Electron APIs.

### Phase 3 — Processing and capability parity

- Port the worker/job lifecycle, capability detection, and backend invocation to Rust-native services.
- Preserve optional external backend detection and show only routes genuinely available on the device.
- Port image processing first: conversion, metadata handling, orientation, compression, crop/resize/rotate/flip, image preview, and floating image editors.
- Port archive handling with traversal/symlink protection and secure temporary files.
- Keep media/document tools routed to detected local FFmpeg, Poppler, qpdf, LibreOffice, Pandoc, and archive engines; validate subprocess arguments and process cancellation.
- Preserve the existing privacy and output naming behavior. Do not substitute upload services or silently install dependencies.
- **Gate:** route-by-route parity tests pass for the selected migration scope; malformed inputs, cancellation, and missing backends fail safely.

### Phase 4 — Global wheel and platform integrations

- Preserve modifier defaults and configurability: Shift conversions, Alt or Ctrl+Shift tools, Ctrl file actions.
- Port the Windows drag watcher/helper and native overlay integration without weakening process isolation.
- Port the Linux GNOME Shell extension/bridge and document supported GNOME versions; leave the app usable when the extension is absent.
- Verify positioning near the pointer, focus/escape behavior, drag-enter/leave/drop ordering, and no stale/destroyed-window events.
- **Gate:** manual drag tests pass with real Windows Explorer and GNOME Files; shortcut conflicts and accessibility alternatives are covered.

### Phase 5 — UI windows, accessibility, and workflow parity

- Migrate wheel, quick preview, image/video/PDF editors, settings, queue, and history windows incrementally through the bridge.
- Keep keyboard navigation, screen-reader names, scalable text, reduced-motion behavior, light/dark/system themes, and focus recovery.
- Test multi-monitor, mixed DPI, window close/reopen, and screen-lock/resume cases.
- **Gate:** all retained workflows pass on both operating systems and visual review is complete.

### Phase 6 — Packaging, dependencies, size, and licensing

- Build signed-ready Windows x64 `.exe` installer and Linux x64 `.deb`/AppImage configuration.
- Decide whether the AppImage depends on system WebKitGTK or bundles additional libraries; state the trade-off clearly in user docs.
- Decide WebView2 installation mode; do not claim an offline standalone install if the installer needs network access to fetch WebView2.
- Include platform-specific runtime/native dependencies only; verify architecture, checksums/signatures, license notices, and SBOM/dependency inventory.
- Measure download size and installed size separately. Compare with the Electron baseline and set a realistic size budget.
- **Gate:** native Windows and Ubuntu LTS builds/install/uninstall/launch tests pass; offline behavior and dependency notices are reviewed.

### Phase 7 — Cutover and safe cleanup

- After implementing replacements in Phases 1–6, remove Electron-only source, scripts, native helpers, dependencies, CI jobs, and docs on `tauri-rt`. Keep the previous implementation available in Git history while Phase 8 validates the replacement.
- Keep any still-required Windows/Linux helper isolated and documented; remove duplicate or generated files only after checking references and build inputs.
- Switch primary dev/build/package scripts and update README, architecture docs, capability docs, roadmap, and resume notes.
- **Code completion check:** clean checkout has Tauri as the sole runtime; `git diff` confirms no needed platform integration was dropped. Runtime and release checks move to Phase 8.

### Phase 8 — Integrated platform validation and release gate

- Run every check in `docs/TAURI_VALIDATION_CHECKLIST.md` against the integrated Tauri branch, including native Windows 10/11 x64 and Ubuntu LTS x64 acceptance.
- Fix failures in their owning phase code and repeat the affected checks. Measure actual installer and installed footprints from final artifacts, with estimates labeled separately.
- Do not publish or claim feature parity until both platforms pass, including real file-manager drags, offline install behavior, accessibility, safety, licensing, and clean-checkout builds.
- **Final gate:** the parity matrix is complete with evidence for both platforms and no Electron runtime dependency remains.

## Parallel-agent plan for implementation

Use agents only after Phase 0 defines stable interfaces. Keep each phase sequential; parallelize only disjoint tasks within a phase.

- **Coordinator (primary agent):** owns architecture decisions, shared contracts, integration, acceptance gates, and final cleanup. No other agent edits shared contracts without coordination.
- **Renderer agent:** ports React/Vite window bootstrap and UI bridge adapter; does not edit Rust commands or platform helpers.
- **Rust services agent:** owns typed commands, settings/paths/jobs/process runner and associated Rust tests; does not modify React UI.
- **Windows agent:** owns Windows-specific watcher/overlay/installer integration in isolated platform folders; does not alter Linux extension or shared UI.
- **Linux agent:** owns Linux integration, XDG paths, GNOME extension bridge, `.deb`/AppImage behavior in isolated folders; does not alter Windows helper or shared UI.
- **Verification agent:** independently maps Electron parity/tests and tests integrated results; read-only until a concrete test patch is requested.

Every task must name allowed files, expected output, and a verification command. Agents must not run broad deletion or edit the same files concurrently. Merge each phase’s changes, resolve conflicts, validate the integrated tree, and pass the gate before starting the next phase.

## Acceptance criteria

- The wheel works with real file drags on Windows 10/11 x64 and Ubuntu LTS x64, with and without optional shell integrations where applicable.
- The existing renderer and image workflows function without Electron or a bundled Node runtime, unless a documented, measured decision explicitly retains one.
- File operations and conversions remain local; no accounts, uploads, telemetry, or cloud fallbacks are introduced.
- Missing converters/WebViews produce actionable setup guidance rather than a broken launch.
- Linux paths follow XDG conventions; Windows paths and Explorer behavior remain native and safe.
- CI builds/tests Windows and Linux artifacts; release notes state installed dependencies, offline limitations, and measured artifact sizes.
- Old Electron files are removed only after the corresponding replacement passes the relevant gate.
