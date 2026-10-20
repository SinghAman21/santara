#!/usr/bin/env bash
set -euo pipefail

UUID='santara-wheel@santara.local'
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEST_ROOT="${XDG_DATA_HOME:-${HOME}/.local/share}/gnome-shell/extensions"
DEST_DIR="${DEST_ROOT}/${UUID}"

mkdir -p "$DEST_DIR"
cp -a "$SOURCE_DIR/." "$DEST_DIR/"
glib-compile-schemas --strict "$DEST_DIR/schemas"

gsettings --schemadir "$DEST_DIR/schemas" set org.gnome.shell.extensions.santara-wheel launch-method 'command'
gsettings --schemadir "$DEST_DIR/schemas" set org.gnome.shell.extensions.santara-wheel command-template 'santara --ozone-platform=x11 --santara-wheel-action={action} --santara-global-wheel={mode} --santara-wheel-x={x} --santara-wheel-y={y}'

python3 - "$UUID" <<'PY'
import ast
import subprocess
import sys

uuid = sys.argv[1]
schema = 'org.gnome.shell'
key = 'enabled-extensions'
current = subprocess.check_output(['gsettings', 'get', schema, key], text=True).strip()
if current.startswith('@as '):
    current = current[4:].strip()
extensions = ast.literal_eval(current)
if uuid not in extensions:
    extensions.append(uuid)
subprocess.run(['gsettings', 'set', schema, key, repr(extensions)], check=True)
PY

printf 'Installed and enabled %s. Log out and back in to load it in GNOME Shell.\n' "$UUID"
