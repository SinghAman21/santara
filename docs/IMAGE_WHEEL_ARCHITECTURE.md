# Santara Image Wheel Architecture

## Product direction

Santara should feel like a desktop wheel utility, not a conventional converter window. The visible application window is not part of the normal drag workflow. A small background desktop host owns the global wheel, local workers, settings, notifications, and native integrations. The host may still use Electron internally, but the main Santara workspace stays hidden unless the user explicitly opens history, settings, or a full queue view.

This document defines the next implementation scope for image files only. Audio, video, PDF, documents, archives, and other extensions remain unchanged until a separate design is approved.

## Target interaction

```text
Drag image
  -> hold Shift
  -> conversion wheel appears
  -> choose output format
  -> release/drop
  -> local conversion starts beside the source
  -> compact progress notification appears
```

For image tools:

```text
Drag image
  -> hold Alt or configured tools modifier
  -> image tools wheel appears
  -> choose a tool
  -> compact floating tool window opens
  -> preview and adjust locally
  -> Apply / Save copy
  -> new output is written beside the source
```

The wheel remains open after the modifier is released. The user selects a slice by hovering, dragging over it, clicking, or keyboard navigation. Enter confirms, Escape cancels, and arrow keys move between slices. When a native drag supplies no pre-drop MIME or URI metadata, the image-focused wheel shows provisional image routes and verifies the actual file after drop.

## Runtime architecture

### Hidden desktop host

The host remains installed as a background-capable desktop process. It is responsible for:

- Windows drag/modifier observation and Linux GNOME/XDND integration.
- The transparent, cursor-near citrus wheel overlay.
- Secure file-drop handoff and local file inspection.
- A local job queue and worker lifecycle.
- Sharp/libvips image processing and preview generation.
- Output naming, collision handling, atomic writes, cancellation, and cleanup.
- Small progress/result notifications.
- The tray status/quit control, diagnostics, and local job lifecycle.

The host must not upload files, filenames, paths, previews, metadata, or telemetry. It should start at login only when the user enables that preference; otherwise launching the wheel integration starts it on demand.

### Visible surfaces

Santara has four temporary surfaces:

1. **Citrus wheel** — conversion formats or image tools.
2. **Tool window** — a compact editor for one selected image operation.
3. **Progress/result notification** — status, cancel, retry, open file, and reveal folder.
4. **Full workspace** — deferred; it is not opened by the wheel workflow.

The full workspace is not required for, or opened by, a normal single-image conversion or tool edit.

## Conversion wheel

The conversion wheel is optimized for one-step output selection. For an image input, it displays only genuinely available raster outputs from the capability registry:

- PNG
- JPG/JPEG
- WebP
- TIFF
- AVIF
- BMP
- HEIC only when a verified local encoder is detected
- PDF when the local image-to-PDF route is available

SVG remains input-only unless a verified rasterization route is available. The wheel must hide unavailable formats instead of showing a dead route.

When the user chooses a format, Santara should:

- Inspect the dropped file locally before processing.
- Preserve the original file.
- Apply EXIF orientation correctly.
- Preserve metadata where the target supports it unless the privacy setting says to strip it.
- Warn when alpha will be lost, especially PNG/WebP/TIFF to JPG.
- Use the configured quality preset.
- Write beside the source by default using `name-converted.ext`.
- Resolve collisions according to Ask, Auto-rename, Skip, or explicitly confirmed Replace.
- Start the queue without opening the full workspace.

## Image tools wheel

The tools wheel is opened with the configured tools modifier, defaulting to Alt. For a supported image it should expose these tools as they become implemented and verified:

- Compress
- Crop
- Resize
- Rotate
- Flip
- Add Background
- Edit Photo
- Edit Metadata
- Annotate Photo
- Redact Photo
- Create Collage
- Strip Metadata

Each slice must include a short description and indicate when it applies only to part of a mixed selection. Unsupported tools must not appear merely because they are planned.

## Compact image tool windows

Tool windows are temporary, lightweight, and attached to the selected input. They should open near the wheel without exposing the full Santara workspace. Each window contains:

- A title and source filename.
- A local preview canvas.
- Before/after or original/current comparison where useful.
- Reset and Cancel actions.
- Apply / Save copy as the primary action.
- Output format, quality, and metadata controls where relevant.
- Clear warnings for alpha loss, metadata loss, re-encoding, or fidelity limits.

Applying a tool creates a new file; it never edits the source in place. The operation is represented as a validated recipe and submitted to the local queue. Temporary preview renders must be cleaned up on cancel, close, or failure.

## Image tool behavior

### Compress

Open a compact sheet showing original size, estimated output size when available, quality presets, target file size or reduction percentage, output dimensions, and metadata behavior. The primary action is `Compress`. Output defaults to `name-compressed.ext`.

### Crop

Show the image with a draggable crop rectangle and handles. Provide Free, 1:1, 4:3, 16:9, 3:2, and custom aspect ratios, plus exact pixel dimensions. Preserve orientation before calculating crop coordinates. Apply writes `name-cropped.ext`.

### Resize

Provide width, height, lock aspect ratio, fit mode, and no-enlargement controls. Preview the resulting dimensions before applying. Apply writes `name-resized.ext`.

### Rotate and Flip

Provide 90-degree rotation, arbitrary safe rotation where supported, horizontal flip, and vertical flip. The preview updates immediately. Apply writes a new output and preserves metadata where technically possible.

### Add Background

Provide Solid, Gradient, Transparent, or Local Image background modes when supported. Include canvas size, contain/cover/stretch/tile fit, alignment, padding, corner radius, and shadow controls. Show a checkerboard for remaining transparency. Warn before flattening alpha to JPG. Apply writes `name-background.ext`.

### Edit Photo

Provide a non-destructive adjustment panel with brightness, exposure, contrast, highlights, shadows, saturation, temperature, tint, sharpness, and noise reduction where the backend supports them. Include zoom, pan, before/after comparison, and undo/redo for the current recipe. Apply writes `name-edited.ext`.

### Edit Metadata

Show locally inspected metadata grouped by image, EXIF, GPS, color, and file fields. Allow individual field removal, Remove All, and Save. Do not expose binary metadata values that cannot be safely edited. Make the privacy effect clear. Apply writes `name-metadata.ext` or a configurable equivalent.

### Annotate Photo

Provide a canvas toolbar for arrows, lines, rectangles, circles, freehand drawing, text, numbered markers, color, stroke width, and undo/redo. Annotations are rendered into a new output only after Apply. The original remains unchanged.

### Redact Photo

Provide solid and blur redaction regions. Redaction must be destructive to the exported copy: the hidden pixels must not remain recoverable in the output file. Do not claim automatic face or text detection until a local, tested detector is implemented. Apply writes `name-redacted.ext`.

### Create Collage

Accept multiple selected image inputs. Provide grid, row, column, and featured layouts; column count; spacing; background; canvas dimensions; crop/fit behavior; and ordering. Preview the composition locally. Apply writes `collage.ext` or the configured naming pattern.

### Strip Metadata

Offer a one-click privacy tool with a short explanation of what is removed and what the encoder may regenerate. Apply writes `name-stripped.ext` and never changes the source.

## Backend and capability rules

- Sharp/libvips is the primary bundled raster backend.
- ImageMagick is optional and must not be required for the primary JPG/PNG/WebP workflow.
- Every wheel item maps to a capability registry entry with inputs, outputs, backend, options, metadata behavior, batch support, and warnings.
- Preview and export must use the same validated recipe contract so what the user sees is consistent with the output.
- The registry must gate tools by detected backend support and safe input signatures, not file extensions alone.
- Every export uses a private temporary file followed by atomic publication.
- Originals are never silently replaced or deleted.

## Output and notifications

After an immediate conversion or applied tool, show a small local notification containing:

- Operation and source filename.
- Completed, failed, cancelled, or skipped state.
- Output filename and folder.
- Open converted file.
- Reveal in file manager.
- Retry when failed.

The notification should disappear automatically but remain available through the tray or recent activity surface. It must not force navigation to the main workspace.

## Accessibility and keyboard behavior

- Every slice has a screen-reader label and visible text.
- Hover is optional; keyboard focus can select every operation.
- Enter opens or confirms the selected operation.
- Escape closes the wheel or tool window without writing output.
- Arrow keys navigate slices and controls.
- Tool windows support normal tab order, visible focus, scalable text, and high contrast.
- All UI strings remain externalized for localization.

## Implementation sequence

1. Refactor global conversion dispatch so format selection queues immediately without focusing the main window.
2. Add a hidden-host lifecycle and compact progress/result notification path.
3. Refactor the existing image operation panel into a reusable floating tool-window shell.
4. Implement Compress, Crop, Resize, Rotate, Flip, and Add Background with live local previews.
5. Implement Edit Photo adjustments and before/after comparison.
6. Implement metadata editing and stripping with explicit privacy warnings.
7. Implement annotation, redaction, and collage with generated original fixtures.
8. Add capability-gated wheel routes and image-specific end-to-end tests.
9. Test Windows Explorer and Ubuntu GNOME drag/drop with the main workspace closed.
10. Update packaging, accessibility, user documentation, and the capability manifest after each verified tool.

## Current implementation note (2026-10-20)

The compact image tool surface now opens in its own Electron window with a local Sharp preview and the existing local job queue. Crop includes pointer-drag selection and corner handles alongside ratio presets and exact pixel bounds. Resize/fit, rotation/flip, solid/gradient backgrounds, brightness/contrast/saturation, compression quality, and metadata removal are available. Drag conversion queues without focusing the full workspace, and completed jobs use a local desktop notification with an open-file action.

This remains an initial editor surface, not completion of the full tool roadmap. Backgrounds currently use generated solid or gradient pixels; local-image backgrounds, advanced adjustment controls, metadata inspection/editing, annotation, redaction, and collage are not exposed. The desktop host now stays hidden while conversions run in the backend and image tools open as separate compact windows. Image conversion still needs end-to-end manual validation from external Windows/GNOME file managers.

## Acceptance criteria

- A JPG dragged from a file manager can be converted to PNG without opening the full Santara workspace.
- The output appears beside the source with a collision-safe name.
- Selecting Compress, Crop, Resize, Add Background, or Edit Photo opens only a compact tool window.
- Tool previews update locally and Apply creates a new output without modifying the source.
- Cancel closes the tool without output or leaked temporary files.
- Missing backends hide the affected wheel item or show a truthful unavailable state.
- Windows and Ubuntu Linux support the same image interaction model, with platform-specific drag adapters.
- No normal image workflow creates network requests or requires an account.
