# Architecture and boundaries

The React/Vite renderer calls the typed adapter in `src/tauri-bridge.ts`. Tauri commands in `src-tauri/src/main.rs` and `services.rs` own windows, inspected file identities, settings, queue metadata, local previews, and safe file actions. Rust modules under `src-tauri/src/` perform built-in image, subtitle, and archive work. Detected external engines run locally with fixed argument arrays and bounded process handling.

The workspace offers settings, history, queue controls, and keyboard access. The citrus wheel, floating editors, and quick preview are separate windows. File paths entering jobs must first be inspected and tied to a known selection. Capabilities, including optional FFmpeg, PDF, document, and JPEG metadata routes, are constructed from detected backend support. An extension by itself does not authorize a conversion.

Jobs preserve originals, create private sibling temporary outputs, and publish without overwriting existing files. Archive extraction rejects traversal and symlink escapes. Preview URLs are tokenized, window-scoped, bounded, and short-lived. Diagnostics copied to the clipboard omit source paths. The optional Windows watcher is isolated under `native/windows/`; the optional GNOME extension is under `linux/gnome-extension/`. The app remains usable through the workspace when either integration is absent.

The current code does not establish complete runtime parity. Source inspection and automated tests cannot prove real Explorer or GNOME file-manager drag handoff, WebView playback, mixed-DPI placement, offline installation, or accessible focus behavior. See the [parity matrix](TAURI_PARITY_MATRIX.md) and [Phase 8 checklist](TAURI_VALIDATION_CHECKLIST.md).
