#!/usr/bin/env bash
# Does the doc validator actually catch what it claims to?
#
# Usage: bash tools/test_validate_docs.sh        (also: npm run validate:docs-test)
#
# WHY THIS EXISTS
# ---------------
# The freshness gate in validate_docs.js shipped broken three times, and every
# time the author's local run looked fine:
#
#   1. It compared each stamp to `git log -1 -- <file>` and assumed a shallow
#      clone returns nothing for unknown files. It returns the graft commit for
#      EVERY file, so the gate demanded today's date on every doc and failed four
#      that were correct.
#   2. The replacement keyed on calendar-date equality, which fires on a full
#      clone too — every doc edited on the same day as HEAD was declined. It
#      judged 4 of 19 while a seven-month-stale stamp passed.
#   3. The fix after that was correct, but CI checked out at `fetch-depth: 2`,
#      where the only judgeable docs are those changed in the tip commit. On a
#      commit touching no docs it judged 0 of 19 and passed.
#
# All three were one failure: the clone the author stood in differed from the
# clone CI stood in. So this tests the DEPLOYED CONFIGURATION — including that a
# depth regression breaks the build — in the clone shapes that actually occur,
# and it asserts WHY a run failed rather than merely that it did. A suite that
# accepts any non-zero exit reports "ok" for a validator too broken to parse.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

# Test the WORKING TREE, not the last commit. `git clone` copies committed state,
# so the harness would validate the very bug you are trying to fix. It did that
# twice while being written: first reporting the uncommitted zero-enforcement
# floor as broken, then failing the clean-tree case because the validator's new
# payload assertions described an uncommitted doc. A gate and the docs it gates
# change together, so overlay every tracked file onto the clone's real history.
seed() { # dir
	(cd "$ROOT" && git ls-files -z | tar -cf - --null -T -) | (cd "$1" && tar -xf -)
}

run_validator() { # dir, [env assignments...]
	local dir="$1"; shift
	(cd "$dir" && env "$@" node tools/validate_docs.js 2>&1)
}

expect_pass() { # description, dir, [env...]
	local desc="$1" dir="$2"; shift 2
	local out status
	out="$(run_validator "$dir" "$@")"; status=$?
	if [ "$status" -eq 0 ] && grep -q 'Documentation is internally consistent' <<<"$out"; then
		printf '  ok   %s\n' "$desc"; pass=$((pass + 1))
	else
		printf '  FAIL %s (expected a clean pass)\n' "$desc"
		grep -E '^- ' <<<"$out" | head -3 | sed 's/^/         /'
		fail=$((fail + 1))
	fi
}

# Assert on the REASON, not the exit status.
#
# This used to compare exit codes only. Appending a syntax error to the validator
# makes it exit 1, and almost every case expected non-zero — so a validator that
# could not parse reported "ok" nearly everywhere, and only the clean-tree case
# dissented. Every failing case now names the message it expects.
expect_fail() { # description, needle, dir, [env...]
	local desc="$1" needle="$2" dir="$3"; shift 3
	local out status
	out="$(run_validator "$dir" "$@")"; status=$?
	if [ "$status" -eq 0 ]; then
		printf '  FAIL %s (passed; expected failure)\n' "$desc"; fail=$((fail + 1))
	elif grep -qF "$needle" <<<"$out"; then
		printf '  ok   %s\n' "$desc"; pass=$((pass + 1))
	else
		printf '  FAIL %s (failed for the WRONG reason)\n' "$desc"
		printf '         wanted: %s\n' "$needle"
		grep -E '^- |Error' <<<"$out" | head -2 | sed 's/^/         got:    /'
		fail=$((fail + 1))
	fi
}

stale() { sed -i "s/^Last verified against code: .*/Last verified against code: $2/" "$1"; }

echo "=== full history: every stamped doc is judged ==="
DEEP="$WORK/deep"
git clone --quiet "file://$ROOT" "$DEEP"; seed "$DEEP"
run_validator "$DEEP" | grep -E '^  freshness stamps:' | sed 's/^/  /'
expect_pass "clean tree passes" "$DEEP"
expect_pass "clean tree passes under CI too" "$DEEP" CI=true

for doc in ARCHITECTURE.md ONBOARDING.md README.md PRODUCT.md roadmap.md brand/BRAND_SYSTEM.md deploy/RAILWAY.md; do
	cp "$DEEP/$doc" "$WORK/bak"; stale "$DEEP/$doc" 2026-01-01
	expect_fail "stale stamp in $doc" "predates the file's own last commit" "$DEEP"
	cp "$WORK/bak" "$DEEP/$doc"
done

echo "=== the deployed configuration: partial coverage must fail in CI ==="
# THE CASE THAT PINS THE REGRESSION PATH. A depth-2 clone whose tip commit touches
# a doc judges only that doc and declines the rest. Before the CI floor, it exited
# 0 with five Status: Current docs carrying stale stamps — so a regression to
# fetch-depth: 2 was invisible, and only a literal `0` in ci.yml plus a sentence
# in CONTRIBUTING.md stood between this gate and irrelevance. Note the shapes are
# built with file:// clones because --depth is ignored for local path clones.
D2="$WORK/d2"
git clone --quiet --depth 2 "file://$ROOT" "$D2"; seed "$D2"
expect_fail "depth-2 checkout fails in CI even with every doc honest" \
	'could not be dated because their' "$D2" CI=true
for doc in ARCHITECTURE.md ONBOARDING.md README.md PRODUCT.md roadmap.md; do
	stale "$D2/$doc" 2026-01-01
done
expect_fail "depth-2 clone hiding stale NON-tip docs fails in CI" \
	'could not be dated because their' "$D2" CI=true

echo "=== a clone that can judge nothing fails, CI or not ==="
D1="$WORK/d1"
git clone --quiet --depth 1 "file://$ROOT" "$D1"; seed "$D1"
expect_fail "depth-1 clone fails loudly" "enforced nothing" "$D1"
expect_fail "depth-1 clone fails under CI as well" "enforced nothing" "$D1" CI=true

echo "=== the derived payload figures track the artifact ==="
cp "$DEEP/deploy/RAILWAY.md" "$WORK/bak"
sed -i 's/| \*\*total\*\* | \*\*47.7 MB\*\*/| **total** | **40.0 MB**/' "$DEEP/deploy/RAILWAY.md"
expect_fail "drifted raw payload total" "payload totals" "$DEEP"
cp "$WORK/bak" "$DEEP/deploy/RAILWAY.md"

cp "$DEEP/deploy/RAILWAY.md" "$WORK/bak"
sed -i 's/| 33.7 MB | 7.7 MB |/| 33.7 MB | 6.0 MB |/' "$DEEP/deploy/RAILWAY.md"
expect_fail "drifted gzip figure" "wasm payload row" "$DEEP"
cp "$WORK/bak" "$DEEP/deploy/RAILWAY.md"

cp "$DEEP/deploy/RAILWAY.md" "$WORK/bak"
sed -i 's/transfers about \*\*15.9 MB\*\*/transfers about **12.0 MB**/' "$DEEP/deploy/RAILWAY.md"
expect_fail "drifted first-launch transfer figure" "first-launch transfer figure" "$DEEP"
cp "$WORK/bak" "$DEEP/deploy/RAILWAY.md"

echo "=== a validator too broken to parse must not read as success ==="
BROKEN="$WORK/broken"
git clone --quiet "file://$ROOT" "$BROKEN"; seed "$BROKEN"
printf '\nthis is not valid javascript(((\n' >> "$BROKEN/tools/validate_docs.js"
expect_fail "a syntax error is not mistaken for a caught defect" \
	'SyntaxError' "$BROKEN"

echo
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] || exit 1
