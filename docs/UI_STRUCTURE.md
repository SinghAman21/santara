# UI structure and Penpot migration

The reference is the connected Penpot file `64ee36db-f4d2-8047-8008-dc267fe60b4f`, page `eff82248-f6ef-8013-8008-dc36d495e2bb`. Frames 00–10 were inspected through MCP, including exported editor and wheel images. Its geometry and interaction patterns inform the app; the desktop uses white surfaces and `#ff5a00` accents instead of the reference's cream and varied oranges.

## Source ownership

- `src/main.tsx`: chooses the workspace, wheel, image/video editor host, or preview window.
- `src/workspace/App.tsx`: workspace navigation, selection, history, settings, and operation handoff.
- `src/common/`: wheel, modal, editor fields, operation shell, styles, bridge, strings, and shared types.
- `src/tools/<family>/`: feature controls and editor-specific state. Image and video recipes retain their existing preview and job adapters. Audio has a dedicated local playback/waveform dialog. PDF retains validated page controls. Archive has creation/extraction review.
- `src/convert/<family>/`: individual conversion/export reviews. `ConversionDetails.tsx` selects them; EPUB is distinguished by selected input extension because Rust groups EPUB with documents. `common/queue.ts` assembles the existing job options.
- `src/action/`: individual Copy, Move, CopyPath, OpenTerminal, and QuickPreview dispatch functions. `common/` holds preview UI and shared action request types. These actions apply equally to file families, so they are shared rather than duplicated in ten directories.
- `src-tauri/src/`: existing local services and capability detection remain Rust-owned. Native platform helpers remain under their platform directories.

Shortcuts map to modes, not directories: Shift → `convert`, Alt/Ctrl+Shift → `tools`, Ctrl → `action`. The persisted/API mode is still named `actions` for compatibility. Shortcuts remain configurable.

## Frame coverage and boundaries

| Frame | UI source | Runtime boundary |
| --- | --- | --- |
| 01 Image | `tools/image/{Crop,Resize,Rotate,Flip,Background,Adjust,Compress,Metadata,StripMetadata}.tsx`, `convert/image/Convert.tsx` | Annotation, image redaction, and collage stay hidden without capabilities. |
| 02 Video | `tools/video/*Controls.tsx`, `convert/video/Convert.tsx` | Existing stream validation and local FFmpeg routes retained. |
| 03 Audio | `tools/audio/{Normalize,Trim,Channels,Visualize,Compress,StripMetadata}.tsx`, `AudioToolWindow.tsx` | Playback is the original audio, explicitly labeled; output settings apply on export. Bleep remains unavailable. |
| 04 PDF | `tools/pdf/PdfWorkspace.tsx`, `ExtractPages.tsx`, `RenderPage.tsx`, `Compress.tsx`, `convert/pdf/Export.tsx` | Original first-page preview and single-page render limits stay visible. Secure redaction stays unavailable. |
| 05 Archive | `tools/archive/{CreateArchive,Extract,ArchiveWindow}.tsx`, `convert/archive/Create.tsx` | No invented entry listing or preflight measurements; native validation remains authoritative. |
| 06 Document | `convert/document/ConversionWarning.tsx` | Only detected, self-tested Pandoc routes appear. |
| 07 EPUB | `convert/epub/ConversionWarning.tsx` | No certified package validator is claimed. |
| 08 Presentation | `convert/presentation/ExportPdf.tsx` | Office conversion remains disabled; no fabricated slide export controls. |
| 09 Spreadsheet | `convert/spreadsheet/ExportText.tsx` | Office conversion remains disabled; no unimplemented worksheet/encoding controls. |
| 10 Subtitle | `convert/subtitle/ConfirmFormat.tsx` | Built-in SRT/VTT/TXT timing and styling limitations are visible. |

The shared operation dialog lists the real source selection rather than inventing a rendered document preview. Conversion review errors retain settings and allow retry/cancel. Global direct-conversion behavior is preserved. No new processing capabilities, network services, or packaging targets are introduced.

## Validation

Use `npm run typecheck`, `npm run test`, `npm run build`, and `npm run test:e2e -- --workers=2`. Browser tests mock the native bridge boundary and cannot establish real GNOME/Explorer drag, native focus, or desktop packaging compatibility. Existing Phase 8 manual validation remains required.
