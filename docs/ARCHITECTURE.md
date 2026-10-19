# Architecture and boundaries

The intended flow is React/Vite renderer → narrow context-isolated preload bridge → Electron main process → engine adapter → local output file. This describes the integration contract; inspect the parent implementation before treating a security or capability requirement as satisfied.

| Layer | Responsibility |
| --- | --- |
| `dist/` | Built renderer, queue controls, capability explanations, settings, accessible navigation |
| `electron/preload.cjs` | Expose only specific typed operations; no raw IPC, filesystem, shell, or process API |
| `electron/main.mjs` | Window lifecycle, dialogs, validated IPC, engine coordination, output policy |
| Engine adapters | Discover optional dependencies, report truthful capabilities, validate inputs, execute/cancel jobs |
| System tools | Optional user-installed processors; no standalone GPL binaries embedded |

Require `contextIsolation: true`, `nodeIntegration: false`, and a sandbox where compatible. Restrict navigation and window creation, apply a content security policy, and validate external URLs before opening them. Validate sender/frame identity and all IPC arguments. Renderer-provided filenames, paths, options, and executable names are untrusted.

Spawn processors with argument arrays and no shell. Fix executable discovery policy, bound resource use and concurrency, support cancellation/timeouts, and capture bounded diagnostics. Archive extraction needs traversal and symlink protections plus decompression limits. Never overwrite an input by default; write a temporary sibling, validate success, then rename to the chosen destination. Protect existing output collisions and clean partial files after failure.

The capability registry should distinguish supported input/output pairs from UI categories. Include dependency availability, quality/metadata caveats, operation-specific limits, and a reason when disabled. Do not infer support from a file extension alone. Browser mocks exercise UI state only; native dialogs, filesystem behavior, processor execution, and packaged resource loading need separate integration checks.

Local processing is the intended design. A privacy promise requires a network audit of the final application, including telemetry, dependency discovery, update checks, crash reporting, and external links. No update service or background upload policy is implemented by this scaffold.
