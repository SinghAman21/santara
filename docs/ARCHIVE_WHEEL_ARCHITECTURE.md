# Santra Archive Wheel Architecture

## Status and scope

ZIP, TAR, and GZIP creation/extraction are implemented locally with strict limits. Current behavior supports ZIP STORE creation and STORE/DEFLATE extraction, plain USTAR, and GZIP of one regular file. Archive inputs and outputs are bounded by the implementation's entry, total expanded size, archive size, and entry-count limits. Links and unsafe paths are rejected. RAR and 7z are unsupported. Keep the registry and tests as the runtime source of truth; this document does not expand support claims.

## Modifier and interaction model

- **Shift — Create/convert:** for selected files/folders, show verified archive outputs such as ZIP and TAR; show GZIP only for exactly one regular file. Do not offer meaningless archive-to-archive routes.
- **Alt — Archive tools:** for a supported archive, show Inspect Contents and Extract. Inspection is read-only and local; extraction opens a compact destination/options surface.
- **Ctrl — File actions:** Copy, Move, Copy Path, Open Terminal, Share when available, and Quick Preview. These remain separate from archive creation/extraction.

Display only routes valid for the selection. For mixed files/folders, filter unsupported entries with a clear preflight summary; never silently omit a selected item. Folder recursion must be explicit, default off or clearly confirmed. The wheel is pointer-near, labeled, and keyboard-accessible. A simple archive task queues without opening the full dashboard.

## Create archive

Accept selected regular files and directories; preserve relative paths under a predictable archive root. Show the selected entry count and estimated input size where practical. Offer ZIP and TAR when verified. Offer GZIP only when exactly one regular file is selected; explain that GZIP is a single-stream compression format, not a multi-file container. Use deterministic sanitized archive names, do not follow symbolic/hard links, and reject unsupported special files.

Current ZIP creation uses STORE, so do not promise compression gains. The UI should call it “Create ZIP” or “Package as ZIP” rather than imply compression. A future DEFLATE or other compression method must be separately implemented, licensed, and tested before its controls appear. Output names follow `selection.zip`, `selection.tar`, or `filename.gz`, with collision-safe resolution.

## Inspect and extract

Inspect shows archive entries, sizes, types, and safe relative paths without opening or executing content. Bound displayed entry count and metadata size; avoid rendering active HTML or previews from archive members. Extraction allows a user-selected destination and reports planned files and conflicts before writing. Offer safe auto-rename/skip or explicit replace confirmation; never overwrite silently. Preserve relative directory structure under the chosen destination.

Validate all entry paths before extraction. Reject absolute paths, traversal (`..`), drive/UNC paths, platform-reserved names, duplicate/case-colliding destinations, links, and unsupported special files. Resolve destination paths and ensure every output remains inside the selected root, including symlink/race checks. Stage extraction in a private temporary directory and publish only after validation; clean up on cancellation or failure. Never execute extracted files.

Password-protected archives are unsupported unless a secure local backend is explicitly added. Do not prompt for or store passwords when the installed adapter cannot safely support them. RAR/7z remain hidden with a clear unsupported explanation; do not mislabel a generic archive reader as support.

## Capability and resource policy

Every capability declares input/output formats, create/extract direction, compression method, recursive behavior, link policy, backend, entry/expanded-byte/archive-byte limits, maximum entries, batch semantics, and fixture tests. Preflight actual archive signatures instead of trusting extensions. Detect malformed headers, duplicate entries, decompression bombs, truncated streams, disk exhaustion, and permissions before or during processing. Keep CPU/time and memory bounded; report actionable failures.

All operations are offline. Do not upload archive contents, filenames, paths, or inventory metadata. Logs and diagnostics must not disclose member content; redact paths according to privacy settings.

## Verification plan

- Test ZIP/TAR/GZIP creation and extraction, including nested directories and Unicode paths, on Windows and Linux.
- Test traversal, absolute and drive paths, UNC paths, reserved names, duplicate/case-collision names, symlinks/hardlinks, special files, malformed/truncated input, and decompression bombs.
- Assert configured entry/byte/archive limits, single-file GZIP restriction, ZIP STORE behavior, collision policy, staged cleanup, and no execution of extracted members.
- Test unsupported RAR/7z and password-protected archives fail cleanly; test valid magic bytes with misleading extensions and invalid signatures with plausible extensions.
- Test cancellation, destination permissions, disk-full handling, output beside source for creation, chosen destination for extraction, keyboard access, and native Reveal behavior.

## Implementation sequence

1. Preserve existing hardened ZIP/TAR/GZIP operations and show only capability-verified wheel entries.
2. Add the read-only local Inspect Contents surface and extraction preflight/conflict summary.
3. Validate staging and destination containment against symlink races on Windows and Linux.
4. Consider DEFLATE, RAR, 7z, encryption, or additional formats only after backend/license review, explicit limits, and adversarial fixtures.


## UI source migration (Penpot frame 05)

Frontend ownership now follows `src/tools/<family>`, `src/convert/<family>`, `src/action`, and `src/common`. See [UI structure](UI_STRUCTURE.md) for exact files and implemented/deferred frame coverage. Editors use white surfaces and `#ff5a00` accents; shortcuts remain configurable. This UI migration does not enable any additional backend route or certify proposed features above.

## Penpot frame 05 implementation follow-up

The wheel now uses the shared `common/ReferenceWheel.tsx` and family profile, with white segments, `#ff5a00` selection, correct family center/icon, and explicit empty states. Supported editors/reviews use the compact reference shell (PDF retains its validated native dialog). Only currently verified operations appear; proposal-only controls above are not enabled by this change. See [UI structure](UI_STRUCTURE.md) for current ownership and native drag classification.
