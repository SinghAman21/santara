# Santra Presentation Wheel Architecture

## Status and scope

Presentation conversion is a proposal; LibreOffice is probed, but office conversion is currently disabled pending safe subprocess isolation. No PPT/PPTX conversion route should be shown until the chosen backend, isolation policy, and each route have passed fixture tests. PDF-to-PPTX reconstruction belongs to the PDF architecture and must be labeled fidelity-limited.

Candidate inputs are PPT and PPTX. Candidate outputs are PDF and per-slide PNG/JPG. PPT is legacy and must be enabled only when a verified local reader is detected. Never claim a PDF-to-PPTX result is equivalent to the original deck.

## Modifier and interaction model

- **Shift — Convert:** show verified output formats for the selected presentation. Include PDF and slide images only when the local route is enabled.
- **Alt — Tools:** no additional presentation editor is in scope initially. A dedicated export-options window may appear after selecting an enabled route, not as a nonfunctional tool slice.
- **Ctrl — File actions:** Copy, Move, Copy Path, Open Terminal, Share when available, and Quick Preview.

Show labeled format slices, retain pointer-near wheel placement, and support keyboard navigation. A mixed batch should show common routes, with clear partial-application messaging when safe. Selecting a route opens only a compact options sheet when configuration is needed; otherwise queue directly.

## Conversion behavior

### Presentation to PDF

Export all slides by default. Use a compact options sheet for slide range, page sizing, notes/handouts only if the backend truly supports them, and font/resource warnings. State that substitutions may change line breaks, transitions, animations, media playback, or layout. Never silently execute embedded macros or fetch external links.

### Presentation to images

Allow PNG or JPG, slide range or all slides, output DPI/dimensions where supported, and background behavior. Show expected output count and names such as `deck-slide-001.png`. For large decks, render bounded batches with per-slide progress, cancellation, cleanup, and retry for individual failed slides.

Do not produce a rasterized file under an editable presentation output label. If conversion uses a lossy or rasterized intermediate, disclose it before processing.

## Local processing and output

Use a local, detected backend only; no online conversion service or upload fallback. Keep source files unchanged. Default outputs beside the source, with `filename-converted.ext` or a numbered slide pattern, collision-safe naming, temporary files, and atomic publication. Completion reports the final path and offers Open and Reveal in File Manager without opening the full workspace.

Office inputs are untrusted. Run conversion with an isolated temporary profile and bounded CPU, memory, time, and output size. Disable macro execution and external-resource loading. If these boundaries cannot be enforced, keep the route unavailable.

## Capability registry

Each route records accepted formats and signatures, backend/version, output, slide range and resolution options, batch support, metadata behavior, fidelity warning, resource limits, and test fixture. Runtime detection must verify the specific import/export filters and rendering support; a generic LibreOffice version check is not enough to enable every route.

## Verification plan

- Use generated or openly licensed decks with text, images, tables, charts, fonts, and varied slide dimensions.
- Verify slide count/order, output parseability, image dimensions, selected ranges, naming, and known fidelity changes.
- Test PPT and PPTX independently; include malformed, encrypted, macro-enabled, external-link, and missing-font fixtures.
- Test cancellation, disk/permission failures, collisions, resource limits, per-slide retry, and no-network operation.
- Test keyboard-only wheel and option flow, output beside source, and Reveal in File Manager on Windows and Linux.

## Implementation sequence

1. Define isolated local conversion execution and per-filter detection before enabling LibreOffice.
2. Implement PPTX-to-PDF with fixture coverage and explicit fidelity disclosure.
3. Add slide-to-PNG/JPG batch export with page-range selection, progress, and bounded rendering.
4. Enable legacy PPT only after independent route verification.
5. Keep PDF-to-PPTX best-effort reconstruction separate and disabled until a local, tested backend exists.

