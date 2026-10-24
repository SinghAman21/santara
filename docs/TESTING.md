# Testing

Run narrow checks first:

```bash
npm run typecheck
npm run test
npm run build
```

`npm run test` executes Rust service tests and the Windows watcher protocol tests. `npm run test:e2e` runs browser Playwright checks against the renderer with a mocked bridge; install Chromium with `npx playwright install chromium` first. These do not exercise native WebViews or a real file-manager drag.

The ordered native acceptance cases are in [TAURI_VALIDATION_CHECKLIST.md](TAURI_VALIDATION_CHECKLIST.md). Phase 8 must run them on Windows 10/11 x64 and Ubuntu LTS x64 after a clean checkout. Record actual installer and installed bytes separately, and keep failed or unrun gates marked pending. Wine can help test isolated Windows helper logic but is not native Windows acceptance.
