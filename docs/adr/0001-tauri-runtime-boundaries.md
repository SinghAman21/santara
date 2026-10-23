# ADR 0001: Tauri runtime boundaries and Phase 0 baseline

Status: accepted for implementation on `tauri-rt`, 2026-10-23. This decision does not authorize Electron cleanup or claim Tauri parity.

## Decision

Keep the Electron application and `npm run dist` operational while an isolated Tauri 2 host is built. The existing `src/types.ts` `Bridge` interface is the renderer-facing compatibility contract. A Tauri adapter will implement that interface, with Rust commands and events scoped to named windows. The renderer must not import Tauri APIs outside the adapter. The Rust host owns validation, capability detection, jobs, local file access, and window lifecycle. No Node sidecar, upload service, account, telemetry, or macOS target is part of this migration.

Use Rust bindings to libvips for the primary local raster pipeline, with libvips and its codec libraries packaged and attributed per target. This is a selected implementation direction, not a support claim: image input/output formats are enabled only after runtime probes and format parity tests. `libvips-dev` is required on the Linux build host and is missing as of this audit. Check Rust binding maintenance, Windows binary provenance, transitive codec licenses, and redistribution notices before a release build. Existing Sharp remains in Electron until Tauri image parity passes. Optional FFmpeg, Poppler, qpdf, LibreOffice, Pandoc, ImageMagick, and archive backends stay capability detected; no arbitrary executable path reaches a job command without explicit local settings confirmation and validation.

Set Windows `webviewInstallMode` to `offlineInstaller` for the Tauri installer so installation does not fetch WebView2. The documented ~127 MB increase is a Tauri documentation estimate, **not** a Santara measurement. Linux `.deb` declares the system WebKitGTK 4.1 dependency; the AppImage's library inclusion and portability must be measured and tested on a clean Ubuntu LTS installation. The system WebView is a runtime dependency on both platforms.

## Electron responsibility inventory

| Existing owner | Responsibilities to replace or retain |
| --- | --- |
| `electron/main.mjs` | Single-instance and open-with queue, XDG user data, settings validation, inspected-file allowlist, job persistence and notifications, IPC sender checks, trusted navigation/session, tray, shutdown, window lifecycle, pointer positioning, watcher protocol, wheel state. |
| `electron/preload.cjs` | Narrow `window.santara` methods and four event subscriptions. `webUtils.getPathForFile` is the current drag file path handoff. |
| `electron/integrations.mjs` | Atomic JSON store, known-path checks, dialogs, open/reveal, clipboard, terminal, copy/move, and quick preview. |
| `electron/engine.mjs` | Signature checks, file inspection, queue/cancel/retry, output naming and atomic publication, external-process runner. |
| `electron/registry.mjs` | Backend probes and capability routes; availability depends on tested encoders, decoders, filters, and local tools. |
| `electron/images.mjs` | Sharp/libvips raster conversion, bounded preview, orientation, metadata and editor recipes. |
| `electron/previews.mjs` | Bounded local media/PDF preview, opaque URL tokens, range handling, subprocess snapshots. |
| `electron/archives.mjs` | ZIP/TAR/GZIP create/extract with entry, size, traversal and link limits. |
| `electron/media.mjs`, `electron/subtitles.mjs` | FFmpeg argument construction and subtitle parsing/serialization. |
| `native/windows/` | User-mode drag/modifier watcher; JSON lines with `show`, `move`, `hide`, mode and screen coordinates. It does not own dropped file payloads. |
| `linux/gnome-extension/` | Optional GNOME 46/50 XDND/modifier observer and single-instance CLI trigger. It does not own dropped file payloads. Current XWayland assumptions must be retested under WebKitGTK. |
| `src/main.tsx`, `src/App.tsx`, `src/GlobalWheelWindow.tsx`, `src/ImageToolHost.tsx`, `src/VideoToolHost.tsx` | React entry and workspace, transparent wheel, floating image editor, floating video editor. `src/PdfWorkspace.tsx` is an in-workspace PDF surface. |
| `src/bridge.ts`, `src/types.ts` | Browser fallback and typed renderer bridge; the Tauri adapter must preserve this interface. |

## Stable command and event interface

The Phase 1 shell exposes only a versioned `runtime_info` command and `runtime://ready` event. Phase 2 implements the methods below with the request/result shapes in `src/types.ts`; Rust uses Serde structures with explicit fields and checked enums, and the adapter translates between camelCase JS and Rust names. The `Bridge` shape is the interface shared by all windows, not an authorization grant.

| Command group | Bridge calls | Ownership and checks |
| --- | --- | --- |
| Snapshot and selection | `bootstrap`, `addFiles`, `addFolder`, `droppedFiles`, `inspectPaths` | Host inspects regular files, signatures and canonical paths; maximum 1,000 drop paths and 10,000 selected entries. Drop paths come from a native verified drop event, not arbitrary JavaScript `File.path`. |
| Jobs | `enqueue`, `cancel`, `retry` | Host looks up inspected file IDs/paths, validates capability and options, uses bounded workers and private temporary outputs, and publishes atomically with collision policy. |
| Preferences and destinations | `saveSettings`, `pickOutput` | Host validates every key; backend override paths require explicit confirmation; Linux paths use XDG locations. |
| File actions | `reveal`, `openOutput`, `fileAction` | Only inspected files or published outputs; symlinks and network paths remain rejected; terminal launches have a fixed approved program policy. |
| Previews and editors | `preview`, `imagePreview`, `openImageTool`, `imageToolContext`, `applyImageTool`, `closeImageTool`, `videoToolContext`, `applyVideoTool`, `closeVideoTool` | Context and apply/close calls are checked against the invoking window label and current editor session. Recipes are revalidated by Rust. |
| Wheel | `finishGlobalWheel`, `selectGlobalOperation` | Window/selection/capability checks run in Rust before dispatch. |

Events preserve the adapter callback signatures: `santara:update` (`Partial<Snapshot>`), `santara:wheel-mode` (`{mode,newDrag}`), `santara:global-operation` (selected operation request), and `santara:global-page` (`converter` or `activity`). Rust emits to the intended window label; subscriptions are removed on unmount/close. No broad filesystem or shell plugin permission is granted to renderer windows. The Tauri capability configuration must enumerate window labels and the minimum command/plugin permissions. Inputs are untrusted regardless of window origin.

## Phase 0 environment and baseline

Audited on Ubuntu 26.04.1 LTS x64. Rust 1.93.1, Cargo 1.93.1, Node 22.22.1, GTK 3.24.52, WebKitGTK 4.1 2.52.6, Ayatana AppIndicator 0.5.94 and librsvg 2.61.3 are installed. Wine 10 and MinGW x64 are available. `patchelf`, `libvips-dev`, and `xvfb` are absent; the user will install them, without this agent invoking sudo. `rustup` is absent; installed Rust target management and native Windows builds need separate verification. Existing GitHub Actions uses `windows-latest` and `ubuntu-22.04` for Electron; it is a build host scaffold, not Windows 10/11 manual acceptance.

Measured existing Electron artifacts with `stat -c %s` and `du -sb` (bytes):

| Artifact | Download bytes | Unpacked directory bytes |
| --- | ---: | ---: |
| Windows NSIS `.exe` | 121,836,473 | 444,821,496 (`release/win-unpacked`) |
| Linux `.deb` | 109,992,872 | 354,221,195 (`release/linux-unpacked`) |
| Linux AppImage | 140,138,147 | 354,221,195 (`release/linux-unpacked` proxy) |

The Linux deb declares `Installed-Size: 346121` KiB. The unpacked folders are **proxies**, not measured installed footprints. Phase 6 must install each Tauri artifact on its native target and measure installed bytes (including WebView policy effects) separately. No Tauri size figure is measured yet.

`npm run typecheck` and `npm run build` pass. `npm run test` failed at the `engine` and `previews` file level; both pass when run individually. A second combined run with `--test-concurrency=1` failed at the same two file levels, so this is a combined-suite reliability issue, not yet explained by concurrency. Existing tests cover engine, images, media, archives, previews, registry, subtitles, browser UI, and Electron smoke. Global drags from real Windows Explorer and GNOME Files are explicitly unverified in `resume-from-here.md`.

## Gate and open evidence

The scope, typed interface, current dependencies, size method, and build-host limitations are recorded here and in `docs/TAURI_PARITY_MATRIX.md`. Electron files remain untouched. Phase 1 implementation may begin after these decisions are reviewed in the integrated tree. Its platform smoke gate remains open until Windows 10/11 native and Ubuntu LTS tests pass; Wine is only a build/protocol aid. Phase 7 cleanup remains forbidden until the full native release gates pass.

Tauri references: [Linux prerequisites](https://tauri.app/start/prerequisites/), [commands](https://tauri.app/develop/calling-rust/), [Windows WebView2 installer modes](https://tauri.app/distribute/windows-installer/).
