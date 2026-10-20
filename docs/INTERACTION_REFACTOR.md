# Santara interaction refactor

## Reference and design boundary

The user-provided images in `reference-tools/` show distinct conversion and tool wheels for images, video, audio, PDFs, documents, slides, spreadsheets, EPUB, subtitles, and archives. Each wheel has labelled segments surrounding a central selection label, with the hovered segment highlighted. The public feature page describes a modifier-triggered wheel that remains open after key release. The public `/tools` text response only confirms local processing; it does not establish proprietary editor internals. Santara's editor layouts and implementation are original designs for Windows and Linux.

## Interaction

- Drag a file into the app and hold Shift, Alt, or Ctrl to open the relevant citrus wheel. The wheel anchors near the cursor so the pointer can travel into its segments.
- Release the modifier to keep the wheel open. Hover a slice, then drop. A conversion queues directly; a tool opens the operation settings panel, or the PDF workspace for PDF tools.
- Files already in the workspace can also be dragged. The Convert, Tools, and File actions buttons open the same wheel with an accessible operation list.
- Enter opens the picker; arrow keys navigate segments or list entries; Enter chooses; Escape cancels. Modifier keys switch operation groups inside the picker.
- Mixed selections display how many files a route supports. Incompatible files are recorded as skipped by the queue.
- Chromium can expose MIME hints during an external drag but protects filenames and paths until drop. MIME-based suggestions are validated after drop. Unknown types use an inspect-after-drop fallback.

## Global desktop wheel prototype

- **Windows:** `native/windows/drag_watcher.cpp` observes drag threshold, modifier state, and pointer position with user-mode Win32 hooks. `electron/main.mjs` converts its JSON events into a transparent topmost Electron overlay; the overlay itself must receive the OLE drop. Build the hook from a Visual Studio Developer PowerShell with `npm run build:windows-hook`. The build is automatically attempted by `npm run desktop` and `npm run dist` on Windows.
- **Ubuntu GNOME/Wayland:** `linux/gnome-extension/` observes Shell XDND motion and modifier state, then invokes the running app with dedicated `--santara-*=` switches only when showing/changing or hiding the wheel. Both the packaged desktop entry and extension command pass `--ozone-platform=x11` before Electron startup; the in-app `appendSwitch` was too late. Linux placement uses Electron's XWayland pointer coordinates. A cold wheel launch keeps the main window hidden during the drag, then reveals it at drag-end as a fallback if the compositor did not route the drop to the overlay. Install the package and extension, log out/in, and test the live drag flow.
- Both adapters keep the wheel open after modifier release and dismiss it when the drag ends. GNOME anchors at the pointer where the modifier opens the wheel; it does not repeatedly launch the app to follow pointer motion. Mode changes re-anchor at the current pointer. Each new drag clears prior file hints and slice choices.
- The app only trusts file paths obtained from Electron's dropped `File` objects, inspects them locally, and validates tool/capability compatibility before dispatch. The extension and Windows hook do not inspect file contents or paths.
- This is an experimental cross-platform prototype, **not yet proven reliable** for an in-progress system drag. The overlay now accepts dragover/drop on both SVG slices and labels, but Windows OLE handoff and GNOME Shell 50 Wayland drop delivery still require a physical Nautilus drag test on Ubuntu LTS. The GNOME adapter depends on private Shell APIs and needs retesting across GNOME updates. On Linux, install the package so the `santara` command is on `PATH` before enabling the extension.

## Current controls and local processing

Visual photo and media editors are on hold. Image, audio, and video tools currently use the existing settings panel. The backend operations below can be configured through that panel where fields are provided, but it is not yet a live visual editor.

Sharp image recipes export a new file and retain the source. They support source orientation, crop, resize, rotation, flips, brightness, saturation, contrast, solid or gradient backgrounds, padding, and quality controls. Background removal, arbitrary background images, annotation, and redaction remain separate future capabilities.

The local preview service can prepare media and waveform data, but the media editor UI is unfinished. FFmpeg generates waveform videos, trims and splits, normalizes loudness, changes channels, mutes video, changes video speed, saves single frames, and performs existing conversions and tools. A split creates one queue item per range. Merge validates stream metadata first and defaults to re-encoding; incompatible track layouts, codecs, dimensions, or rates may require preprocessing. MP4 is the implemented waveform-video output.

PDF tools use a dedicated workspace with a local first-page preview, page-range controls, and existing qpdf/Poppler capabilities. The preview is labelled as the original first page. All-page rendering, thumbnail page organization, editable PDF reconstruction, and OCR remain unfinished.

Document, subtitle, and archive operations remain backed by their existing registry routes and parameter panels. Office, slideshow, and spreadsheet routes remain disabled until their isolated local backend is implemented.

## Preview security

`electron/previews.mjs` authorizes inspected paths, validates signatures and file identity, rejects symlinks and network paths, bounds decodes and subprocess work, and provides expiring opaque media tokens. `santara-media://` supports range requests so audio/video can seek without exposing arbitrary filesystem paths. Preview data never needs an HTTP service. Images and PDF page thumbnails are generated locally. Preview preparation, subprocesses, streams, and tokens are cleaned up on shutdown.

## Source map

| Responsibility | Source |
| --- | --- |
| Wheel geometry, focus, pagination, visual styling | `src/RadialWheel.tsx`, `src/wheel.css`, `src/wheel-polish.css` |
| Drag lifecycle, route filtering, settings/queue handoff | `src/App.tsx` |
| Photo/audio/video settings | `src/OperationFields.tsx` |
| PDF workspace | `src/PdfWorkspace.tsx`, `src/pdf-workspace.css` |
| Raster recipes and bounded image previews | `electron/images.mjs` |
| Extra FFmpeg operations and merge validation | `electron/media.mjs` |
| Preview authorization and local streaming | `electron/previews.mjs` |
| Capability detection and queue/output policy | `electron/registry.mjs`, `electron/engine.mjs` |
| Global overlay, platform input adapters, narrow IPC | `electron/main.mjs`, `electron/preload.cjs`, `native/windows/`, `linux/gnome-extension/`, `src/GlobalWheelWindow.tsx` |
| Development server/process lifecycle | `scripts/desktop.mjs` |

The development launcher selects a free loopback port and starts Electron only after its own Vite child reports ready. On Linux it passes `--ozone-platform=x11` before the app path for the draggable overlay. It does not change system sandbox permissions or disable sandboxing.

## Remaining platform and product work

Global drag handoff still needs manual validation on Windows 10/11 and Ubuntu GNOME Wayland; Windows signing and clean-machine validation, Linux distribution/desktop validation, Explorer/Nautilus/Dolphin/Thunar integration, native sharing providers, and the original release/license audit remain open. Image redaction/annotation and media bleep/redaction are not claimed. Feature availability follows actual installed backend capabilities. See `ROADMAP.md` and the root `resume-from-here.md` before continuing.
