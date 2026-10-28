#!/usr/bin/env bash
set -euo pipefail

UUID='santra-wheel@santra.local'
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEST_ROOT="${XDG_DATA_HOME:-${HOME}/.local/share}/gnome-shell/extensions"
DEST_DIR="${DEST_ROOT}/${UUID}"

mkdir -p "$DEST_DIR"
cp -a "$SOURCE_DIR/." "$DEST_DIR/"
glib-compile-schemas --strict "$DEST_DIR/schemas"

gsettings --schemadir "$DEST_DIR/schemas" set org.gnome.shell.extensions.santra-wheel launch-method 'command'
gsettings --schemadir "$DEST_DIR/schemas" set org.gnome.shell.extensions.santra-wheel command-template 'santra --santra-wheel-action={action} --santra-global-wheel={mode} --santra-wheel-x={x} --santra-wheel-y={y}'

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
