# Tauri parity matrix

Status as of 2026-10-23: implementation is underway through the native bridge and initial Rust raster jobs. `Pending` means the Tauri implementation and its gate have not passed. Electron behavior is a baseline, not a Tauri claim. See [shell validation](TAURI_SHELL_VALIDATION.md) and the deferred [validation checklist](TAURI_VALIDATION_CHECKLIST.md).

| Area | Electron baseline | Tauri proof required | Status |
| --- | --- | --- | --- |
| Host and fallback | Hidden background host, optional tray, main workspace for settings/history/queue | Native startup, single instance, tray/menu, quit, host accessibility fallback on Ubuntu and Windows | Ubuntu shell process launched; interactions pending |
| Windows | Main workspace, transparent nonfocusable citrus wheel, compact image/video editor | Window creation, close/reopen, topmost, pointer positioning, focus, drag/drop, multi-monitor and mixed DPI | Pending |
| Renderer | React/Vite workspace and wheel, image/video editor hosts, PDF workspace | Same layout/fonts/high contrast and keyboard behavior in WebKitGTK and WebView2 | Pending |
| Bridge | Context-isolated preload with validated IPC and sender checks | Typed Tauri adapter, command permissions, per-window session checks and event cleanup | Typed adapter and native selection/drop bridge compile; per-window authorization and full command coverage pending |
| Settings/data | XDG user data, atomic JSON settings/jobs, diagnostics, clipboard, open/reveal, output dialog | Equivalent local paths and services, Windows native paths, redacted diagnostics | Rust settings and job JSON, dialogs, clipboard, copy/move, terminal, open/reveal implemented; integrated tests pending |
| Jobs | Inspection, signature checks, queue, retry/cancel, collision naming and atomic outputs | Route-by-route golden tests, failure/cancel/cleanup and no silent overwrite | Initial image queue, retry/cancel, private temporary files and no-overwrite hard-link publication compile; parity tests pending |
| Images | Bundled Sharp/libvips conversion, bounded previews, orientation, crop/resize/rotate/flip/compress/background/metadata | Rust/libvips probe and tested format matrix, equivalent editor recipes and new output copies | Provisional Rust image crate path supports basic raster jobs and preview; metadata, arbitrary rotation, background, editor context, codec parity, and libvips distribution remain pending |
| Archives | Local ZIP/TAR/GZIP with bounded entries and traversal/link rejection | Malformed archive, escape, cancellation and round-trip tests | Rust ZIP/TAR/GZIP create/extract and a ZIP round-trip test compile; malformed archive corpus and native job acceptance pending |
| Optional engines | Capability-gated FFmpeg, Poppler, qpdf, Pandoc, LibreOffice, ImageMagick | Probe each executable/feature; hide unavailable routes; process arguments and cancellation tested | FFmpeg/FFprobe probe and selected audio/video routes have one local conversion test; other engines and full media operation parity pending |
| Media/previews | Bounded opaque preview URLs, waveforms and PDF raster preview | Safe local protocol, bounded reads, media/PDF/image parity | Pending |
| Wheel | Shift convert, Alt or Ctrl+Shift tools, Ctrl actions; settings configurable | Real Explorer and GNOME Files drags, pointer/focus/escape, wheel lifetime and accessibility | Tauri native drop event reaches workspace/wheel adapter in code; external drags and modifier helper remain pending |
| Windows helper | User-mode watcher prototype emits JSON events; drop remains in overlay | MSVC x64 build, isolation, Explorer OLE drag handoff on Windows 10/11 | Pending |
| Linux integration | Optional GNOME 46/50 extension and XWayland assumptions | GNOME Files drag and extension absent/present on supported Ubuntu LTS; WebKitGTK placement | Pending |
| Packaging | Electron NSIS, deb and AppImage artifacts measured in ADR 0001 | Native Tauri NSIS/deb/AppImage build, install/uninstall/launch, dependency/license/SBOM and installed-size checks | Pending |

Do not mark a row complete from source inspection, CI compilation, Wine execution, or browser-only tests alone where the required proof says native interaction. Electron cleanup is authorized on this branch in Phase 7 after code replacements are implemented; Phase 8 validates them.
