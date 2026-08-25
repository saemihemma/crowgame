#!/usr/bin/env bash
# Does the doc validator actually catch what it claims to?
#
# Usage: bash tools/test_validate_docs.sh
#
# WHY THIS EXISTS
# ---------------
# The freshness gate in validate_docs.js has shipped broken three times, and each
# time the local run looked fine:
#
#   1. It compared each stamp to `git log -1 -- <file>` and assumed a shallow
#      clone returns nothing for unknown files. It returns the graft commit for
#      EVERY file, so the gate demanded today's date on every doc and failed four
#      that were correct.
#   2. The replacement keyed on calendar-date equality, which fires on a full
#      clone too — every doc edited on the same day as HEAD was declined. It
#      judged 4 of 19, and a seven-month-stale stamp passed.
#   3. The fix after that was correct, but CI checked out at `fetch-depth: 2`,
#      where the only judgeable docs are those changed in the tip commit. On a
#      commit touching no docs it judged 0 of 19 and passed.
#
# Every one of those was a difference between the clone the author stood in and
# the clone CI stood in. Testing the mechanism could not find them; testing the
# mechanism IN BOTH CLONE SHAPES can. That testing existed but left no artifact,
# so it could not stop a fourth regression. This is the artifact.
#
# Run it after touching validate_docs.js or any checkout depth.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

# Test the WORKING TREE, not the last commit. `git clone` copies committed state,
# so the harness would validate the very bug you are trying to fix. It did that
# twice while being written: first reporting the zero-enforcement floor as broken
# when the floor was merely uncommitted, then failing the clean-tree case because
# the validator's new payload assertions described an uncommitted doc.
#
# Copying only the validator is not enough for the same reason — a gate and the
# docs it gates change together. So overlay every tracked file's current content
# onto the clone, keeping the clone's real .git for its history shape.
seed() { # dir
	(cd "$ROOT" && git ls-files -z | tar -cf - --null -T -) | (cd "$1" && tar -xf -)
}

check() { # description, expected (pass|fail), dir
	local desc="$1" expect="$2" dir="$3"
	local got
	if (cd "$dir" && node tools/validate_docs.js >/dev/null 2>&1); then got=pass; else got=fail; fi
	if [ "$got" = "$expect" ]; then
		printf '  ok   %-58s (%s)\n' "$desc" "$got"
		pass=$((pass + 1))
	else
		printf '  FAIL %-58s (expected %s, got %s)\n' "$desc" "$expect" "$got"
		fail=$((fail + 1))
	fi
}

stale_stamp() { # file, date
	sed -i "s/^Last verified against code: .*/Last verified against code: $2/" "$1"
}

echo "=== deep clone: every stamped doc must be judged ==="
DEEP="$WORK/deep"
git clone --quiet "file://$ROOT" "$DEEP"
seed "$DEEP"
(cd "$DEEP" && node tools/validate_docs.js 2>&1 | grep -E '^  freshness stamps:' | sed 's/^/  /')

check "clean tree passes" pass "$DEEP"

for doc in ARCHITECTURE.md ONBOARDING.md README.md PRODUCT.md roadmap.md brand/BRAND_SYSTEM.md deploy/RAILWAY.md; do
	cp "$DEEP/$doc" "$WORK/bak"
	stale_stamp "$DEEP/$doc" 2026-01-01
	check "stale stamp in $doc fails" fail "$DEEP"
	cp "$WORK/bak" "$DEEP/$doc"
done

# The floor: a gate that judges nothing must fail rather than print a number.
# Simulated by making the boundary swallow everything.
echo "=== a gate that can judge nothing must FAIL, not pass quietly ==="
SHALLOW="$WORK/shallow"
git clone --quiet --depth 1 "file://$ROOT" "$SHALLOW"
seed "$SHALLOW"
check "depth-1 clone (nothing judgeable) fails loudly" fail "$SHALLOW"

echo "=== depth-2 clone: the tip commit's own docs are still enforced ==="
DEEP2="$WORK/deep2"
git clone --quiet --depth 2 "file://$ROOT" "$DEEP2"
seed "$DEEP2"
CHANGED="$(cd "$DEEP2" && git diff --name-only HEAD~1 HEAD 2>/dev/null | grep '\.md$' | head -1)"
if [ -n "$CHANGED" ]; then
	cp "$DEEP2/$CHANGED" "$WORK/bak2"
	stale_stamp "$DEEP2/$CHANGED" 2026-01-01
	check "stale stamp in a tip-commit doc fails at depth 2" fail "$DEEP2"
	cp "$WORK/bak2" "$DEEP2/$CHANGED"
else
	echo "  skip  tip commit changed no .md file, so depth 2 has nothing to enforce"
	echo "        (this is exactly why CI checks out with fetch-depth: 0)"
fi

echo "=== the derived payload table must track the artifact ==="
cp "$DEEP/deploy/RAILWAY.md" "$WORK/bak3"
sed -i 's/| \*\*total\*\* | \*\*47.7 MB\*\*/| **total** | **40.0 MB**/' "$DEEP/deploy/RAILWAY.md"
check "a drifted raw payload total fails" fail "$DEEP"
cp "$WORK/bak3" "$DEEP/deploy/RAILWAY.md"

cp "$DEEP/deploy/RAILWAY.md" "$WORK/bak4"
sed -i 's/| 33.7 MB | 7.7 MB |/| 33.7 MB | 6.0 MB |/' "$DEEP/deploy/RAILWAY.md"
check "a drifted gzip figure fails" fail "$DEEP"
cp "$WORK/bak4" "$DEEP/deploy/RAILWAY.md"

echo
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] || exit 1
