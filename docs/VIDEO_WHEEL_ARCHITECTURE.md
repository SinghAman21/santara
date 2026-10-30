# Santra Video Wheel and Tool Architecture

## Status and scope

The first implementation is in the current source tree: capability-gated wheel slices open a compact video editor, and accepted settings enqueue a non-destructive local FFmpeg job. This is not full format parity or release validation. The backend must detect the required FFmpeg/FFprobe codecs, muxers, and filters before a route appears. Audio editor behavior remains proposal-only in `docs/AUDIO_WHEEL_ARCHITECTURE.md`.

The inspiration is the interaction and editor layout shown in `reference-tools/video/vid.png` through `vid4.png`. These are visual references only. Santra keeps its own citrus identity, copy, icons, and Windows/Linux conventions; no Tangerine branding or macOS shortcuts are used.

## Interaction model

- Drag one or more video files from the file manager. Position the wheel near the current pointer, then clamp it inside the active display so it cannot open off-screen.
- Double-tap **Shift** for conversion formats. Double-tap **Alt** or configured **Ctrl+Shift** for video tools. Double-tap **Ctrl** for file actions. Single presses do not open the wheel. Shortcuts stay configurable.
- Keep the wheel open while the user chooses a slice by pointer, keyboard arrows, or direct drop. Enter confirms; Escape cancels.
- Populate slices from the capability registry for the selected files and detected local engines. Never show an operation merely because an extension or design reference lists it.
- A mixed selection shows only operations valid for every item, with an explicit “applies to some files” state when partial batch processing is safe.
- Conversion queues immediately and saves beside each source by default. A tool opens a compact editor; Apply queues a new output beside the source without changing the original.

## Wheel visual proposal

Use the existing Santra citrus wheel shell: warm orange active slice, quiet pale neutral inactive slices, thin segment boundaries, and the Santra mark alone in the center. Place the wheel close to the drag pointer, with a screen-edge safety margin. Show operation names directly on the slices with simple Santra-native icons; do not make users infer the action from an icon or reveal the tool list only after dropping.

### Shift: video conversion

Show only output routes verified for the source streams and installed encoders/muxers. Candidate labels include MP4, MOV, MKV, WebM, AVI, WMV, GIF, and audio extraction formats such as MP3; each appears only when its route is genuinely available. Preserve a sensible default quality preset, and expose detailed codec settings in a compact options step only when needed. State clearly when conversion requires re-encoding. Output naming follows `filename-converted.ext`; collision handling remains explicit and source files are preserved.

### Alt or Ctrl+Shift: video tools

Use a dynamic, labeled tool wheel with these candidate actions, filtered by selection and backend capability:

- **Compress**, **Trim**, **Split**, **Crop**, **Speed**, **Snapshot / Frames**, **Mute**, **Redact**, and **Metadata**.
- **Merge** appears for compatible multi-video selections; otherwise it is not shown.
- Metadata actions must describe their actual scope (inspect, edit, or remove); do not label metadata removal as editing.
- Tools that cannot safely apply to all selected files are hidden or marked as partial before confirmation.

Keep slice labels short and readable. If a future capability count makes the wheel crowded, group secondary actions behind a clearly labeled “More” slice rather than shrinking text until it is illegible. Tool names must remain available to keyboard and screen-reader users.

## Shared compact video editor

Each selected tool opens a small, independent Santra window—not the full dashboard—with a consistent layout:

```text
┌ Tool name                                      Close ┐
│                                                      │
│               Video preview (contain-fit)            │
│           black letterbox; no clipped frames         │
│                                                      │
│  playback controls  current time / duration          │
│  timeline or filmstrip with visible selection        │
│  tool-specific controls and exact numeric values     │
│                                                      │
│  Cancel                      Save as new video       │
└──────────────────────────────────────────────────────┘
```

The preview uses local decoding and fits the complete frame inside the viewport. The timeline is scrub-able and supports keyboard focus, arrow-key frame/time steps, and editable time fields where relevant. Keep preview, selection, and export settings visually distinct. Show the output name, container, and whether audio/video will be re-encoded before Apply. Preview is an estimate; the final export uses the validated settings shown in the editor.

## Tool-specific visual behavior

### Trim

Show the video preview above a horizontal timeline/filmstrip. Use two high-contrast draggable handles for start and end, a shaded excluded region, and exact start/end time fields. Include play, pause, frame-step, and “play selection” controls. Display selected duration and whether stream-copy trim is possible or re-encoding is required.

### Crop

Overlay a visible crop rectangle with edge/corner handles over the full contained frame. Provide aspect presets plus Free and Custom, and editable output width/height. Keep the frame uncropped in the preview, show the resulting dimensions, and disclose re-encoding. Audio is preserved unless the user explicitly changes the audio option.

### Compress

Show source size and duration, then a small set of named quality/size presets with the selected video and audio codec. Where practical, show an estimated output-size range and a target-size option. Do not promise a smaller file: show that compression can increase size, and keep the original untouched. Advanced settings (codec, CRF/quality, bitrate, dimensions, FPS) belong in an expandable section.

### Speed

Use a prominent speed slider with a small number of labeled presets (for example 0.5×, 1×, 1.5×, 2×) and a precise numeric value. Preview the changed duration. Offer pitch-preserving audio only when the detected backend supports it; otherwise explain the audio behavior before export. Support silent clips without presenting audio controls as mandatory.

### Split

Show the same scrubber with draggable split markers, time readouts, and an equal-parts control. List the resulting segment durations/count before export. Validate that ranges are non-empty, ordered, and within the source duration; show the predictable numbered output names.

### Merge

Use an ordered clip list with local thumbnails, names, durations, and move-up/down controls (drag reordering may supplement, never replace, keyboard controls). Show the chosen output container and compatibility result. Explain when stream-copy is valid; if streams are incompatible, offer a clearly identified re-encode path rather than silently changing quality or codecs.

### Snapshot / Extract Frames

Show a preview and seek bar, with “Add frame” capturing the currently displayed timestamp. Present selected frames as a removable thumbnail tray, with timestamp and full-resolution output dimensions. Let users choose a frame interval or specific snapshots, and preview the output naming pattern before saving an image sequence.

### Mute

Keep this editor deliberately simple: video preview, audio-present status, a clear remove-audio action, and a new-output summary. Do not use a mute toggle that implies only playback muting if the exported file will have its audio stream removed.

### Redact

Allow one or more visible solid/blur masks over the preview, with color/style controls and a separate time interval per mask shown as timeline tracks. State explicitly whether masks stay at fixed frame coordinates or are tracked. Do not claim face detection or motion tracking unless a verified local capability exists. Warn that an untracked mask can miss a moving subject; never imply that visual blur guarantees recovery-proof redaction.

### Metadata

Start with locally inspected stream/container fields and readable field names. Offer only metadata edits supported by the current backend, plus a separate destructive-sounding **Delete metadata** action that writes a clean copy. Summarize which fields may remain or be regenerated. Never silently strip metadata as part of another tool.

## Accessibility, output, and safety

- All wheel slices and editor controls have visible labels, focus states, and screen-reader names; no action depends on hover.
- Provide keyboard alternatives for seek, frame stepping, trim/crop/split handles, clip ordering, and timeline markers. Keep text scalable and contrast sufficient over the preview.
- Video operations are local. Do not send files, previews, paths, metadata, or diagnostics to a network service.
- Treat inputs as untrusted. Validate streams and selected time ranges using the detected local backend; use temporary output and atomic publication.
- Preserve originals. Use collision-safe names and explicit replace confirmation. Cancellation removes incomplete temporary outputs.
- Completion offers the saved path, Open, Reveal in File Manager, and Retry for failures.

## Implemented behavior and remaining verification

The current wheel/editor includes capability-gated conversion and these local tools: compress, trim, split, compatible merge with re-encode choice and clip ordering, crop, resize, rotate, flip, speed, snapshot frames, mute, GIF creation, audio extraction, solid time-ranged redaction, and metadata deletion. The preloaded editor receives a fresh context on each open. Outputs are new files dispatched to the local engine; originals remain untouched. The editor uses the primary streams and reports re-encoding/metadata limitations.

Redaction is a fixed-position solid color `drawbox`, not blur, face detection, or motion tracking. It must not be treated as recovery-proof privacy redaction when content moves. Metadata deletion removes copied tags and chapters where FFmpeg supports it; encoder/container-generated tags may remain. Compression may make an output larger. Merge validates stream compatibility and defaults to re-encoding; direct stream-copy is opt-in and may reject differing stream layouts/settings.

Remaining verification: run typecheck/unit/E2E/desktop tests, exercise all routes against generated fixtures and each installed FFmpeg build, then manually test pointer-near wheel placement and real Explorer/GNOME drag handoff. Native-platform manual tests and packaged artifact checks are not implied by automated tests.

## UI source migration (Penpot frame 02)

Frontend ownership now follows `src/tools/<family>`, `src/convert/<family>`, `src/action`, and `src/common`. See [UI structure](UI_STRUCTURE.md) for exact files and implemented/deferred frame coverage. Editors use white surfaces and `#ff5a00` accents; shortcuts remain configurable. This UI migration does not enable any additional backend route or certify proposed features above.

## Penpot frame 02 implementation follow-up

The wheel now uses the shared `common/ReferenceWheel.tsx` and family profile, with white segments, `#ff5a00` selection, correct family center/icon, and explicit empty states. Supported editors/reviews use the compact reference shell (PDF retains its validated native dialog). Only currently verified operations appear; proposal-only controls above are not enabled by this change. See [UI structure](UI_STRUCTURE.md) for current ownership and native drag classification.
