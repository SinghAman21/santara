# Capability specification and source registry

The `tauri-rt` branch uses Tauri and a runtime capability registry. Shift, Alt, and Ctrl each require two complete taps during an active drag before the wheel opens; a held modifier at drag start does not count. Dropping on a conversion slice queues a local job and closes the wheel without showing the workspace; failures open the workspace with an error. Rust image/subtitle/archive routes and detected FFmpeg, Poppler, qpdf, Pandoc, LibreOffice, and optional ExifTool routes are implemented in code. Rust raster processing removes metadata; detected ExifTool enables JPEG metadata editing as a same-format copy. FFmpeg includes snapshot, GIF, visualization, bounded redaction, split ranges, and ordered merge. The detailed status and native validation gaps are in `TAURI_PARITY_MATRIX.md`.

Research date: 2026-10-19. Only the public [Tangerine website](https://tangerineformac.com/) was read. No application binary was downloaded, run, decompiled, or reverse engineered. Public marketing is evidence of advertised behavior, not a tested technical implementation or Santara compatibility.

## Public reference observations

The site presents local conversion across media, documents, and archives, drag-triggered contextual controls, editing operations, and file actions. It also advertises keyboard interaction. These observations motivate the independent requirements below; they do not establish that Santara implements them. The source site's format lists and counts can change.

| Requirement ID | Independent Santara requirement | Current acceptance status |
| --- | --- | --- |
| CAP-001 | Import files with clear empty and unsupported states | Parent implementation and browser tests must verify |
| CAP-002 | Report input/output support per installed engine | Engine registry and real fixture tests required |
| CAP-003 | Queue jobs with progress, failure, cancellation, collision handling | Native integration evidence required |
| CAP-004 | Local processing with explicit dependency discovery | Network and process audit required |
| CAP-005 | Image transformations and metadata choices | Advanced requirements; adapter-specific verification pending |
| CAP-006 | Audio/video conversion, trim, compression | Optional system engines; codec/license and quality review pending |
| CAP-007 | Document, PDF, presentation, and spreadsheet workflows | Fidelity, fonts, encryption, and unsupported formats need explicit limits |
| CAP-008 | Archive operations and subtitle conversion | Traversal/bomb protection and encoding tests required |
| CAP-009 | Keyboard-operable UI, settings, meaningful disabled states | Browser scaffold covers only selected flows |
| CAP-010 | Desktop drag wheel and global shortcuts | OS-specific research, implementation, and accessibility testing pending |
| CAP-011 | File actions such as copy, move, reveal, copy path | Validate destinations and destructive-action policy; no macOS-only parity claim |
| CAP-012 | Windows NSIS and Linux deb/AppImage x64 distribution | Preview artifacts have been packaged; native Windows and clean-machine installation validation remain required |

## Sources

| Source ID | URL | Use and limitations |
| --- | --- | --- |
| SRC-001 | https://tangerineformac.com/ | Public product positioning, format families, local workflow, keyboard demonstration; simulation/marketing only |
| SRC-004 | https://playwright.dev/docs/test-webserver | Browser preview server lifecycle; native drag behavior requires platform testing |
| SRC-005 | https://playwright.dev/docs/mock-browser-apis | Pre-page-load bridge mocking technique |

## Evidence rules

Every enabled conversion should have an engine ID, supported direction, required tool and version, original or permissively licensed fixture, asserted output properties, and failure/cancellation evidence. Record status as proposed, implemented, verified, or unavailable, with a reason. Never convert marketing format counts into a Santara support claim. Native macOS formats, AirDrop, OS-specific shortcuts, OCR, PDF-to-office reconstruction, and lossless preservation require separate feasibility work.

## Current implementation inventory

The requirement table is an acceptance checklist, not a list of absent features. The current source implements the routes below; runtime detection and tests determine what actually works on a given machine.

| Family | Implemented adapter behavior | Limits |
| --- | --- | --- |
| Subtitles | Built-in SRT/VTT conversion and TXT output | Styling/settings may be lost; TXT omits timing |
| Images | Bundled Rust raster processing with detected JPG/PNG/WebP/TIFF/AVIF support and image operations; separate local-preview tool window exposes fit-to-view, zoom and directional pan, draggable crop bounds/handles and presets, resize/fit, rotate/flip, solid/gradient/transparent backgrounds with an editable final canvas and visible default padding, brightness/contrast/saturation, size-checked compression including palette-quantized PNG, editable EXIF date/artist/copyright/description fields, and a Delete metadata action that saves a clean copy | Metadata inspection beyond editable EXIF text fields, annotation, redaction, collage, local-image backgrounds, and advanced photo controls are not implemented; native loading and detected formats gate availability; first animation frame; SVG disabled; HEIC backend-dependent |
| Audio/video | Capability-gated FFmpeg video wheel/editor: conversion, compression, trim, split, compatible merge, crop, resize, rotate/flip, speed, frame snapshots, mute, solid time-ranged redaction, metadata deletion, GIF, and audio extraction | FFmpeg/FFprobe feature detection gates each route; uses primary audio/video streams; redaction is fixed-coordinate (not tracked/blurred); re-encoding may increase size; audio editor remains proposal-only |
| PDF | qpdf structural compression, extraction, merge, rotation; Poppler rendering | One rendered page per job; PDF-to-office/OCR not claimed |
| Documents | Pandoc conversion when sandbox and readers/writers are detected | Input/resource limits, fidelity loss, no PDF/filter support; inspect registry warnings |
| Office | LibreOffice probing exists | Conversion disabled pending isolation of macros/external resources |
| Archives | Built-in ZIP/TAR/GZIP creation and extraction using mature archive libraries | ZIP STORE creation and STORE/DEFLATE extraction; plain USTAR; GZIP accepts one regular file; bounded sizes/counts and no links/unsafe paths; RAR/7z unsupported |

The live Tauri `bootstrap` snapshot contains backend availability and capability records for the current machine. This environment-specific detection is not proof that every declared input/output pair has been converted; filter `available` and run representative local fixtures during Phase 8.

## Drag and keyboard boundaries

The in-app action wheel, accessible post-drop conversion picker, and Tauri global overlay code are implemented. Shift, Alt, and Ctrl modes require two complete taps of the same modifier during a drag; a held key or single press has no wheel action. A selected conversion slice queues in the background without opening the workspace. Unselected or failed global drops are handed to the workspace with feedback, and repeated drops keep the file selection. Native Share has no provider and is hidden. During an external drag, a WebView cannot read source filenames/paths until the OS delivers the drop. Santara chooses file-specific routes after inspection. The optional GNOME bridge and Windows watcher can request the overlay, but real Explorer and GNOME Files handoff remains a Phase 8 gate.

Many primary strings are centralized, but details remain hardcoded. Full localization is a roadmap requirement, not a delivered internationalization guarantee. The Tauri image route removes metadata during raster processing; detected ExifTool adds JPEG metadata editing as a separate copy operation.

