# Tauri parity matrix

Status as of 2026-10-23: Phase 0 inventory and Phase 1 shell prototype. `Pending` means the Tauri implementation and its gate have not passed. Electron behavior is a baseline, not a Tauri claim. See [shell validation](TAURI_SHELL_VALIDATION.md).

| Area | Electron baseline | Tauri proof required | Status |
| --- | --- | --- | --- |
| Host and fallback | Hidden background host, optional tray, main workspace for settings/history/queue | Native startup, single instance, tray/menu, quit, host accessibility fallback on Ubuntu and Windows | Ubuntu shell process launched; interactions pending |
| Windows | Main workspace, transparent nonfocusable citrus wheel, compact image/video editor | Window creation, close/reopen, topmost, pointer positioning, focus, drag/drop, multi-monitor and mixed DPI | Pending |
| Renderer | React/Vite workspace and wheel, image/video editor hosts, PDF workspace | Same layout/fonts/high contrast and keyboard behavior in WebKitGTK and WebView2 | Pending |
| Bridge | Context-isolated preload with validated IPC and sender checks | Typed Tauri adapter, command permissions, per-window session checks and event cleanup | Pending |
| Settings/data | XDG user data, atomic JSON settings/jobs, diagnostics, clipboard, open/reveal, output dialog | Equivalent local paths and services, Windows native paths, redacted diagnostics | Pending |
| Jobs | Inspection, signature checks, queue, retry/cancel, collision naming and atomic outputs | Route-by-route golden tests, failure/cancel/cleanup and no silent overwrite | Pending |
| Images | Bundled Sharp/libvips conversion, bounded previews, orientation, crop/resize/rotate/flip/compress/background/metadata | Rust/libvips probe and tested format matrix, equivalent editor recipes and new output copies | Pending |
| Archives | Local ZIP/TAR/GZIP with bounded entries and traversal/link rejection | Malformed archive, escape, cancellation and round-trip tests | Pending |
| Optional engines | Capability-gated FFmpeg, Poppler, qpdf, Pandoc, LibreOffice, ImageMagick | Probe each executable/feature; hide unavailable routes; process arguments and cancellation tested | Pending |
| Media/previews | Bounded opaque preview URLs, waveforms and PDF raster preview | Safe local protocol, bounded reads, media/PDF/image parity | Pending |
| Wheel | Shift convert, Alt or Ctrl+Shift tools, Ctrl actions; settings configurable | Real Explorer and GNOME Files drags, pointer/focus/escape, wheel lifetime and accessibility | Pending; Electron external drags also unverified |
| Windows helper | User-mode watcher prototype emits JSON events; drop remains in overlay | MSVC x64 build, isolation, Explorer OLE drag handoff on Windows 10/11 | Pending |
| Linux integration | Optional GNOME 46/50 extension and XWayland assumptions | GNOME Files drag and extension absent/present on supported Ubuntu LTS; WebKitGTK placement | Pending |
| Packaging | Electron NSIS, deb and AppImage artifacts measured in ADR 0001 | Native Tauri NSIS/deb/AppImage build, install/uninstall/launch, dependency/license/SBOM and installed-size checks | Pending |

Do not mark a row complete from source inspection, CI compilation, Wine execution, or browser-only tests alone where the required proof says native interaction. Do not remove Electron files before Phase 7.
