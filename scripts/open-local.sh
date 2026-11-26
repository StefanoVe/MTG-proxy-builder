#!/bin/zsh
# Costruisce e apre l'app in locale con un profilo separato da quello installato.
# Uso: scripts/open-local.sh [--no-build] [--fresh]
#   --no-build  salta la build (usa dist/ esistente)
#   --fresh     parte da un profilo vuoto
set -euo pipefail
cd "${0:A:h}/.."
profile="${MTG_DEV_PROFILE:-$HOME/Library/Application Support/mtg-proxy-builder-dev}"
build=1
for arg in "$@"; do
  case $arg in
    --no-build) build=0 ;;
    --fresh) rm -rf "$profile" ;;
    *) echo "Opzione sconosciuta: $arg" >&2; exit 2 ;;
  esac
done
((build)) && npm run build
exec npx electron . --user-data-dir="$profile"
