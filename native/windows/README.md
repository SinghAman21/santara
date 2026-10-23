# Santara Windows drag watcher prototype

This isolated Windows x64 helper watches the current interactive desktop for a left-button drag that crosses the Windows drag threshold while Shift, Alt, or Control is held. It writes one compact JSON object per line to stdout:

```json
{"type":"show","mode":"convert","x":840,"y":520}
{"type":"move","mode":"convert","x":856,"y":532}
{"type":"hide","mode":"convert","x":856,"y":532}
```

Default mappings are Shift → `convert`, Alt → `tools`, Control → `actions`. Change them with `--shift-mode`, `--alt-mode`, `--control-mode`, or `--ctrl-shift-mode`; accepted mode names are `convert`, `tools`, `actions`, and `none` (unassigned). Configured Ctrl+Shift takes priority, then Shift, Alt, and Control. A mode change emits a new `show`; releasing all mapped modifiers emits `hide`. Coordinates are screen pixels and can be negative on monitors left of or above the primary display.

Releasing a modifier leaves the last selected wheel visible. The wheel hides only when the drag ends. The helper is a prototype and has not yet been exercised with real Explorer drags on Windows. It uses user-mode `WH_MOUSE_LL` and `WH_KEYBOARD_LL` hooks on the launching user's interactive desktop. It does not elevate, inspect files, read the clipboard, access the network, or register a drop target. The Tauri overlay must own the actual file drop. This process only reports modifier and pointer state; it cannot make the overlay receive drags that the OS routes elsewhere. Tauri starts only the bundled helper from its resource directory (or the local development build) and terminates it on exit.

## Build and test on Windows

Install Visual Studio Build Tools with the Desktop development with C++ workload and Windows SDK. Open Developer PowerShell for Visual Studio (x64), then from the repository root run:

```powershell
./native/windows/build.ps1
node --test .\native\windows\protocol.test.mjs
```

The script builds `native\windows\build\santara-drag-watcher.exe` and runs the helper's transition self-test. The same commands can run in a Windows CI job after initializing the MSVC x64 developer environment. Packaging must place this helper under Tauri's `native/` resource directory; a missing helper leaves the workspace and direct drop available.

## Linux cross-build for the Windows installer

For an Ubuntu x64 cross-build, install Wine and the MinGW-w64 x64 compiler (`sudo apt install wine g++-mingw-w64-x86-64`) and run `npm run dist:windows` from the repository root. The script cross-compiles this helper, runs its state self-test under Wine, then invokes electron-builder for the NSIS installer. Native Windows/MSVC builds remain the preferred release validation path.

## Manual hook check

Start the executable in a console:

```powershell
./native/windows/build/santara-drag-watcher.exe
```

Drag any item across the desktop while holding Shift, Alt, or Control. Observe `show`, `move`, and `hide` lines; stop with Ctrl+C. The helper does not need or receive the dragged file path. This manual check should be completed on supported Windows versions before treating the prototype as reliable.
