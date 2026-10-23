# Implementation status and next work

The `tauri-rt` migration follows `TAURI_MIGRATION_PLAN.md`. Its bridge, local settings, native drops, and initial Rust image, subtitle, archive, and detected FFmpeg/Poppler/qpdf/Pandoc jobs are in progress; Phase 8 holds the deferred platform validation. Electron remains in this branch until replacement code is ready for Phase 7 cleanup.

This is a one-session continuation plan. Implemented means code exists; optional tools and tests determine availability on a particular machine. Library support is not automatically an enabled Santara route. The format overview is not a compatibility guarantee.

| Area | Status | Delivered behavior / next implementation |
| --- | --- | --- |
| Built-in raster images | Partial | Sharp-backed JPG, PNG, WebP, TIFF, AVIF conversion and image operations; tools open a local-preview editor with fit/zoom/pan, editable final background canvas defaults, editable EXIF date/artist/copyright/description fields, copy-based metadata deletion, and size-checked compression including palette-quantized PNG. Add richer adjustment controls, full metadata inspection, annotation/redaction/collage, and local-image backgrounds. |
| Subtitles | Implemented | SRT/VTT conversion and TXT output. Preserve timing where applicable; styling/settings and TXT timestamps have explicit loss warnings. |
| Archives | Implemented with limits | ZIP/TAR/GZ creation/extraction with mature libraries and bounded resource/path policies. Keep traversal, link, collision, malformed-header, and decompression tests. |
| Video wheel/editor | Implemented, optional FFmpeg | Shift conversion and Alt/Ctrl+Shift capability-gated video tools open a compact local editor with contain-fit preview, timeline, exact trim/split ranges, crop, resize, rotate/flip, speed, compression quality, GIF, audio extraction, mute, snapshots, compatible clip ordering/merge, solid time-ranged redaction, and metadata deletion. Details and limits are in `docs/VIDEO_WHEEL_ARCHITECTURE.md`; validate FFmpeg routes on the installed backend and test with Windows Explorer and GNOME Files drags. |
| Audio wheel/editor | Proposal only | `docs/AUDIO_WHEEL_ARCHITECTURE.md` records reference observations and a proposed editor; do not imply audio editor support. Existing audio backend capabilities are detected independently. |
| PDF structural operations | Implemented, optional qpdf | Compression, page extraction, merge, rotation. Test page counts, ordering, collisions, encrypted input, and metadata limits. |
| PDF rendering | Partial, optional Poppler | Single selected page, default 300 DPI. Add bounded all-pages output sets and cancellation/cleanup; test page counts and dimensions before enabling batch rendering. |
| PDF reconstruction / OCR | Unsupported | Select isolated OCR and office-reconstruction adapters, define fidelity/language limits, and add original scanned/layout fixtures. Do not claim editable-office parity from raster output. |
| Documents | Implemented conditionally | Pandoc routes require sandbox and reader/writer self-tests. Verify external-resource blocking, size limits, and format-specific fidelity. |
| Office / spreadsheets / slideshows | Disabled | Isolate LibreOffice macros, subprocesses, profiles, and external resources; add bounded execution and representative original fixtures before registry enablement. |
| SVG / HEIC | Backend dependent or disabled | SVG is disabled pending external-resource isolation. HEIC needs a detected reader/writer and codec/license review; do not infer support from Sharp's general documentation. |
| RAR / 7z | Unsupported | Choose a reviewed licensed adapter, add sandbox/resource/path policy and malformed fixtures before exposing routes. |
| EPUB validation / password archives | Unsupported | Add explicit validation/encryption capabilities and safe credential handling; never log passwords. Test malformed EPUBs and encrypted/archive failure paths. |
| Desktop workflow | Partial | Global citrus wheel and hidden Electron host are implemented. Image tools open separate compact windows; image conversion queues without opening a dashboard and reports completion locally. Global drag handoff, shell/context-manager integration, and native sharing providers still need OS-specific validation. |
| Accessibility / localization | Partial | Basic keyboard picker, navigation, focus handling, and centralized primary strings exist. Audit screen readers, focus restoration, contrast, scaling, and all hardcoded detail strings. |
| Licensing / distribution | Partial | Generated runtime notices, icons, target-specific x64 Sharp packaging checks, CI, and NSIS/deb/AppImage preview artifacts exist. Finish component source/attribution and LGPL replacement verification; test clean-machine installs and signed Windows builds. Native ARM and 32-bit packages require separate implementation and validation. |

## Next module and test sequence

1. Run `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, and `npm run test:desktop` sequentially; record optional FFmpeg/FFprobe skips explicitly.
2. Test the video wheel/editor through actual native file-manager drags on Ubuntu and Windows. Confirm each displayed operation is backed by detected FFmpeg/FFprobe support and inspect resulting media streams/metadata.
3. Run `npm run manifest`, `npm run icons`, and `npm run licenses`. Compare enabled routes with the machine-readable capability manifest and finish component attribution/license review.
4. Build Linux deb/AppImage and Windows NSIS on native CI runners. Test install/uninstall, output preservation, cancellation, reveal behavior, and clean-machine operation; AppImage portability and Windows signing remain separate release checks.
5. Implement the audio editor only after its proposal in `docs/AUDIO_WHEEL_ARCHITECTURE.md` is reviewed. Never expose a route solely to match a reference or format list.

Final parent update, 2026-10-20: Sharp-integrated Linux artifacts built at approximately 112 MB deb and 142 MB AppImage. Strict source build passed; native/unit tests finished 63 total with 60 passed and 3 optional-tool skips; browser E2E passed 7/7; runtime audit reports zero vulnerabilities. Final packaged smoke is being retried sequentially after a concurrent-runner clipboard race, and AppImage portability remains separately tracked by the parent. These results do not certify signatures, clean-machine execution, or completed LGPL/source review. No production date or format-parity guarantee is implied.

Current update, 2026-10-21: Video wheel/editor implementation is present. `npm run typecheck`, `npm test` (142 passed, 4 optional-backend skips), `npm run build`, `npm run test:e2e` (17/17), and `npm run test:desktop` passed. FFmpeg integration verifies video split/merge, speed, mute, snapshots, and time-ranged solid redaction. Manual Explorer/GNOME drag tests and native Windows packaging/signing remain outstanding.
