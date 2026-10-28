# Santra PDF Wheel Architecture

## Status and scope

This document proposes the PDF wheel and compact editor workflow. It does not claim that the planned wheel UI or every listed operation is implemented. Existing PDF support is limited to capability-gated qpdf structural operations (compression, extraction, merge, and rotation) and Poppler page rendering; PDF-to-editable reconstruction is not currently claimed. Runtime detection and tests must gate every visible operation.

The design uses Santra's citrus wheel interaction and its own branding. It does not reuse third-party artwork, trademarks, copy, or macOS conventions. All PDF inspection, previews, and exports remain local and work offline.

## Modifier mapping

| Modifier | Wheel | PDF behavior |
| --- | --- | --- |
| **Shift** | Convert | Show output routes for this PDF that are genuinely available, including editable-format attempts when a local verified backend is installed. |
| **Alt** (or configured tool modifier) | Tools | Show PDF editing and export tools listed below. Open a compact PDF tool window, not the full workspace. |
| **Ctrl** | File actions | Keep the cross-platform actions: Copy, Move, Copy Path, Open Terminal, Share (when a native provider exists), and Quick Preview. These remain available even when the PDF has no conversion route. |

Defaults remain configurable. Ctrl+Shift may be configured as an alternate tools shortcut; it must not collide silently with the conversion or file-action wheel. Wheel menus stay open for pointer or keyboard selection, support visible labels, and can be cancelled with Escape.

## Shift: conversion wheel

Offer only routes accepted by the installed local capability registry. Candidate PDF outputs:

- **Editable documents:** DOCX, PPTX, and XLSX where a verified local reconstruction route exists; ODT, RTF, HTML, TXT, Markdown, and EPUB only where the chosen backend has a real tested route.
- **Page images:** PNG and JPG, with page range or all-pages selection and configurable DPI (300 by default).
- **Other supported document outputs:** Include only after the backend can produce and validate them from PDF; do not infer support from a general-purpose document converter's unrelated formats.

PDF-to-editable conversions are best-effort reconstructions, not faithful source recovery. Before processing, explain that layout, fonts, tables, images, reading order, formulas, and vector objects can change or be omitted. Clearly distinguish text extraction/OCR from true editable-layout reconstruction. OCR may appear only when a local OCR engine and required language data are detected; it must never imply that editable layout is guaranteed.

Choosing a supported route queues it locally. Preserve the original, use collision-safe `filename-converted.ext` outputs beside the source by default, and show progress, errors, Open, and Reveal in File Manager without opening the dashboard. If a backend is absent, hide the route or show a truthful unavailable explanation; never present a dead menu item.

## Alt: PDF tools wheel

Keep the wheel readable by grouping the five page-structure operations under a **Page Structure** entry. Selecting it opens a compact, keyboard-accessible operation chooser/editor. The other primary Alt slices are **Compress**, **Redact**, **Edit Metadata**, and **Export Pages**. This keeps the selected scope accessible without shrinking a crowded wheel into illegible labels.

### Page Structure group

1. **Organize Pages** — Render local page thumbnails; reorder with pointer drag and explicit move-up/down controls; rotate, duplicate, or remove selected pages. Show the resulting page count and order before saving.
2. **Merge PDFs** — Accept two or more PDFs, initialize order from the user's selection, and allow reordering before merging. Report incompatible/encrypted inputs and any document-level metadata that will not carry over.
3. **Split PDF** — Split by explicit page ranges or into one-file-per-page output. Preview output count and names; validate ranges before enabling the action.
4. **Extract Pages** — Select page thumbnails or enter page ranges and save the selection as a new PDF. Keep extraction distinct from splitting so the user knows whether they are creating one selected subset or many outputs.
5. **Insert Pages** — Insert pages from another PDF at a chosen position or page boundary. Preview the resulting order and preserve both source PDFs.

All page lists need an accessible non-drag reorder path. Page thumbnails are local previews, not uploads. For large PDFs, render thumbnails lazily and enforce page-count, pixel, and memory limits.

### Compress

Show source size, page count, and available compression choices. Explain whether the selected method rewrites PDF structure, recompresses streams, downsamples images, or rasterizes content. Offer an estimated size only when a measured preview is available; never promise a smaller output. Preserve vector/text content where feasible, disclose quality/fidelity trade-offs for lossy presets, and keep the original unchanged. Output name: `filename-compressed.pdf`.

### Redact

Provide page preview and rectangular redaction regions with page navigation, undo, and a conspicuous Apply action. A visual black overlay is **not** secure redaction: export must remove or irreversibly rasterize the underlying selected content, then verify that the covered text/images are not extractable from the saved copy. If the installed backend cannot provide verifiable redaction, do not expose the action as secure PDF redaction; instead report it unavailable. Warn that rasterization may reduce searchability, accessibility, vector quality, and file fidelity. Never alter the original.

### Edit Metadata

Inspect and edit only fields the detected backend can safely write, such as title, author, subject, keywords, and creator when available. Show the existing value and the value to be saved; do not pretend to edit unsupported XMP or embedded metadata fields. Keep metadata deletion a separately named destructive action if added later. Explain that some producer or timestamps may be regenerated by the backend. Save a new copy by default.

### Export Pages

Export selected pages or all pages to PNG/JPG. Include page-range validation, output format, background/alpha behavior where applicable, and DPI controls (default 300; bounded by capability). Preview page count, output dimensions, and naming pattern such as `filename-page-001.png`. Large batch exports must report per-page progress, support cancellation, and clean incomplete temporary outputs.

## Compact editor interaction

Each tool opens a focused Santra window near the wheel, with a native, bounded size and a complete-page contain-fit preview. Use a thumbnail rail/page navigator, clear selection state, zoom controls, and a settings panel appropriate to that operation. Keep the preview visible while configuring output; do not show the full dashboard.

Every editor provides:

- Source name, page count, and relevant local metadata.
- Accessible page navigation and controls; keyboard navigation must match pointer behavior.
- Reset/Cancel and a clear primary action such as **Save Organized PDF** or **Export Pages**.
- A summary of output path/name, page count, quality/fidelity changes, and metadata behavior.
- Inline validation before processing, then per-job progress, cancel, retry, Open, and Reveal in File Manager.

Preview rendering and final export must use the same page selection and operation recipe. Temporary renders are cleaned after cancel, close, failure, or successful completion. Output is written to a private temporary file and atomically published after validation; collisions follow the configured Ask, Auto-rename, Skip, or explicitly confirmed Replace behavior.

## Capability registry and local backends

Each route must declare input signatures, operation, output type, backend, dependency/version constraints, options, batch behavior, metadata behavior, warnings, and validation tests. A file extension alone is insufficient to enable a route. Detect password protection, malformed files, permissions, backend availability, and supported encryption before processing; do not retain passwords in job history or logs.

Use existing optional qpdf and Poppler detection for the routes they actually support. Additional page editing, metadata editing, redaction, OCR, and PDF-to-editable backends require separate dependency/license review and real fixture verification. Do not bundle a dependency whose license conflicts with distribution; list bundled and optional components in the notices. No web service is an allowed fallback.

## Safety, privacy, and error handling

- Never execute or upload PDF content. Do not send paths, filenames, previews, metadata, or diagnostics over the network.
- Treat PDFs as untrusted input. Apply bounded page count, render dimensions, file size, processing time, and temporary-storage limits.
- Preserve originals. Sanitize output names, use collision-safe writes, atomically publish completed outputs, and clean up on failure/cancellation.
- Report actionable errors for corrupt, unsupported, encrypted/password-protected, oversized, out-of-disk, permission-denied, and backend-failure cases.
- Logs contain no document content; copied diagnostics redact paths according to the user's privacy setting.

## Verification plan

Use generated or openly licensed fixtures, never private or copyrighted user documents. Tests should cover:

- Capability hiding/showing for missing and present qpdf, Poppler, OCR, and reconstruction backends.
- Merge ordering, organize/reorder, split ranges, extraction, insertion, and page counts.
- 300-DPI default and configurable page rendering, output dimensions, all-page batches, cancellation, and temporary cleanup.
- Compression output validity and size/fidelity reporting without assuming every PDF gets smaller.
- Redaction by reopening output and proving covered text/images cannot be extracted; reject unverified overlay-only implementations.
- Metadata edits and limits, malformed/password-protected PDFs, misleading extensions, collisions, permission failures, and retry behavior.
- Keyboard-only wheel/editor workflows, screen-reader labels, output beside source, and no network calls during normal operation.

Windows and Linux packaging, native file-manager reveal, and real external drag workflows must be tested separately. Automated renderer tests do not prove global drag behavior.

## Implementation sequence

1. Keep existing PDF workspace/backends intact while designing the hidden-host wheel dispatch and capability records.
2. Add the Alt PDF wheel and compact editor shell; implement the five Page Structure actions using verified local routes.
3. Add Export Pages with all-page batching, page ranges, progress, and cancellation.
4. Improve compression controls and validate honest output-size/fidelity reporting.
5. Add metadata editing only for fields with tested write/read-back behavior.
6. Add secure redaction only after the output-verification test proves source content is unrecoverable.
7. Add Shift editable-format routes only after backend isolation, licensing review, and representative fidelity tests; expose warnings before the user commits.
8. Update `docs/CAPABILITIES.md` and `docs/ROADMAP.md` as each route becomes implemented and verified; do not promote proposed routes to supported claims before tests pass.
