# Santara one-session handoff

Proposed project commit: `feat: build Santara local conversion workspace for Windows and Linux`.

## Delivered application

React/Vite provides Converter, Activity, Format library, settings/themes, mixed file selection, registry-driven operations, keyboard navigation, and a post-drop picker. Electron uses `electron/main.mjs` and `electron/preload.cjs` for native access. The engine implements local queues, progress, cancellation/retry, safe output publication, settings, detected optional processors, and bounded built-in archive/subtitle processing.

Sharp 0.35.5 with platform `@img` packages/libvips 8.18.7 supplies bundled raster processing, including JPG/PNG without ImageMagick. Optional FFmpeg, ImageMagick, qpdf, Poppler, and sandbox/self-tested Pandoc enable their detected routes. LibreOffice remains disabled pending isolation. The format library is an overview, not a conversion guarantee; see [ROADMAP.md](ROADMAP.md) for the concrete implemented/partial/unsupported table.

The in-app action wheel and accessible post-drop conversion picker exist. Chromium protects external filenames before the OS drop; Santara selects file-specific routes after drop. Global desktop/tray drop, context-manager/shell integration, and native sharing providers remain pending. Primary strings are centralized, but localization and accessibility audits remain incomplete.

## Verification status

These are distinct reported results, not production certification:

| Check | Latest known result |
| --- | --- |
| Frontend build / typecheck | Final strict source build passed, reported by parent |
| Native/unit suite | Final: 63 tests, 60 passed, 3 skipped for unavailable qpdf, ImageMagick, Pandoc |
| Archives | 15 tests within the suite; do not add this subset to the total |
| Sharp raster tests | Included in the final native/unit suite; packaged UI verification tracked separately |
| Browser E2E | Final: 7/7 passed, including Shift drag/drop |
| Electron 44 packaged smoke | Passed against actual `release/linux-unpacked/santara`; coverage and clipboard boundary below |
| Actual AppImage smoke | Passed with `APPIMAGE_EXTRACT_AND_RUN=1`, including real UI JPG→PNG and resize; FUSE mounting and other distributions remain untested |
| Runtime npm audit | Final parent report: zero vulnerabilities |
| Linux artifacts | Final Sharp-integrated deb ~112 MB and AppImage ~142 MB built, reported by parent |
| Windows signing / clean-machine installs | Not established |
| Release input checker | Passed, reported by parent |

Final packaged native smoke passed against `release/linux-unpacked/santara`: bundled Sharp bootstrap, real UI JPG/PNG conversion and numeric resize, subtitle processing, archive folder/create, copy/move, quick image/PDF preview, collision/retry, and security/network checks. Clipboard coverage defaults to the `writeText` API boundary because an external OS clipboard manager interferes with live clipboard assertions. Set `SANTARA_LIVE_CLIPBOARD=1` for the optional live OS clipboard check; the default pass does not establish that external-manager behavior.

`tests/electron-smoke.mjs` accepts `SANTARA_EXECUTABLE` to exercise a packaged executable. The actual AppImage passed the full smoke sequentially using `APPIMAGE_EXTRACT_AND_RUN=1`. Final artifact SHA256 values and evidence are recorded in `RELEASE_VALIDATION.md`.

Four screenshots exist at `/tmp/santara-home.png`, `/tmp/santara-settings.png`, `/tmp/santara-settings-dark.png`, and `/tmp/santara-dark.png` (1440×1000). Initial dark contrast defects were fixed by the parent; refreshed dark Settings was visually inspected and headings, labels, and branding are readable without obvious overlap. This is not measured contrast or screen-reader certification. Browser reruns stopped to avoid concurrent processes sharing reports.

`docs/capabilities.generated.json` was refreshed after Sharp integration: **40 capability records and 1168 declared route combinations**, including unavailable/wildcard records. This is environment-specific detection, not 1168 verified conversions. Regenerate after registry edits.

## Packaging and licensing

Targets are Windows x64 NSIS and Linux x64 deb/AppImage only. CI uses `npm ci`, typecheck, tests, build, browser installation, icon generation, E2E, native-host packaging, and artifact upload. Linux CI installs optional FFmpeg/Poppler/qpdf for integration tests, without bundling those executables. CI does not launch AppImages/FUSE. Windows signing is a manual dispatch option with `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD`, and forced signing; ordinary builds are unsigned.

Generated icons are `build/icon.png` and `build/icon.ico`. Linux syncs `santara.desktop` naming. `linux.maintainer: Santara contributors` avoids inventing a contact email; replace this development metadata before public release. The reserved homepage `https://example.invalid/santara` is intentionally nonresolving and must be replaced. CI overrides it with the actual current repository URL.

`npm run dist` runs build → licenses → Electron Builder. `scripts/collect-licenses.mjs` inventories actual installed production lockfile packages into `build/THIRD_PARTY_LICENSES.txt`, copied to `resources/licenses/THIRD_PARTY_LICENSES.txt`. Composite `@img/sharp-libvips` metadata includes upstream README/versions and full LGPL-3.0/GPL-3.0/MPL-1.1 texts from `licenses/`. Parent reports collection passes for all installed production modules. Electron's separate LICENSE/Chromium notices remain required.

Santara application code remains MIT; bundled native libraries retain their own terms. Sharp and `@img` are unpacked from ASAR for native loading and shared-library access. **Component-specific attribution, matching corresponding-source distribution, and LGPL library replacement/relinking verification remain public-release blockers.** Full texts and a successful collector do not certify compliance. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for source tarballs and rights-preservation requirements. No standalone GPL/AGPL conversion executables are bundled by this configuration.

## Next session: exact sequence

Code and tests are frozen after the final results above. The sequence below is the continuation/release-verification procedure, not a statement that the already-passed checks remain undone. Both unpacked packaged smoke and actual AppImage extract-and-run smoke passed. Live clipboard-manager compatibility remains separate from the default API-boundary check.

1. Review the completed Sharp integration in `electron/images.mjs`, `electron/registry.mjs`, `electron/engine.mjs`, and `tests/images.test.mjs`. Extend the passing Linux coverage to Windows and additional distributions, preserving decode, transparency, orientation, and metadata guarantees. Readonly Sharp status and About metadata are wired into the UI.
2. Run `npm ci`, `npm run typecheck`, and `npm test` sequentially. Review `tests/archives.test.mjs`, `tests/engine.test.mjs`, `tests/registry.test.mjs`, `tests/subtitles.test.mjs`, and image tests. Record exact pass/skip counts and optional tool versions.
3. Run `npm run build`, `npm run test:e2e`, then `npm run test:desktop`. E2E is `tests/e2e.spec.ts`; native smoke is `tests/electron-smoke.mjs`. Do not run concurrent Playwright report writers. `SANTARA_TEST_PORT` changes preview port; `SANTARA_BROWSER_CHANNEL=chrome` uses installed Chrome.
4. Run `npm run manifest`, `npm run icons`, and `npm run licenses`. Inspect generated routes, notice texts, all platform native packages, and versions. Prepare complete component source/attribution mapping, including patches/build recipes; verify compatible shared-library replacement on both targets.
5. Rebuild Linux with `npm run dist -- --linux --x64 --publish never` and NSIS on Windows with `npm run dist -- --win --x64 --publish never`. Inspect ASAR/unpacked native libraries and notice resources, then test install/uninstall, offline raster conversion, cancellation, output preservation, and upgrades on clean systems. Validate AppImage runtime requirements separately. Configure and verify real Windows signing before calling artifacts signed.
6. Continue advanced work through registry schema → isolated adapter → engine error/output policy → `OperationFields`/renderer → original native fixtures → browser flow → packaged smoke. Priorities and missing features are listed in [ROADMAP.md](ROADMAP.md).

To refresh visuals against a running dev server: `SANTARA_PREVIEW_URL=http://127.0.0.1:5173 node scripts/visual-qa.mjs`; add `SANTARA_BROWSER_CHANNEL=chrome` if needed. `scripts/check-release.mjs` checks basic inputs/metadata only.

No commit or published release was made by this handoff. Tangerine research used public pages only, without binary inspection. Final installer acceptance, signing, source/license review, secure update delivery, and production readiness remain to be established.
