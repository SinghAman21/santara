# Santra website

A standalone React + Vite product site for the Santra Windows and Linux desktop preview. The home page has one continuous orange-to-wheel story and a context-aware desktop populated with valid PNG, PDF, Markdown, SRT, WAV, ZIP and CSV fixtures. Existing tool, use-case, pricing and installation routes are preserved.

## Development

From the repository root:

```sh
npm run dev --prefix website
npm run build --prefix website
npm run preview --prefix website
```

The local development server serves the repository's current Windows `.exe`, Linux `.deb`, and Linux AppImage from `release/` at `/downloads/`. Production builds link to the `v0.1.0-preview` GitHub release, so the large installers do not need to be stored in Vercel's static output. Set `VITE_SANTRA_RELEASE_BASE_URL` only if the release assets move to a different host.

Build output is written to `website/dist/`.

## Vercel

Set the Vercel project root directory to `website`. The install command can be `npm ci`, the build command is `npm run build`, and the output directory is `dist`. Commit `website/package-lock.json` so clean installs resolve the same dependencies. `vercel.json` rewrites direct visits to `/tools`, `/usecase`, `/pricing`, and `/install` to the React app.

The site does not mount an analytics client. File contents, filenames, previews, and outputs are never uploaded by the image workspace.

## Landing page validation

From the repository root, run `npm run test:website` for Chromium coverage of scroll reversal, actual encoded output formats and pixels, modifier timing, multiple-file drops, errors, keyboard navigation, mobile layouts, reduced motion, and preserved routes. Run `npm run build --prefix website` for website TypeScript and production build validation.

The desktop accepts up to 12 files per import and 20 MB per file. Image signatures and decoding are checked; image processing is limited to 24 megapixels. SRT/VTT inputs must be UTF-8 and are limited to 16 MiB and 100,000 cues. One selected source runs at a time, with its downloadable output retained beside it.

The browser capability adapter reuses existing Canvas image processing and implements the desktop Rust subtitle converter’s timestamp/cue rules for SRT/VTT/TXT. ZIP uses STORE and GZIP uses detected native CompressionStream support, within the existing desktop archive-creation scope. Browser imports are never extracted or executed. Canvas exports flatten animation and omit metadata. No native file path, source-adjacent output write or Tauri engine bridge is exposed to the website. PDF, document, media and extraction actions show their desktop engine requirement explicitly. Spreadsheet conversion remains disabled.

Same-modifier double taps use a completed release/repress within 400 ms, with held keys, repeat events, mixed keys, text inputs, blur and unrelated shortcuts handled explicitly. Shift opens conversion, Alt or Ctrl+Shift tools, and Ctrl file actions. Pointer-captured sample dragging keeps keyboard events available; tap-to-select, mode buttons and arrow-key wheel navigation provide alternatives. External browser file drops cannot be classified until bytes become available on drop. This does not verify native Explorer or GNOME global dragging.

The featured orange is one persistent SVG owned by the workspace. A single normalized, requestAnimationFrame-coalesced controller registers it to the illustrated branch and camera, morphs the actual pulp paths, then positions that same SVG into its desktop anchor. Once settled, it uses normal layout and stops cinematic positioning until the visitor reverses into the story. There is no second fruit or fade-based handoff. Reduced motion uses a static functional wheel. The four-step gesture guide is independently replayable, pauses offscreen, and respects reduced motion. Font stacks are local; no animation/3D dependency was added. See [asset provenance and prompts](ASSETS.md).

## Reversible story and complete catalogue

`landing/scroll-story.ts` owns the named progress channels on the existing pinned section: whole orange 0–0.20, subtle approach 0.16–0.20, arrow 0.20–0.44, contact/cut reveal 0.365–0.40, zoom 0.46–0.91, pulp-to-wheel geometry 0.62–0.91. The handoff then runs from the section end to the measured desktop anchor. Docking is a pure threshold in both directions; there is no remembered `hasDocked` state, cumulative transform, stroke-dash drawing, or time-based fill transition. The earlier latch produced a measured 651 px forward/reverse disagreement at the same scroll position. The wheel column now uses stable top-aligned flow so new results cannot move its anchor or require a latch.

`tools-data.ts` is shared by the landing catalogue, `/tools` preview selectors and wheel compatibility adapter. The public catalogue has 9 families: 3 built-in cores, 4 dependent on engines and 2 not enabled. All 33 output entries and 36 editor entries are present in expandable family cards. Seven audio editor entries are explicitly flagged as concepts and never become executable wheel actions. Presentations and spreadsheets have no enabled options. Repeated names such as Resize and PNG are scoped by family and mode; no duplicate scoped keys or empty labels/descriptions were found. Image metadata editing is correctly scoped to detected ExifTool and JPEG.

Validated selectors on the existing `/tools?family=…&mode=…&action=…` route open a precise source-backed preview and pause autoplay for inspection. Manual selection updates the same URL. `/tools` without selectors retains its default tour. Non-image wheel options are no longer truncated to the first three formats or a PDF subset; larger source-backed lists use six-slot pagination. Browser image actions remain the intersection of the registry and the existing executable browser adapters. Native-only actions continue to explain their unavailable engine rather than producing fake results.
