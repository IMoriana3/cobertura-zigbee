#!/usr/bin/env bash
# H.2 — MANIFEST de los artefactos de la segunda pasada: nombre, tamaño, sha256.
# Ejecutable:  bash audit2/manifiesto.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=audit2/out
{
  echo "MANIFEST — audit2/out"
  echo "generado   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit     $(git rev-parse HEAD)"
  echo "node       $(node --version)"
  echo "sha256sum  $(sha256sum --version | head -1)"
  echo
  printf '%-26s %12s  %s\n' "fichero" "bytes" "sha256"
  printf '%-26s %12s  %s\n' "--------------------------" "------------" "----------------------------------------------------------------"
  for f in $(ls -1 "$OUT" | sort); do
    [ "$f" = "MANIFEST.txt" ] && continue
    printf '%-26s %12s  %s\n' "$f" "$(stat -c%s "$OUT/$f")" "$(sha256sum "$OUT/$f" | cut -d' ' -f1)"
  done
  echo
  echo "scripts de audit2/ (los que producen lo anterior)"
  printf '%-30s %12s  %s\n' "script" "bytes" "sha256"
  for f in $(ls -1 audit2/*.mjs audit2/*.py audit2/*.sh 2>/dev/null | xargs -n1 basename | sort); do
    p=audit2/$f
    printf '%-30s %12s  %s\n' "$f" "$(stat -c%s "$p")" "$(sha256sum "$p" | cut -d' ' -f1)"
  done
} > "$OUT/MANIFEST.txt"
echo "escrito $OUT/MANIFEST.txt ($(wc -l < "$OUT/MANIFEST.txt") líneas)"
