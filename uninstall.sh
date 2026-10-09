#!/usr/bin/env sh
# Photo-Mem uninstaller for macOS and Linux.
#
#   photo-mem uninstall
#   or: curl -fsSL https://raw.githubusercontent.com/Bloxx-I/Photo-Mem/HEAD/uninstall.sh | sh
set -eu

PREFIX="${PHOTO_MEM_HOME:-$HOME/.local/share/photo-mem}"
BIN_DIR="${PHOTO_MEM_BIN:-$HOME/.local/bin}"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"

say() { printf '\033[1;33m▸\033[0m %s\n' "$*"; }

if [ -f "$PREFIX/server.pid" ]; then
  kill "$(cat "$PREFIX/server.pid")" 2>/dev/null || true
  say "Server gestoppt"
fi

for target in "$BIN_DIR/photo-mem" "$APPS/photo-mem.desktop"; do
  if [ -e "$target" ]; then rm -f "$target"; say "Entfernt: $target"; fi
done

# Only delete the install folder if it really is a Photo-Mem install.
if [ -f "$PREFIX/app/index.html" ] && grep -q "Photo-Mem" "$PREFIX/app/index.html"; then
  rm -rf "$PREFIX"
  say "Entfernt: $PREFIX"
elif [ -e "$PREFIX" ]; then
  say "Übersprungen: $PREFIX sieht nicht nach einer Photo-Mem-Installation aus"
fi

say "Photo-Mem wurde deinstalliert."
say "Deine Lerndaten liegen im Browser. Zum Löschen vorher in der App: Statistik → „Alles von diesem Gerät löschen“."
