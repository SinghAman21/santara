# Capability specification and source registry

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
| CAP-012 | Windows NSIS and Linux deb/AppImage x64 distribution | Configuration exists; actual artifact verification still required |

## Sources

| Source ID | URL | Use and limitations |
| --- | --- | --- |
| SRC-001 | https://tangerineformac.com/ | Public product positioning, format families, local workflow, keyboard demonstration; simulation/marketing only |
| SRC-002 | https://www.electron.build/code-signing | Signing configuration; certificate/provider eligibility remains external |
| SRC-003 | https://www.electron.build/icons | Icon generation/configuration guidance; default icons used initially |
| SRC-004 | https://playwright.dev/docs/test-webserver | Browser preview server lifecycle; no native Electron assurance |
| SRC-005 | https://playwright.dev/docs/mock-browser-apis | Pre-page-load bridge mocking technique |

## Evidence rules

Every enabled conversion should have an engine ID, supported direction, required tool and version, original or permissively licensed fixture, asserted output properties, and failure/cancellation evidence. Record status as proposed, implemented, verified, or unavailable, with a reason. Never convert marketing format counts into a Santara support claim. Native macOS formats, AirDrop, OS-specific shortcuts, OCR, PDF-to-office reconstruction, and lossless preservation require separate feasibility work.

## Current implementation inventory

The requirement table is an acceptance checklist, not a list of absent features. The current source implements the routes below; runtime detection and tests determine what actually works on a given machine.

| Family | Implemented adapter behavior | Limits |
| --- | --- | --- |
| Subtitles | Built-in SRT/VTT conversion and TXT output | Styling/settings may be lost; TXT omits timing |
| Images | Bundled Sharp JPG/PNG/WebP/TIFF/AVIF and image operations; separate local-preview tool window exposes fit-to-view, zoom and directional pan, draggable crop bounds/handles and presets, resize/fit, rotate/flip, solid/gradient/transparent backgrounds with an editable final canvas and visible default padding, brightness/contrast/saturation, size-checked compression including palette-quantized PNG, editable EXIF date/artist/copyright/description fields, and a Delete metadata action that saves a clean copy | Metadata inspection beyond editable EXIF text fields, annotation, redaction, collage, local-image backgrounds, and advanced photo controls are not implemented; native loading and detected formats gate availability; first animation frame; SVG disabled; HEIC backend-dependent |
| Audio/video | Capability-gated FFmpeg video wheel/editor: conversion, compression, trim, split, compatible merge, crop, resize, rotate/flip, speed, frame snapshots, mute, solid time-ranged redaction, metadata deletion, GIF, and audio extraction | FFmpeg/FFprobe feature detection gates each route; uses primary audio/video streams; redaction is fixed-coordinate (not tracked/blurred); re-encoding may increase size; audio editor remains proposal-only |
| PDF | qpdf structural compression, extraction, merge, rotation; Poppler rendering | One rendered page per job; PDF-to-office/OCR not claimed |
| Documents | Pandoc conversion when sandbox and readers/writers are detected | Input/resource limits, fidelity loss, no PDF/filter support; inspect registry warnings |
| Office | LibreOffice probing exists | Conversion disabled pending isolation of macros/external resources |
| Archives | Built-in ZIP/TAR/GZIP creation and extraction using mature archive libraries | ZIP STORE creation and STORE/DEFLATE extraction; plain USTAR; GZIP accepts one regular file; bounded sizes/counts and no links/unsafe paths; RAR/7z unsupported |

Run `node scripts/export-capabilities.mjs` (or the parent's optional `npm run manifest`) to refresh [the machine-readable registry](capabilities.generated.json). It contains backend availability/version, capability records, and declared input/output combinations. It is environment-specific detection evidence, not proof that every Cartesian input/output pair was converted. Counts may include unavailable routes; filter `available` explicitly. Regenerate after engine changes and do not infer support from an older snapshot.

## Drag and keyboard boundaries

The in-app action wheel and accessible post-drop conversion picker are implemented. During an external drag, Chromium's protected mode prevents reading source filenames/paths before the OS drop. Santara chooses file-specific conversion routes after receiving the drop. It does not claim to inspect external file contents in protected mode. A system-wide desktop/tray drag surface, global wheel, and OS-wide shortcuts remain pending.

Many primary strings are centralized, but details remain hardcoded. Full localization is a roadmap requirement, not a delivered internationalization guarantee.
