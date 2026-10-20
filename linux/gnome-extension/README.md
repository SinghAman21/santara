# Santara Drag Wheel GNOME prototype

This GNOME Shell extension observes external XDND motion through Shell's `DND.dragMonitors` list. It uses `Main.xdndHandler` lifecycle signals to track drag start/end, polls pointer modifier state during the drag, and launches the configured command or URI when the wheel is shown, changes mode, or hides. It avoids starting a new app process for every pointer movement; the initial wheel position remains fixed while the user moves the drag over a slice.

The extension **does not inspect or receive file payloads**. The Santara Electron overlay must receive the actual drop and file list itself. Releasing a modifier keeps the wheel open at its trigger position while the pointer moves over a slice; ending the drag hides it. This prototype depends on private Shell modules and event details; GNOME can change those between releases. Test it on each GNOME version before deployment.

Compatibility is declared for GNOME 46 and GNOME 50. Both use the ES module extension format and expose the XDND handler and drag monitor behavior used here. GNOME 46 is a best-effort compatibility target; GNOME 47–49 are intentionally not listed as verified targets. Enable checks for the required drag monitor and XDND handler interfaces and logs a clear unsupported-version message when they are absent.

## Install

From this directory:

```sh
./install.sh
```

On Wayland, log out and back in if GNOME does not load the extension immediately. Check its state and logs with:

```sh
gnome-extensions info santara-wheel@santara.local
journalctl --user -f -o cat /usr/bin/gnome-shell
```

The installer resets saved extension settings to a known-good command template and invokes Santara's single-instance CLI using dedicated `--key=value` arguments. It passes `--ozone-platform=x11` before app startup because the overlay depends on XWayland window positioning. Install the Linux package or make the Santara executable available on `PATH` before enabling the extension. It sends only action, mode, and pointer coordinates; the actual dropped files must reach the Electron overlay. The extension invokes the app only when showing/changing or hiding the wheel, not on every pointer update.

```sh
EXT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/santara-wheel@santara.local"
gsettings --schemadir "$EXT_DIR/schemas" set org.gnome.shell.extensions.santara-wheel command-template 'santara --ozone-platform=x11 --santara-wheel-action={action} --santara-global-wheel={mode} --santara-wheel-x={x} --santara-wheel-y={y}'
```

The command is parsed into an argument vector and launched without a shell. Placeholders are substituted as single argument values. Configure a registered URI handler instead by setting `launch-method` to `uri` and updating `uri-template`:

```sh
gsettings --schemadir "$EXT_DIR/schemas" set org.gnome.shell.extensions.santara-wheel launch-method 'uri'
gsettings --schemadir "$EXT_DIR/schemas" set org.gnome.shell.extensions.santara-wheel uri-template 'santara://wheel?action={action}&mode={mode}&x={x}&y={y}'
```

The URI template is an optional alternative and is not registered by Santara; leave `launch-method` set to `command` unless you configure your own URI receiver.

Modifier defaults are Shift for conversions, Alt for tools, and Ctrl for actions. Values may be `shift`, `alt`, `ctrl`, or `ctrl-shift`:

```sh
gsettings --schemadir "$EXT_DIR/schemas" set org.gnome.shell.extensions.santara-wheel tools-modifier 'ctrl-shift'
```

If multiple bindings overlap, file actions take precedence, then tools, then conversion.

## Remove

```sh
./remove.sh
```

## Validate

From this directory, validate JavaScript syntax, metadata JSON, and the settings schema with:

```sh
node --input-type=module --check < extension.js && python3 -m json.tool metadata.json >/dev/null && glib-compile-schemas --strict --dry-run schemas
```

## Known limitations

- Linux placement uses GNOME pointer coordinates passed to the host, falling back to Electron's cursor location when unavailable; mixed-DPI and multi-monitor layouts still need manual verification.
- The integration cannot force a wheel over arbitrary client windows or receive the drag's URI list. The Electron window still needs to be the drop destination for file contents.
- External XDND drag updates arrive while the pointer moves. Modifier polling runs every 50 ms during the drag.
- The command template is implemented and targets Santara's installed single-instance CLI. The optional URI receiver is not registered or supported.
