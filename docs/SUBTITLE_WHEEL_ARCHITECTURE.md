# Santra Subtitle Wheel Architecture

## Status and scope

SRT/VTT conversion and TXT export are implemented in the local built-in converter. The converter validates cue timestamps and preserves cue order/timing for SRT↔VTT. Styling and cue settings are not retained, and TXT output omits timestamps and markup. Do not imply broader subtitle format support until separately implemented and tested.

## Modifier and interaction model

- **Shift — Convert:** show the valid SRT, VTT, and TXT outputs for the dropped subtitle file. SRT↔VTT preserves timing; TXT is a plain-text transcript with timing/markup loss clearly stated.
- **Alt — Tools:** no subtitle editing tools are currently in scope. A timing editor or retiming tool requires a separate design and capability entry.
- **Ctrl — File actions:** Copy, Move, Copy Path, Open Terminal, Share when available, and Quick Preview.

For mixed selections, show shared output routes or clearly identify partial-batch conversion. The wheel and any post-drop picker must be keyboard accessible, visibly label formats, and avoid relying on hover. Choosing an output queues local conversion without opening the full workspace.

## Conversion and validation behavior

Parse cue blocks, sequence numbers, timing lines, and cue text. Validate timestamp shape and range, non-negative times, valid end-after-start ordering, and parseability. Preserve original cue order and timing; do not silently sort overlapping cues or alter times. Keep valid cue text as safely as the target format allows. For VTT-to-SRT, disclose loss of VTT-only styling/settings and unsupported metadata. For TXT, disclose that timing and markup are omitted.

When parsing fails, report the cue index and source line when available, with a short explanation and no destructive partial output. If malformed cues can be skipped safely, require explicit user choice and identify skipped cue count; the default is fail without publishing an incomplete file.

## Output and safety

Use `filename-converted.ext` beside the source, preserve the original, resolve collisions according to settings, and atomically publish only fully validated output. Keep cue text local; do not log subtitle contents or filenames in copied diagnostics. Completion offers Open and Reveal in File Manager. No online lookup, translation, or subtitle service is used.

## Capability registry and tests

Register SRT→VTT, VTT→SRT, and SRT/VTT→TXT as explicit directed routes with backend `javascript`, supported batch behavior, timestamp-preservation property, and route-specific warnings. Test valid/invalid timestamps, BOM and line endings, cue order, overlap preservation, empty files, multilingual text, malformed numbering, missing timing lines, misleading extensions, collision handling, cancellation, output permissions, and exact loss warnings. Validate output by parsing it again and comparing expected cue text/times.

## Implementation sequence

1. Keep the current built-in converter and capability records as the source of truth.
2. Improve post-drop selection and route-specific loss warnings without opening a dashboard.
3. Add a compact cue preview only if it remains useful for format confirmation and supports keyboard navigation.
4. Treat retiming, styling, synchronization, and subtitle editing as separate future tools with explicit tests.

