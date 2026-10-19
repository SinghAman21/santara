# Testing strategy

Run `npm run typecheck`, `npm run test`, and `npm run build`, then `npx playwright install --with-deps chromium` and `npx playwright test`. Playwright starts Vite preview at `127.0.0.1:4173`; the frontend build must already exist. Strict port binding and no server reuse prevent accidentally testing an unrelated application. CI runs these checks before packaging.

`tests/e2e.spec.ts` uses a deterministic preload mock injected before application code. It must be aligned with the final parent bridge and accessible UI labels. Tests cover the initial empty view, navigation/settings, and keyboard activation. No real conversion, system processor, native file picker, or privileged IPC is exercised. No third-party media fixtures are needed.

The expanded six-test suite covers empty rendering, Settings → General/theme and sections, Add files with synthetic metadata, mixed and per-file routes, unavailable routes, keyboard picker arrows/Escape/Ctrl+K, operation submission, queue cancellation/failure/retry/completion events, and external network requests. The network test removes the mock bridge to exercise the real browser fallback. All other privileged operations are mocked. These tests make no universal network/privacy claim for native tools.

Use `SANTARA_BROWSER_CHANNEL=chrome` for installed Google Chrome when downloaded Playwright Chromium is unavailable. `SANTARA_TEST_PORT` selects a different preview port. Avoid concurrent test processes sharing `test-results` or the HTML report directory. The visual QA script captures actual browser preview screenshots in `/tmp` at 1440×1000; start a preview server first or set `SANTARA_PREVIEW_URL` to the current dev URL.

Keep tests outcome-focused and fail on renderer exceptions. Do not skip tests merely because a selector or bridge contract changed; update them against the reviewed interface. Traces/screenshots on failure may contain paths or filenames, so use synthetic data and inspect artifacts before sharing.

Separate native validation must cover packaged renderer loading, preload availability, dialogs and drag/drop paths, input validation, actual engine output signatures/content, missing dependencies, malformed files, cancellation, collisions, cleanup, and install/uninstall. Generate small original images, text, and archives for integration tests rather than copying vendor demos. Validate representative Windows and Linux environments with and without optional engines.

This scaffold does not establish a passing run until dependencies and the parent application are present and the commands have actually completed.

## Scaffold validation record

On 2026-10-19, both YAML files parsed successfully, target assertions confirmed Windows x64 NSIS and Linux x64 deb/AppImage, and `node --check scripts/check-release.mjs` passed. `playwright test --list` discovered all four Chromium tests. A separate strict TypeScript invocation covering `playwright.config.ts` and `tests/e2e.spec.ts` passed. Discovery initially needed permission for Playwright's temporary transform cache; the approved retry passed.

Full browser execution, native packaging, and signing were not established by those checks. At that point the parent UI/build was still being written. Re-run the complete documented commands after parent integration.

Later on 2026-10-19, `npm run build` passed and the expanded suite passed **6/6 tests in 9.2 seconds** with installed Google Chrome on a separate preview port. The initial downloaded-Chromium run could not launch because revision 1248 was not yet installed. Initial Chrome runs identified ambiguous filename selectors, which were fixed. Concurrent runs sharing report output also conflicted; the parent owns the final sequential run after all edits. The network test was subsequently tightened to remove the mock bridge, so confirm that final revision in the parent's final run.

Four 1440×1000 screenshots were generated: `/tmp/santara-home.png`, `/tmp/santara-settings.png`, `/tmp/santara-settings-dark.png`, and `/tmp/santara-dark.png`. Initial inspection found dark-mode root color/background contrast defects; the parent fixed those and fresh captures were requested. Native Electron 44 smoke success and zero npm-audit findings were reported by the parent; they are separate from this browser run and must be checked against the final lockfile. No Windows installer execution, signing, or complete Linux installer acceptance is inferred.

Fresh captures completed after the theme fix, and the dark Settings screenshot was inspected: headings, labels, and branding are readable and controls do not obviously overlap at the requested viewport. This is visual QA rather than measured contrast compliance. Final script syntax and strict TypeScript checks passed after the network-test refinement. The parent owns the remaining sequential browser run and installer validation.

Latest parent-reported results: **48 native/unit tests, 45 passed and 3 skipped** (qpdf, ImageMagick, Pandoc unavailable); the archive subset contains 15 tests. Parent final E2E: **6 passed**. Electron 44 native smoke passed. Built-in Sharp raster tests using original generated images are being added; do not treat the preceding count as their final result or add subset counts to the total. Initial Linux deb/AppImage builds exist, but a final rebuild after Sharp integration and installed-package verification remains pending.

2026-10-20 update: latest parent native/unit count is **63 total, 60 passed, 3 skipped**, pending final numeric confirmation. The native smoke script is being extended to exercise Sharp through the actual UI. E2E now contains a seventh test for Shift drag/drop: a locally generated dummy File/DataTransfer triggers the in-app overlay, verifies no bridge inspection before drop, then uses mocked inspected files to assert post-drop picker and per-file route filtering. The dummy content is not decoded as an image and no native drag support is inferred. The previous six tests passed; the new test/suite has not been run here, at the parent's request.

## Final reported results — 2026-10-20

This summary supersedes the earlier chronological counts. The parent reports the strict source build passed, **63 native/unit tests: 60 passed and 3 skipped**, and **E2E 7/7 passed**, including Shift drag/drop. The skips are optional qpdf, ImageMagick, and Pandoc checks. Runtime npm audit reports **zero vulnerabilities**.

Final Sharp-integrated Linux artifacts were built: approximately **112 MB deb** and **142 MB AppImage**. Building these artifacts does not establish installation, portability, or signature verification. Final packaged native smoke is being retried sequentially after concurrent smoke runners raced over the shared clipboard; this was not established as a product defect. AppImage extract-and-run portability may be checked by the parent and remains unreported here. Code/tests are frozen; the parent owns the final packaged release result.

Final packaged update: native smoke **passed** against `release/linux-unpacked/santara`, covering bundled Sharp bootstrap, actual UI JPG/PNG conversion and numeric resize, subtitle processing, archive folder/create, copy/move, quick image/PDF preview, collision/retry, and security/network checks. The release-input checker also passed. Clipboard defaults to a `writeText` API-boundary assertion because an external OS clipboard manager interferes; `SANTARA_LIVE_CLIPBOARD=1` enables the separate optional live clipboard check. `SANTARA_EXECUTABLE` selects the actual packaged executable. The parent is running the AppImage sequentially with `APPIMAGE_EXTRACT_AND_RUN=1`; no result is claimed yet. Artifact SHA256 values will be recorded by the parent in its validation document.
