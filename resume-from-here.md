# Santara — resume from here

## Interaction refactor, 2026-10-20

The current source is being refactored around the actual segmented-wheel references in `reference-tools/`. See `docs/INTERACTION_REFACTOR.md` for the implementation map, preview security model, and limits. The first session's installer artifacts and validation counts in `docs/HANDOFF.md` describe the earlier build; rebuild artifacts before distributing this refactor.

The in-window interaction remains available for fallback/accessibility. The new global prototype watches device-wide drags, opens a separate citrus overlay with Shift (convert), Alt (tools), or Ctrl (actions), keeps it visible after key release, then hides it when the drag ends. Conversion drops queue directly; tool choices return to the main app's existing operation panel. Photo/media editors remain on hold.

Latest checks: `npm run build` and `npm run test:desktop` pass on Linux; the Electron wheel overlay opens and fits its window; Windows protocol tests pass; GNOME extension metadata/schema/syntax checks pass. The existing desktop smoke covers conversion workflows, not a system-level drag. Windows OLE drop handoff and real Ubuntu GNOME Wayland drag/drop still need manual validation. See the platform README files before testing.

Backend additions include photo editing recipes/backgrounds, waveform previews and MP4 visualizer output, normalization/channels, video mute/speed/snapshot, explicit split ranges, and validated media merging. Global drag handoff still needs validation, as do native sharing providers, Office reconstruction, and remaining release work.

## Current state

Santara is an Electron + React/Vite local-first converter for Windows and Linux. It has a working converter UI, local job queue, settings, native file actions, a packaged Linux `.deb` and AppImage, and documented release work. Start with `docs/HANDOFF.md` for the complete verification and packaging record.

## Global Citrus Wheel — current focused work

The application now has a separate transparent Electron wheel overlay and platform trigger prototypes. Windows uses a low-level user-mode mouse/keyboard hook (`native/windows/`) to observe drag threshold, modifiers, and pointer coordinates; the overlay receives dropped files. Ubuntu GNOME Wayland uses the optional GNOME Shell extension (`linux/gnome-extension/`) to observe XDND motion/modifiers and invoke Santara's single-instance CLI; Electron is forced onto XWayland so it can position an always-on-top drop overlay. The extension never reads file payloads. Shift opens conversion, Alt opens tools, and Ctrl opens file actions; modifier bindings are configurable in the extension settings and the application settings.

The overlay is wired to local capabilities, conversion queueing, file actions, and forwarding a selected tool to the main app. It is a prototype, not yet verified on real external drag/drop: this checkout was only typechecked/built on Linux. Windows hook compilation requires MSVC and the real Windows OLE drop handoff is untested. GNOME Shell uses private interfaces; install/enable the extension, log out/in if needed, and manually test across GNOME 50 Wayland, including a live external file drag. See `native/windows/README.md` and `linux/gnome-extension/README.md` for platform instructions. Do not describe this as verified global support until those manual tests pass.

### Reliability investigation — 2026-10-20

Fixed multiple concrete failures behind the report that the installed GNOME wheel did not appear or accept drops:

- The Linux app previously called `app.commandLine.appendSwitch('ozone-platform', 'x11')` from the main process, after Electron had already selected Wayland. The Debian/AppImage launcher and development launcher now pass `--ozone-platform=x11` before Electron starts, which enables the window positioning/topmost APIs the overlay relies on.
- The extension installer now resets persisted GSettings to the current `santara --ozone-platform=x11 --santara-*=` command template. This replaces stale saved command lines that used malformed or outdated arguments.
- A cold wheel launch now keeps the regular Santara window hidden, so it cannot cover the drag overlay. Linux placement reads the current XWayland pointer rather than mixing GNOME stage coordinates with X11 screen coordinates.
- Dragover was previously accepted only over menu-item buttons, not over the visible SVG slices. The overlay now accepts drops across the wheel and updates selection from both slice and label targets. Each new drag resets old hints and selections.
- At drag-end after a cold wheel launch, Santara reveals the main window as a recovery path if the compositor did not deliver the drop to the overlay.
- Added an end-to-end regression covering direct SVG-slice drops and fresh file hints on the next drag.

Validation after the fixes: `npm run build`, all 124 unit tests (134 pass, 4 skipped), all 11 Playwright tests, `npm run test:desktop`, GNOME extension syntax/schema checks, and Linux `.deb`/`.AppImage` packaging passed. The packaged Debian desktop entry is confirmed to contain `Exec=/opt/Santara/santara --ozone-platform=x11 %U`.

Still not verified in software tests: a live Nautilus drag under the user's GNOME Wayland session reaching the XWayland BrowserWindow as a drop destination. The extension cannot transfer file contents; the compositor must route the active XDND drop to Santara's overlay. The user should reinstall the newly built `.deb`, run `./linux/gnome-extension/install.sh`, log out/in to reload GNOME Shell, launch Santara from the application menu, then test dragging a JPG from Files, holding Shift, hovering a format slice, and releasing over that slice. If the wheel appears but no drop lands, use the main app's drop zone as fallback; diagnose the compositor's XDND retargeting next rather than claiming the feature is fixed end-to-end.

Key next steps: test a real drag while Santara is already running; confirm the overlay receives the external file payload while the drag is in progress; verify that dropping onto a slice actually queues or dispatches the selected operation; test multi-monitor scaling/negative coordinates; build and exercise the Windows helper and installer on Windows 10/11; verify Ubuntu LTS GNOME compatibility and extension permission/update behavior. If the platform does not retarget an in-progress drag to the newly created overlay, replace the overlay handoff with a native OLE/XDND drop target or redesign around a shell/file-manager launch path rather than claiming universal desktop dragging.

Run the development app with:

```bash
npm install
npm run desktop
```

The desktop launcher now selects a free loopback port and waits for its own Vite process before launching Electron. Linux still requires working Chromium sandbox support through user namespaces or a correctly installed sandbox helper; the launcher does not change permissions or disable sandboxing.

## Public reference observations

Reviewed 2026-10-20:

- The public Tangerine feature page describes a drag-first local workflow: drag a file, press a modifier, select an operation, and drop.
- Its visible reference imagery shows a cursor-centred radial wheel styled as a segmented fruit cross-section. Each segment is a compatible destination or operation, and the dragged file remains visually central.
- The wheel is stated to remain open after the modifier is released, until the user drops or cancels.
- The feature page assigns separate wheels to conversion, tools, and file actions, and documents a keyboard route with Enter, arrow keys, and Escape.
- The public `/tools` page currently exposes only a local-processing statement; it does not reveal implementation details, individual tool controls, or source code. Do not invent proprietary behavior from it.

Santara must reproduce the interaction model using original citrus artwork, language, icons, and Windows/Linux conventions. It must not reuse Tangerine assets, copy, trademarks, or Apple-specific behavior.

## Intended Santara wheel behavior

1. User starts dragging one or more files over Santara.
2. Holding Shift opens the conversion wheel, Alt or Ctrl+Shift opens the tools wheel, and Ctrl opens the file-actions wheel. All bindings are configurable.
3. The wheel appears near the pointer as an original orange-slice radial menu. It shows available operations that match at least one selected file; partial operations state how many files apply and that other files will be skipped.
4. Releasing the modifier leaves the wheel open. Hovering or arrow navigation selects a segment; dropping or Enter confirms it. Escape closes it.
5. Conversions chosen during a drag queue directly. Tool selections open the operation settings panel; users confirm there before a local queue job starts. PDF tools use a separate PDF workspace.

The refactor adds both the in-window wheel and an experimental system-wide overlay. External MIME hints permit provisional options before drop; filenames and signatures are validated after drop. Unknown file types use the inspect-after-drop flow. Platform drag hooks are prototypes until tested on real Ubuntu/Windows systems; see the global-wheel section above for known handoff caveats.

## Tool interaction specifications

### Add background

Implement this as an image editing operation, not a conversion format. When a user selects **Add background**, open a non-destructive parameter sheet with a live local preview:

- background type: solid colour, gradient, transparent, or local image;
- canvas size and fit mode: contain, cover, stretch, or tile;
- alignment and padding;
- output format and quality.

The editor should render the source on top of the selected background and show a checkerboard wherever alpha remains. JPG output must warn that transparency is flattened. On Apply, create a new output file and never modify the original. Implement with Sharp/libvips for raster inputs; gate SVG and advanced composition until safe, local rendering is available.

### Audio wave visualizer

Treat this as a video-generation tool. The interaction should offer a timeline preview with waveform, duration, play/pause, start/end trim handles, and an audio meter. Let the user select a visual theme, background colour/image, aspect ratio, resolution, waveform style, colour, and optional title/artist text. Generate the final MP4/WebM locally by combining an audio waveform render with the source audio through FFmpeg. Preview frames may be low-resolution for responsiveness; final rendering uses the selected output quality. Gate the tool entirely unless FFmpeg and its required codecs/filters are detected.

### Edit photos

Open a dedicated photo editor when an image is selected. It needs a large preview canvas, undo/redo, zoom/pan, before/after comparison, and an accessible control panel. First release controls: crop with aspect-ratio presets, resize, rotate/flip, compression/quality, metadata removal, and background addition. Changes stay as an operation recipe until Apply; applying queues a new file output through the existing atomic-output system. Preserve EXIF orientation and metadata by default where the target supports it, and state when metadata or alpha will be lost.

## Recommended implementation sequence

1. Build a renderer-level `DragOperationWheel` driven by the existing capability registry, with a keyboard-equivalent picker and automated drag tests.
2. Add the image background operation and preview adapter, then its fixtures and packaged smoke test.
3. Add an FFmpeg-backed waveform visualizer adapter, capability detection, parameter UI, and cancellation test.
4. Build the photo-editor shell around the existing image operations, keeping every edit non-destructive and queue-backed.
5. Update `docs/CAPABILITIES.md`, `docs/ROADMAP.md`, and tests whenever a route becomes genuinely supported.

## Remaining delivery work

High-priority release and scope gaps: Windows build/signing/install validation; true global drag and file-manager integration; native share providers; advanced audio/video split/merge/frame extraction; all-page PDF and editable PDF/Office conversion; robust document/spreadsheet/slide conversion; SVG/HEIC handling; RAR/password archive support; full localization/accessibility audit; and dependency attribution/source-compliance review. See `docs/ROADMAP.md` and `docs/HANDOFF.md` for the authoritative detailed list and test evidence.

## Suggested commit message

`feat: complete the citrus drag wheel and restore tool selection`
