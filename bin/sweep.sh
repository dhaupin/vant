#!/bin/bash
# Vant test sweep — full-suite health gate for the axolotl branch.
#
# Usage:
#   bash bin/sweep.sh           # full sweep (all test/*.test.js + test/test-*.js)
#   bash bin/sweep.sh --quick   # quick subset (lib/ modules with the most
#                               #   impact during refactor: embed, escrow,
#                               #   cache, storage, transform, islands,
#                               #   lineage, backup, agents, brain)
#
# Exits 0 if all green, 1 if any test fails or breaks. Output is one
# line per test file with P=passed F=failed counts, plus a TOTAL line
# at the end.
#
# This is the entry point an agent (or human) should run before every
# commit on axolotl. If it doesn't say 1480/1480, do not commit.

set -u

# Find the repo root (one level up from bin/) regardless of CWD
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Quick mode: a curated subset for fast iteration during refactors
QUICK_SET=(
  "embed"
  "escrow"
  "cache"
  "storage"
  "transform"
  "islands"
  "lineage"
  "backup"
  "agents"
  "brain"
)

total_p=0
total_f=0
failing=()

if [ "${1:-}" = "--quick" ]; then
  echo "=== QUICK SWEEP (${#QUICK_SET[@]} files) ==="
  files=()
  for name in "${QUICK_SET[@]}"; do
    f="test/${name}.test.js"
    [ -f "$f" ] || continue
    files+=("$f")
  done
else
  echo "=== FULL SWEEP ==="
  files=($(ls test/*.test.js test/test-*.js 2>/dev/null | sort -u))
fi

for f in "${files[@]}"; do
  out=$(node "$f" 2>&1)
  # Match the last "Passed: N" / "Failed: N" pair explicitly
  p=$(echo "$out" | grep -E "^\s*Passed:\s*[0-9]+" | grep -oE "[0-9]+" | tail -1)
  fl=$(echo "$out" | grep -E "^\s*Failed:\s*[0-9]+" | grep -oE "[0-9]+" | tail -1)
  # Fallback to looser matchers used by some tests
  if [ -z "$p" ]; then
    p=$(echo "$out" | grep -oE "Results: [0-9]+ passed|[0-9]+ passed" | grep -oE "[0-9]+" | tail -1)
  fi
  if [ -z "$fl" ]; then
    fl=$(echo "$out" | grep -oE "Results:.*[0-9]+ failed|✗ [0-9]+" | grep -oE "[0-9]+" | tail -1)
  fi
  if [ -z "$p" ] && [ -z "$fl" ]; then
    if echo "$out" | grep -qE "Cannot find module|SyntaxError|TypeError"; then
      printf "  %-40s BROKEN\n" "$(basename "$f")"
      failing+=("$f")
    fi
    continue
  fi
  p=${p:-0}
  fl=${fl:-0}
  total_p=$((total_p + p))
  total_f=$((total_f + fl))
  marker="OK"
  if [ "$fl" != "0" ]; then
    marker="FAIL"
    failing+=("$f")
  fi
  printf "  %-40s P=%-3s F=%-3s  %s\n" "$(basename "$f")" "$p" "$fl" "$marker"
done

echo "---"
echo "TOTAL: P=$total_p F=$total_f"

if [ ${#failing[@]} -gt 0 ]; then
  echo "FAILING/BROKEN:"
  for f in "${failing[@]}"; do
    echo "  $f"
  done
  exit 1
fi

exit 0
