# Santra EPUB Wheel Architecture

## Status and scope

EPUB is treated both as a document format and as a distinct book-conversion route. Current EPUB input/output is conditional on the sandboxed Pandoc reader/writer self-tests; the route is not a guarantee of EPUB conformance. A dedicated EPUB validator is not currently claimed. See `docs/DOCUMENT_WHEEL_ARCHITECTURE.md` for general text-document routes.

## Modifier and interaction model

- **Shift — Convert:** show verified EPUB input/output formats based on the selected file and locally detected reader/writer pairs.
- **Alt — Tools:** no book-editing tools are in initial scope. EPUB validation may appear later only when a local validator is detected and integrated; never show it as available based on a plan alone.
- **Ctrl — File actions:** Copy, Move, Copy Path, Open Terminal, Share where available, and Quick Preview.

The wheel uses visible, labeled output formats and keyboard navigation. For a single EPUB, the Shift wheel prioritizes meaningful routes such as DOCX, HTML, Markdown, and TXT only when verified. For multiple files, show common routes or disclose safe partial-batch behavior. Do not open the full workspace for a simple conversion.

## EPUB conversion behavior

Candidate routes include EPUB → DOCX, HTML, Markdown, or TXT and DOCX/Markdown/HTML/TXT → EPUB when the backend has tested support. The capability registry, not this candidate list, determines which routes are available. Do not offer PDF conversion under this wheel; PDF behavior belongs to the PDF architecture and needs its own verified route.

For EPUB output, preserve structural navigation, headings, links, images, and metadata only to the extent verified by the installed backend. An options sheet may expose book title/author metadata, language, and table-of-contents depth only when the route supports those fields. Do not fetch remote images, stylesheets, fonts, or linked resources. Show a warning when content may be omitted or reflowed.

For EPUB input, distinguish text extraction from preservation of chapters, images, styles, navigation, and cover art. TXT and Markdown may lose styling and book navigation. DOCX reconstruction is best effort and should not imply page-layout equivalence.

## Local output and validation

Run conversions locally with the verified sandboxed backend. Validate that output is a parseable EPUB package and reject missing required structure; do not call it standards-compliant until a real local validation tool is integrated and passes. Use a temporary output, atomic publish, `filename-converted.epub` naming, and collision-safe behavior. Preserve the source and provide progress, retry, Open, and Reveal in File Manager.

Password/encryption support is not assumed. If the backend cannot safely process a protected EPUB, show a clear unsupported/password-protected error and never persist credentials in history or logs.

## Capability and safety requirements

Each registry route records input/output, reader/writer and version, sandbox status, resource limits, metadata/navigation behavior, validation method, batch support, fidelity warnings, and test fixture. Treat EPUB as an untrusted archive: reject traversal paths, unsafe links, oversized entry counts/expanded sizes, malformed containers, and external resource fetches. Never execute active content or send files to an online converter.

## Verification plan

- Use original, permissively licensed EPUB fixtures with multiple chapters, navigation, metadata, links, images, and CSS.
- Verify archive safety, parseable package structure, chapter order, links, embedded media policy, and output naming.
- Test round trips without requiring byte-identical results; assert documented content and structure properties instead.
- Cover malformed packages, traversal entries, external resources, oversized expansion, encrypted input, missing Pandoc/sandbox/validator, cancellation, collisions, and no network calls.
- Test wheel keyboard access and native file-manager reveal on Windows and Linux.

## Implementation sequence

1. Keep current Pandoc routes conditional and confirm generated EPUBs with a real parser/validator fixture suite.
2. Document route-specific navigation, metadata, image, and layout fidelity.
3. Add EPUB validation as a separate capability after dependency/license review and local integration.
4. Expand EPUB metadata, cover, language, and TOC controls only where read-back tests verify them.


## UI source migration (Penpot frame 07)

Frontend ownership now follows `src/tools/<family>`, `src/convert/<family>`, `src/action`, and `src/common`. See [UI structure](UI_STRUCTURE.md) for exact files and implemented/deferred frame coverage. Editors use white surfaces and `#ff5a00` accents; shortcuts remain configurable. This UI migration does not enable any additional backend route or certify proposed features above.
