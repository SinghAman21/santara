# Development build validation — 2026-10-20

This records observed development results on this Linux x64 host. It does not certify production readiness or Windows support on real hardware.

| Check | Result |
| --- | --- |
| TypeScript and Vite production build | Passed |
| Unit/local integration suite | 63 tests: 60 passed, 3 skipped |
| Optional-engine skips | ImageMagick, qpdf, sandboxed Pandoc absent on this host |
| Chromium browser E2E | 7 passed, including mixed selections, modifier drag/drop, operation submission, cancellation/retry UI, keyboard picker, settings, and no external preview requests |
| Packaged Linux application smoke | Passed using `release/linux-unpacked/santara` |
| Native image workflow | Real JPG → PNG and resize through the packaged UI; sharp/libvips detected without ImageMagick |
| Other native smoke coverage | Subtitle conversion, archive creation including folders, confirmed copy/move, image and PDF Quick Preview, collision retry, isolated preload, blocked external renderer requests |
| Clipboard smoke | Electron `writeText` boundary checked; default does not change the user's clipboard. Live OS clipboard persistence was not established because this desktop's clipboard manager interfered with automated writes |
| Runtime npm audit | Zero reported vulnerabilities |
| Runtime notices collection | Passed; native composite component/source review remains required |
| Linux `.deb` and `.AppImage` creation | Passed; Debian metadata inspected |
| Actual AppImage launch and conversion | Passed the full native smoke with `APPIMAGE_EXTRACT_AND_RUN=1`; no FUSE mount required on this host |
| Debian install/uninstall | Not performed |
| Windows NSIS build/install/signing | Configuration and CI provided; not executed on this Linux host |

All fixtures are generated from original text, synthetic pixels, tones, video test sources, or minimal generated PDFs and archives. Browser tests mock privileged APIs; they do not prove native conversion behavior. Representative native tests do not verify every declared format combination.

The detected snapshot has 40 capability records and 1168 declared combinations, including unavailable and wildcard records. This is not a count of verified conversions.

## Artifacts

- `release/Santara-0.1.0-linux-amd64.deb` — SHA256 `ca65e05a0368d794a2d2d26d3c8bdc8242d2daaa3cbfc0096f083609f7f3aaab`
- `release/Santara-0.1.0-linux-x86_64.AppImage` — SHA256 `417de9c7525f79be2a5b3d6c2df612d246ae8f5d341b91a99f2e03cfefaff5d1`

These are unsigned development artifacts, built with reserved placeholder homepage and development maintainer metadata. Replace metadata and complete the release/licensing and platform checks in `HANDOFF.md` before public distribution. Hashes apply only to these exact files and must be regenerated after any rebuild.

## Repeat native validation

Run `npm run build`, then `npm run test:desktop`. For a packaged application, set `SANTARA_EXECUTABLE` to its absolute executable path before invoking `node tests/electron-smoke.mjs`. Run these checks sequentially; shared desktop integration checks and test reports are not safe to run concurrently.

`SANTARA_LIVE_CLIPBOARD=1` opts into real OS clipboard testing, with restoration in cleanup. Use it only in a controlled desktop test environment. Default smoke checks the native clipboard API call boundary without modifying global clipboard state.

The actual AppImage passed the same native smoke in extract-and-run mode. FUSE mounting, additional distributions, and clean-machine installer acceptance remain separate checks.
