# Implementation status and next work

The `tauri-rt` branch has Tauri as its sole desktop runtime. The React/Vite workspace, citrus wheel, compact editors, local Rust job queue, detected optional backends, GNOME command bridge, Windows watcher, and Windows/Linux package configuration are in code. This is **code completion work**, not a claim of feature parity. The integrated Windows 10/11 x64 and Ubuntu LTS x64 checks remain in [Phase 8](TAURI_VALIDATION_CHECKLIST.md). The [parity matrix](TAURI_PARITY_MATRIX.md) is the detailed migration ledger.

| Area | Current code | Remaining acceptance work |
| --- | --- | --- |
| Images | Rust raster conversion, preview, orientation, crop, resize, rotate, flip, adjustments, compression, background canvas, metadata removal, preview panning at normal zoom; optional ExifTool JPEG metadata copy | Verify format/codec matrix, metadata preservation and animated inputs against the previous release; improve missing cases before declaring parity |
| Subtitles and archives | Local SRT/VTT conversion; bounded ZIP/TAR/GZIP create/extract with path and link checks | Malformed input corpus, cancellation, and platform file-manager workflows |
| Audio/video | Detected FFmpeg routes for conversion, trim, split, ordered merge, visualization, waveform preview, 30-second video editor preview, GIF/frame export, redaction, and other editor operations | Per-codec results, full-length visual seeking, metadata, playback, cancellation, and actual local output checks on both operating systems |
| PDF/documents | Detected Poppler, qpdf, Pandoc, and LibreOffice routes | Optional-tool fixtures, fidelity and safety review; absent tools stay hidden |
| Wheel/platform | Configurable double-tap modifiers with two taps begun during the drag, Tauri overlay, optional GNOME extension and Windows watcher, direct background conversion on a selected slice, accessible workspace fallback, repeat-drop handling and visible failure handoff | Real GNOME Files and Explorer drags, monitor/DPI placement, focus, screen lock/resume, extension absent/present |
| Packaging | Tauri NSIS x64 cross build and Ubuntu `.deb` build, AppImage config and earlier artifact, native CI jobs, and installer hash report script | Native install/uninstall/offline checks, final installed bytes, AppImage portability, Windows signing, full license notice review |

Unimplemented scope stays disabled: SVG with external-resource isolation, HEIC without a validated codec, encrypted/password and RAR/7z archives, editable PDF/OCR, Office reconstruction, and native share providers. Do not add routes based only on extensions. Do not add macOS support. Update this document and [capabilities](CAPABILITIES.md) as code or proof changes.
