# Santara Contributor Instructions

## Project scope

- Santara is a Windows x64 and Linux x64 desktop application.
- Keep processing local and offline-first. Never add uploads, accounts, analytics, cloud conversion, or telemetry by default.
- Do not add macOS builds, DMG/PKG packaging, Apple-specific integrations, AirDrop, or iCloud behavior.
- Preserve the original Santara citrus branding and do not copy third-party trademarks, artwork, or proprietary UI assets.

## Architecture

- The desktop host is Tauri 2 with a React/Vite renderer and Rust local services.
- Keep the host available for settings, history, queue management, and accessibility fallback.
- The primary interaction is the global citrus wheel: Shift for conversion, Alt or Ctrl+Shift for tools, and Ctrl for file actions. Keep shortcuts configurable.
- Image conversion should dispatch directly to a local output beside the source when possible.
- Image tools should open compact, non-destructive floating editors and save a new output through the local job system.
- Use the capability registry to determine which operations are shown. Never expose a route solely because a file extension is listed.
- Use the bundled Rust image processor for current raster routes. Optional detected backends such as FFmpeg, Poppler, qpdf, LibreOffice, Pandoc, and ExifTool appear only when capability detection succeeds. Keep codec and metadata limits visible.

## Safety and reliability

- Never execute input files. Treat archives, office files, and media as untrusted.
- Validate signatures and backend support where practical; do not trust extensions alone.
- Prevent archive path traversal and symlink escapes.
- Sanitize output names, use temporary files, and atomically rename successful results.
- Never overwrite source files silently. Respect configured collision handling and preserve originals by default.
- Do not log file contents. Redact paths when diagnostics are copied or privacy settings require it.

## Code and documentation

- Keep changes focused and consistent with nearby code.
- Prefer existing abstractions over new parallel systems.
- Keep user-facing strings localization-ready and keyboard accessible.
- Update `docs/ROADMAP.md`, `docs/CAPABILITIES.md`, and `docs/IMAGE_WHEEL_ARCHITECTURE.md` when behavior or support claims change.
- Keep `resume-from-here.md` current when work is intentionally paused or handed off.
- Do not retain generated artifacts, duplicate handoff notes, or reference assets unless they are used by source, tests, packaging, or active design documentation.

## Validation

Run the narrowest relevant checks first, then broader checks when practical:

```bash
npm run typecheck
npm run test
npm run build
```

For UI changes, also run the relevant Playwright or desktop tests. For packaging changes, validate Linux `.deb`/AppImage builds and Windows NSIS configuration on their native platforms during Phase 8. Do not claim global drag support until it has been manually tested with real Windows and GNOME file-manager drags.

## Platform constraints

- Use XDG-compliant paths on Linux.
- Keep Windows Explorer/file association integration optional and safe.
- GNOME Shell integration is optional; do not make the app unusable without the extension.
- Keep native helper code isolated under its platform-specific directories.
