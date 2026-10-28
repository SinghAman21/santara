# Santra Audio Wheel Architecture

## Status and scope

**Proposal only.** This document describes a possible audio wheel and editor experience from the visible assets in `reference-tools/audio/`. It does not state that any audio wheel route, editor, backend, or conversion is implemented. No source code or existing documentation is changed by this proposal.

The references are interaction and layout inspiration only. Santra keeps its own citrus identity and Windows/Linux desktop conventions; do not reuse third-party branding, artwork, or copy. Processing remains local and offline-first, with no upload, account, cloud service, or default telemetry.

## Observed interaction model

The wheel reference (`audio.png`) presents two distinct groups for a dragged audio file:

- **Convert formats — Shift:** M4A, WAV, FLAC, OGG, OPUS, AIFF, and WMA appear as output slices. The center shows the currently selected format. Only routes verified for the actual input and installed local encoders should appear in Santra.
- **File tools — Alt or Ctrl+Shift:** Compress, Metadata, Normalize, Visualize, Trim, Channels, and Bleep appear as tool slices. These are the tools evidenced by this image; it does not establish that they are supported by Santra or every input type.
- **File actions — Ctrl:** Retain Santra’s separate cross-platform actions wheel (such as Copy, Move, Copy Path, Open Terminal, Share, and Quick Preview). The audio references do not depict this wheel.

Use the same pointer-near wheel, labeled slices, keyboard navigation, and screen-edge placement proposed for Santra’s other media wheels. A drag can select a slice by hovering, direct drop, or keyboard. Enter confirms; Escape cancels. Modifier defaults are **Shift** for conversion, **Alt** (or **Ctrl+Shift**) for tools, and **Ctrl** for file actions. Shortcuts must remain configurable. Do not use Command/⌘ conventions.

The wheel should be capability-filtered: inspect the selected files and available local backends, show only valid operations, and explain partial applicability for mixed selections before running. Dropping a conversion route should queue it locally. Selecting an editor tool should open a compact tool window, not the full dashboard. By default, write a new collision-safe output beside its source and preserve the original.

## Visual language and shared editor shell

The reference pages use a light neutral surface, compact rounded editor windows, restrained orange accents, and a clear title bar with a close control. Waveforms use orange amplitude marks on a pale track; playback previews are visually distinct from settings. Use these as broad layout cues, not as exact copied UI. Santra should apply its own typography, colors, icons, and citrus mark.

Proposed shared audio editor layout:

```text
┌ Tool title                                      Close ┐
│ Source name · duration · local preview status         │
│                                                       │
│   Waveform / channel lanes / visualization preview    │
│   Play controls · current time / total duration       │
│   Selection handles or tool-specific timeline layers  │
│                                                       │
│   Tool settings and exact values                      │
│ Cancel                              Save new copy     │
└───────────────────────────────────────────────────────┘
```

Keep the waveform or preview large enough to inspect while keeping precise numeric controls visible. Use explicit time values in addition to pointer-drag handles. Preview playback should let the user compare the original and proposed result when that behavior is shown in the references. All preview and processing is local. A saved result is a new file; closing or cancelling must not modify the source.

## Tool visual logic evidenced by the references

### Normalize volume

`audio1.png` shows an audio waveform preview and playback position, followed by three adjustable controls: target loudness, loudness range, and true-peak limit. Include numeric readouts and concise explanatory text. Provide a Normalize action. The values visible in the reference (approximately −16 LUFS, 11 LU, and −1.5 dBTP) are examples in the image, not Santra defaults or a required standard. Santra should choose and explain any defaults only after backend and product decisions.

### Audio visualizer

`audio1.png` shows a preview area with an orange waveform on a dark canvas, plus controls for visual style and aspect ratio. The accompanying description evidences an animated waveform or still-image output, with landscape, portrait, and square choices. The editor should preview the composition and expose only output types and settings that the installed local renderer can produce. Exact colors, animation controls, codecs, duration behavior, and export formats are not specified by the reference.

### Trim audio

`audio2.png` shows a waveform with draggable start/end handles, a highlighted selected range, start/end time labels, and selected duration. The controls include playback of the selected range, an optional “trim silence ends automatically” setting, and Apply. In Santra, provide keyboard-accessible handles and editable time fields as alternatives to dragging. Make the kept range and removed portions visually distinct. The reference does not specify silence-detection thresholds or whether trimming should re-encode.

### Convert audio channels

`audio2.png` shows separate left and right channel waveform lanes, per-channel playback controls, a Mono/Stereo output choice, and independent left/right volume controls. Include an output preview and Apply. Keep channel mapping explicit so a user can understand what happens to stereo input when choosing mono, or mono input when choosing stereo. The exact downmix/upmix policy is not shown and must be decided before implementation.

### Bleep audio

`audio3.png` shows a waveform timeline with one or more bleep regions on a separate aligned lane. The user can move a whole region or adjust its edges, and can compare original playback with playback “with bleeps.” Santra should show each region’s start/end values and provide keyboard-operable selection and resizing. A bleep replaces audio in the exported copy; it is not merely a playback effect. The reference does not identify the tone, tone frequency, fade behavior, or whether other replacement modes are intended.

### Compress and Metadata

The wheel shows **Compress** and **Metadata** as available-looking slices, but the supplied audio assets do not show their editor windows or settings. Do not infer detailed compression controls or claim metadata editing/removal behavior from the wheel labels alone. Before implementation, specify whether Metadata means inspect, edit, or delete, and define supported fields. Compression needs a separate design for codec/bitrate/quality choices, output-size feedback, and honest handling of cases where output grows.

## Not evidenced; do not assume

The supplied references do **not** show audio split, merge, speed, extraction, codec/bitrate/sample-rate controls, detailed compression or metadata editors, batch-job behavior, or specific backend support. These must not be presented as reference-derived or implemented features. If desired later, design and approve them separately. Conversion slices establish the visible format labels only; they do not prove every input-to-output pairing is valid.

## Accessibility, output, and safety proposal

- Make every wheel slice, waveform lane, playback action, handle, and setting keyboard accessible with a visible focus state and screen-reader label. Hover must never be required.
- Provide keyboard alternatives for seeking, playback, channel selection, and adjusting time ranges; retain exact time values for precision.
- Show the source, selected output, and consequential transformations before saving. Preserve the source and never silently overwrite an existing destination.
- Validate actual audio streams and backend support locally rather than trusting extensions. Treat malformed media as untrusted input; never execute it.
- Render previews locally. Use temporary output followed by atomic publication; clean temporary data on cancel or failure.
- Report actionable errors and offer the final path, Open, Reveal in File Manager, and Retry where applicable.

## Decisions needed before implementation

1. Confirm the evidenced tool names and wheel grouping: Compress, Metadata, Normalize, Visualize, Trim, Channels, and Bleep.
2. Decide whether the selected conversion slice queues immediately or first opens a compact format-options step for quality/settings.
3. Approve Santra-specific editor proportions, color treatment, waveform contrast, and whether playback/preview controls are shared across all audio tools.
4. Define channel downmix/upmix behavior, normalization defaults, bleep tone behavior, visualizer export options, and metadata action scope.
5. Map approved actions to verified local backends and capabilities before exposing any wheel slice.

Until these decisions and a separate implementation review are complete, this document is design guidance only and makes no audio feature availability claim.
