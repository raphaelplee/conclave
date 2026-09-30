#!/usr/bin/env bash
# Renders every fig-*.svg to a 2x PNG with headless Chromium (Playwright's build), cropped to the SVG size.
set -euo pipefail
cd "$(dirname "$0")"
CHROME=${CHROME:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}
for f in fig-*.svg; do
  w=$(sed -n 's/.*<svg[^>]*width="\([0-9]*\)".*/\1/p' "$f" | head -1)
  h=$(sed -n 's/.*<svg[^>]*height="\([0-9]*\)".*/\1/p' "$f" | head -1)
  html="/tmp/${f%.svg}.html"
  printf '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fcfcfb}svg{display:block}</style></head><body>%s</body></html>' "$(cat "$f")" > "$html"
  "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size="${w},$((h + 200))" --screenshot="${f%.svg}.png" "file://$html" >/dev/null 2>&1
  python3 - "${f%.svg}.png" "$((w * 2))" "$((h * 2))" <<'PY'
import sys; from PIL import Image
p, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
im = Image.open(p); im.crop((0, 0, w, h)).save(p, optimize=True)
PY
  echo "$f -> ${f%.svg}.png ($w x $h @2x)"
done
