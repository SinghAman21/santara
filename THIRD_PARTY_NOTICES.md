# Third-party notices

This document summarizes dependency obligations. The exact installed production-dependency inventory and shipped license texts are generated separately from `package-lock.json` into `build/THIRD_PARTY_LICENSES.txt`. Electron Builder includes that file at `resources/licenses/THIRD_PARTY_LICENSES.txt` in the packaged application, supplementing this document and Electron's shipped `LICENSE` and `LICENSES.chromium.html`. The MIT license for Santara does not relicense dependencies.

Run `npm run licenses` to collect the inventory. `npm run dist` runs the collector after the frontend build and before Electron Builder. The collector enumerates installed, non-development lockfile entries, records their actual installed package name/version and declared license, and includes matching LICENSE/LICENCE, COPYING, and NOTICE files. It fails when an inspected installed package has no matching license text. Missing installed package directories are skipped, so a clean lockfile install and a final packaged-dependency comparison remain necessary; generation alone is not proof of complete legal review.

| Component | Expected upstream terms | Release action |
| --- | --- | --- |
| React / React DOM | MIT | Preserve notices for exact installed versions |
| Vite | MIT | Review build tooling and output dependencies |
| Electron | MIT plus Chromium, Node.js, and other third-party terms | Preserve Electron LICENSE and LICENSES.chromium.html and inspect bundled codecs |
| electron-builder | MIT | Review installer tooling and generated artifacts |
| Playwright | Apache-2.0 | Development tooling; browser distributions have additional notices |
| TypeScript | Apache-2.0 | Development tooling |
| Lucide React | ISC plus MIT for Feather-derived icons | Preserve both applicable license notices; see [Lucide license](https://lucide.dev/license) |
| yauzl | MIT | Preserve installed archive-reader and transitive notices |
| yazl | MIT | Preserve installed ZIP-writer and transitive notices |
| tar-stream | MIT | Preserve installed TAR-stream and transitive notices |
| sharp 0.35.5 | Apache-2.0 | Bundled raster engine; preserve Apache license and applicable notices |
| `@img` native packages / libvips 8.18.7 | Package-specific terms including LGPL-3.0-or-later and component licenses | Preserve dynamic-library replacement, corresponding-source access, full license texts, and component-specific attributions |
| Engine libraries added by parent | Version and package dependent | Enumerate from lockfile before release |

Upstream sources: [React](https://github.com/facebook/react/blob/main/LICENSE), [Vite](https://github.com/vitejs/vite/blob/main/LICENSE), [Electron](https://github.com/electron/electron/blob/main/LICENSE), [electron-builder](https://github.com/electron-userland/electron-builder/blob/master/LICENSE), [Playwright](https://github.com/microsoft/playwright/blob/main/LICENSE), [TypeScript](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt).

## Optional external engines

Santara bundles Sharp for offline raster processing, including JPG/PNG without a user-installed ImageMagick executable. Its native `@img` packages include libvips and additional libraries. This is a bundled LGPL shared-library integration, distinct from optional standalone conversion programs. Sharp's [Apache license](https://github.com/lovell/sharp/blob/v0.35.5/LICENSE) does not replace the native packages' terms; the [sharp-libvips component inventory](https://github.com/lovell/sharp-libvips/blob/v1.3.4/THIRD-PARTY-NOTICES.md) lists additional licenses.

The collector now handles `@img/sharp-libvips` packages using their upstream README and `versions.json`, and includes full LGPL-3.0, GPL-3.0, and MPL-1.1 texts from the project's `licenses/` directory. The parent reports `npm run licenses` now passes for all installed production modules. README/SPDX collection is not a substitute for component-specific attribution and corresponding-source review; that review remains a public-release blocker.

## Bundled native-library redistribution

Santara's original application remains MIT licensed; no proprietary restriction is imposed on recipients' library modification or debugging rights. Preserve native notices, full applicable texts, and copyright information. Ship shared libraries unpacked and document how to replace them with interface-compatible modified versions; test this on Windows and Linux. Do not introduce integrity checks, installer terms, or update behavior that prevents the required replacement. Provide installation/relinking information where applicable. See the [LGPL text, especially sections 4 and 6](https://spdx.org/licenses/LGPL-3.0-or-later.html).

Before public distribution, provide matching corresponding source, patches, dependency versions, and build scripts for covered bundled components through a valid distribution method. Put clear source directions beside downloads and maintain availability; an upstream URL alone is not certification that the obligation is met. Source starting points are the [libvips 8.18.7 source tarball](https://github.com/libvips/libvips/archive/refs/tags/v8.18.7.tar.gz), [sharp-libvips 1.3.4 build-script tarball](https://github.com/lovell/sharp-libvips/archive/refs/tags/v1.3.4.tar.gz), and [Sharp 0.35.5 source tarball](https://github.com/lovell/sharp/archive/refs/tags/v0.35.5.tar.gz). These do not by themselves contain every transitive component's corresponding source. Match the final platform package's `versions.json`, preserve other license/patent notices, and publish a complete version-specific source/attribution manifest. LGPL compliance has not been fully certified.

No standalone GPL conversion binaries may be bundled by this scaffold. FFmpeg, ImageMagick, LibreOffice, Ghostscript, archive utilities, and other external programs are not declared bundled dependencies. If an implemented adapter uses one, users install it separately through their operating system or the vendor. Detect availability and version locally and explain missing capabilities. Do not download executables silently or copy system executables into an installer.

FFmpeg licensing depends on build flags and included libraries; Ghostscript commonly carries AGPL/commercial terms; LibreOffice and other tools have their own licenses. External-process integration is not a blanket licensing exemption. Review the actual tool, integration, distribution, patent obligations, and commercial use before release.

## Release checklist

Regenerate the installed production inventory with `npm run licenses` from a clean committed-lockfile install; compare it with the dependencies actually shipped in `app.asar`. Verify `resources/licenses/THIRD_PARTY_LICENSES.txt` exists and is readable in each final installer. Review required source offers and any notices outside the collector's filename patterns, inspect ASAR/unpacked resources for unexpected binaries, and preserve Electron's shipped notices. The generated runtime inventory supplements rather than replaces Electron/Chromium notices or a review of codec, installer, and other redistribution obligations. This Markdown file alone does not satisfy every dependency's redistribution requirements.

Tangerine names and public descriptions belong to their respective owners. No Tangerine code, binaries, icons, screenshots, media, or document fixtures are included by this scaffold.
