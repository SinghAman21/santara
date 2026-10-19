# User guide

Santara is in development. The presence of a screen, menu item, or proposed format does not mean the corresponding engine operation has been implemented. Keep backups and use disposable copies while evaluating builds.

## Install

For a future verified Windows x64 build, run the NSIS installer and choose a per-user destination. For Linux x64, install the `.deb` through your distribution's package manager or make the AppImage executable and launch it. AppImage runtime requirements vary by distribution. Only run artifacts from a source you trust. This repository does not currently establish that any distributed installer is signed or tested.

## Convert files

Open Santara, use the file picker or drop files where supported, select an available operation and output format, choose an output location, and start the job. Inspect completion status and open the result before removing originals. Unsupported inputs, unavailable processors, or unimplemented operations should be explained rather than reported as successful conversions.

Optional system processors may be needed for some operations. Install only tools named by the implemented adapter, through their official source or your OS package manager. Restart Santara after changing PATH. A missing dependency should disable only the affected operations. There is no promise that installing every optional tool enables every proposed format.

## Navigation and settings

Use Tab and Shift+Tab to move focus, Enter or Space to activate buttons, and the visible navigation controls to switch sections. Settings should expose only options the application actually persists. Native/global drag shortcuts and a system-wide wheel are roadmap items until verified; browser keyboard tests do not establish OS-wide shortcut support.

Use Ctrl+O to add files and Ctrl+K to open format search. With files selected, Enter opens the operation picker; arrow keys navigate choices and Escape dismisses it. Click an individual filename to see routes for that file, or keep a mixed selection to see compatible options across files. Settings → General changes theme and processing preferences. The in-app drag action wheel is available, while conversion options are chosen after drop because external filenames are protected by Chromium before dropping. A global desktop/tray drop wheel is not implemented.

## Troubleshooting

- Missing processor: check the named dependency and executable version, then restart.
- Job failure: check the source is readable, destination writable, format supported, and disk space available; retain a redacted error report.
- Empty or damaged output: preserve the original and report the operation, OS, app version, dependency versions, and a minimal non-sensitive reproduction.
- Installer warnings: check publisher, provenance, and available hashes; follow your organization's security policy.

Do not submit private documents, credentials, full personal paths, or copyrighted sample collections in bug reports. Uninstall through Windows Installed Apps or your Linux package manager; an AppImage can be removed as a file. User settings and generated outputs may remain and should only be deleted intentionally.
