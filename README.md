# Santara

Santara is a desktop file-conversion workspace being developed for Windows x64 and Linux x64. It uses a React/Vite interface and an Electron host. Feature availability depends on the implemented engine and locally installed optional tools; a visible option is not evidence that a conversion works.

The application includes a local queue, detected capability registry, native bridge, settings, and accessible file-operation picker. It remains a development preview. No signed installer, universal format support, or production readiness is claimed here.

Raster conversion is bundled through Sharp/libvips, so JPG/PNG workflows do not require a separately installed image engine. Built-in subtitle and constrained ZIP/TAR/GZ processing are also available. FFmpeg, ImageMagick, qpdf, Poppler, and Pandoc remain optional system tools for their detected routes. See the [implementation status and next steps](docs/ROADMAP.md) for supported, partial, disabled, and unsupported capabilities.

## Development

Install Node.js 22 and npm, then run `npm ci`, `npm run typecheck`, `npm run test`, and `npm run build`. Run `npm run desktop` for Electron or `npm run dev` for the restricted browser preview. Project status and remaining production requirements are in the [roadmap](docs/ROADMAP.md).

Run `npx playwright install --with-deps chromium` once, then `npx playwright test` for browser smoke tests. These use the Vite preview and a mock preload bridge, not a live Electron process. See [testing](docs/TESTING.md).

## Packaging

Generate icons once with `npm run icons` after installing Playwright Chromium. Run `npm run dist -- --win --x64 --publish never` on Windows, or `npm run dist -- --linux --x64 --publish never` on Linux. Expected outputs are an NSIS installer, a Debian package, and an AppImage in `release/`. CI builds are unsigned by default. A manually dispatched signing build requires certificate secrets and fails if signing is unavailable. No macOS, ARM, RPM, portable Windows, or store targets are configured.

See [build and signing](docs/BUILD.md), [architecture](docs/ARCHITECTURE.md), [capabilities and public sources](docs/CAPABILITIES.md), [image-wheel architecture](docs/IMAGE_WHEEL_ARCHITECTURE.md), and [roadmap](docs/ROADMAP.md).

Santara has no affiliation with Tangerine. Public product research informs requirements, not a claim of implementation parity. Original Santara code is offered under [MIT](LICENSE); dependency obligations are separate and tracked in [third-party notices](THIRD_PARTY_NOTICES.md).

`npm run licenses` generates the installed production dependency/license inventory at `build/THIRD_PARTY_LICENSES.txt`. Packaging runs it automatically and includes the text in `resources/licenses/THIRD_PARTY_LICENSES.txt`, supplementing Santara's notices and Electron's shipped license files.

Linux development `.deb` and `.AppImage` artifacts have been built. Windows signing, clean-machine installation, and remaining feature/release requirements are not complete; see the [roadmap](docs/ROADMAP.md).
