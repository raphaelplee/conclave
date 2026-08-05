#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-staged}"
if [ "$MODE" = "staged" ]; then
  DIFF_CMD=(git diff --cached --unified=0)
else
  DIFF_CMD=(git diff --unified=0 "$MODE")
fi

FAIL=0

author_email=$(git config user.email || echo "")
case "$author_email" in
  *anthropic.com*|"")
    echo "TAO-GATE FAIL [author credentials]: git user.email is '${author_email:-unset}' — set the operator's identity before committing."
    FAIL=1
    ;;
esac

gsd_paths=$("${DIFF_CMD[@]}" --name-only 2>/dev/null | grep -E '(^|/)\.planning(/|$)' || true)
if [ -n "$gsd_paths" ]; then
  echo "TAO-GATE FAIL [no GSD]: GSD artifacts in the diff:"
  echo "$gsd_paths" | sed 's/^/  /'
  FAIL=1
fi

comment_hits=$("${DIFF_CMD[@]}" 2>/dev/null | awk '
  /^\+\+\+ b\// {
    file = substr($0, 7)
    skip = 0
    if (file ~ /\.(md|markdown|txt|http)$/) skip = 1
    if (file ~ /(^|\/)(package-info|module-info)\.java$/) skip = 1
    if (file ~ /(^|\/)(LICENSE|NOTICE|CODEOWNERS)/) skip = 1
    slash = 0; hash = 0
    if (file ~ /\.(java|kt|kts|ts|tsx|js|jsx|go|c|cc|cpp|h|hpp|cs|swift|scala|rs|proto|groovy|gradle)$/) slash = 1
    if (file ~ /\.(py|sh|bash|zsh|rb|pl|yaml|yml|tf|tfvars|hcl|toml|properties|conf|ini|env)$/) hash = 1
    next
  }
  /^\+/ && !skip {
    line = substr($0, 2)
    if (slash && line ~ /^[[:space:]]*(\/\/|\/\*|\*)/) print file ": " line
    if (hash && line ~ /^[[:space:]]*#/ && line !~ /^#!/) print file ": " line
  }
' || true)

if [ -n "$comment_hits" ]; then
  if [ -n "${TAO_GATE_ALLOW:-}" ]; then
    echo "TAO-GATE WAIVED [no comments]: operator grant: ${TAO_GATE_ALLOW}"
    echo "Record this grant verbatim in the deliverance (commit message or PR body)."
    echo "$comment_hits" | sed 's/^/  waived: /'
  else
    echo "TAO-GATE FAIL [no comments]: added comment lines (TAO: context belongs in the documents):"
    echo "$comment_hits" | sed 's/^/  /'
    echo "Fix: move the context into a document (ADR/spec/README) and delete the comment."
    echo "Operator-granted exception only: TAO_GATE_ALLOW=\"<who granted + why>\" $0 $MODE"
    FAIL=1
  fi
fi

if [ "$FAIL" -ne 0 ]; then
  echo "TAO-GATE: BLOCKED — the deliverance may not be committed, and may not claim TAO binding."
  exit 1
fi
echo "TAO-GATE: PASS (${MODE})"
