# Implementation status and next work

This is a one-session continuation plan. Implemented means code exists; optional tools and tests determine availability on a particular machine. Library support is not automatically an enabled Santara route. The format overview is not a compatibility guarantee.

| Area | Status | Delivered behavior / next implementation |
| --- | --- | --- |
| Built-in raster images | Partial | Sharp-backed JPG, PNG, WebP, TIFF, AVIF conversion and image operations; image tools open a separate local-preview editor with draggable crop handles/presets, resize/fit, rotate/flip, solid/gradient/transparent backgrounds, basic adjustments, compression presets, and metadata stripping. Add richer adjustment controls, metadata inspection/editing, annotation/redaction/collage, local-image backgrounds, and package-level fixture verification. |
| Subtitles | Implemented | SRT/VTT conversion and TXT output. Preserve timing where applicable; styling/settings and TXT timestamps have explicit loss warnings. |
| Archives | Implemented with limits | ZIP/TAR/GZ creation/extraction with mature libraries and bounded resource/path policies. Keep traversal, link, collision, malformed-header, and decompression tests. |
| Audio/video basics | Implemented, optional FFmpeg | Convert, compress, trim, crop, resize, rotate, flip, GIF, audio extraction. Detect required codecs/filters and verify real output with FFprobe. |
| Advanced media | Partial | Add split/merge, frame extraction, stream selection, and advanced codec controls through registry schemas, engine adapters, and `OperationFields`; use generated multi-stream fixtures and assert durations/frame counts. |
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
| Licensing / distribution | Partial | Generated runtime notices, icons, native-library unpacking, CI, and x64 NSIS/deb/AppImage configuration exist. Finish component source/attribution and LGPL replacement verification; test clean-machine installs and signed Windows builds. |

## Next module and test sequence

1. Implement the image wheel architecture in `docs/IMAGE_WHEEL_ARCHITECTURE.md`: immediate conversion dispatch, hidden-host lifecycle, compact tool windows, and image-only fixtures/tests. Finish the current Sharp integration in `electron/images.mjs`, `electron/registry.mjs`, and `electron/engine.mjs` with original generated raster fixtures, invalid/oversized image tests, metadata/transparency assertions, and no-ImageMagick coverage.
2. Run `npm ci`, `npm run typecheck`, and `npm test` sequentially. Record optional-tool skips explicitly. Run `npm run build`, then `npm run test:e2e`, then `npm run test:desktop`; avoid concurrent Playwright report writers.
3. Run `npm run manifest`, `npm run icons`, and `npm run licenses`. Compare the generated capability snapshot with enabled routes and inspect bundled native modules, full notices, source mapping, and replaceable shared libraries.
4. Build `npm run dist -- --linux --x64 --publish never` and Windows NSIS on Windows. Inspect ASAR/unpacked resources and generated notices, then test install/uninstall, native raster conversion, cancellation, output preservation, and upgrade behavior on clean machines. AppImage execution/FUSE validation is separate from building.
5. Extend advanced capabilities one family at a time: registry schema → isolated adapter → engine job/error policy → `OperationFields`/renderer → generated native fixtures → mocked browser flow → packaged smoke run. Never enable a route solely to match a marketing format list.

Final parent update, 2026-10-20: Sharp-integrated Linux artifacts built at approximately 112 MB deb and 142 MB AppImage. Strict source build passed; native/unit tests finished 63 total with 60 passed and 3 optional-tool skips; browser E2E passed 7/7; runtime audit reports zero vulnerabilities. Final packaged smoke is being retried sequentially after a concurrent-runner clipboard race, and AppImage portability remains separately tracked by the parent. These results do not certify signatures, clean-machine execution, or completed LGPL/source review. No production date or format-parity guarantee is implied.
