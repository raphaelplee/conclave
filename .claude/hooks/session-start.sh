#!/bin/bash
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

SOURCES="${CLAUDE_PROJECT_DIR:-.}/.claude/sources"
mkdir -p "$SOURCES"

fetch() {
  if [ -d "$SOURCES/$2/.git" ]; then
    git -C "$SOURCES/$2" pull --ff-only --quiet 2>/dev/null || true
  else
    git clone --single-branch --depth 1 --quiet \
      "https://github.com/$1.git" "$SOURCES/$2" 2>/dev/null ||
      echo "conclave: could not fetch $1" >&2
  fi
}

fetch obra/Superpowers                superpowers
fetch mattpocock/skills               mattpocock
fetch garrytan/gstack                 gstack
fetch Egonex-AI/Understand-Anything   understand-anything

echo "conclave protocol sources under .claude/sources:"
for dir in "$SOURCES"/*/; do
  [ -d "$dir" ] || continue
  count=$(find "$dir" -name SKILL.md -not -path '*/.git/*' | wc -l | tr -d ' ')
  echo "  $(basename "$dir") — $count SKILL.md"
done
