#!/usr/bin/env bash
set -euo pipefail

UUID='santra-wheel@santra.local'
DEST_ROOT="${XDG_DATA_HOME:-${HOME}/.local/share}/gnome-shell/extensions"
DEST_DIR="${DEST_ROOT}/${UUID}"

gnome-extensions disable "$UUID" 2>/dev/null || true
if [[ -d "$DEST_DIR" ]]; then
    rm -r -- "$DEST_DIR"
fi
printf 'Removed %s. Log out and back in if the extension was still loaded.\n' "$UUID"
