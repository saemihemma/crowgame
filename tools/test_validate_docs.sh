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
#   4. And then this harness itself, which cloned the repo to build its clone
#      shapes. CI checks out with `filter: 'blob:none'` — a PARTIAL clone — so
#      `git clone file://.` asks it to serve blobs it never fetched:
#        remote: fatal: could not fetch <sha> from promisor remote
#      Fifteen of seventeen cases died. The artifact written to stop the author's
#      environment differing from CI's was itself built on an assumption about
#      the author's environment.
#
# All four were one failure: something assumed a clone shape. So this builds its
# OWN repository from the working tree — no dependency on how the host checkout
# was fetched — and derives every clone shape from that. It tests the DEPLOYED
# CONFIGURATION, including that a depth regression breaks the build, and it
# asserts WHY a run failed rather than merely that it did: a suite that accepts
# any non-zero exit reports "ok" for a validator too broken to parse.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

# One self-contained repository built from the WORKING TREE, with real history.
#
# Not a clone of $ROOT: that inherits whatever shape the host was fetched with,
# which is the bug above. Not a copy without git either — the gate under test
# reads git history, so it needs commits. Two of them, the second touching one
# doc, which is what makes the depth-2 shape meaningful.
#
# The files CI will check out AFTER this change is committed: tracked plus
# not-yet-added, minus anything gitignored, minus index entries whose file is gone
# from the working tree.
#
# `git ls-files -z` alone was wrong, and wrong in the harness's signature way — it
# lists the INDEX. Run with a new migration not yet `git add`ed and a rebuilt
# export whose content-id filenames had changed, the fixture had 2 migrations
# where ONBOARDING.md said 3, and no wasm or pck at all because tar was handed
# paths that no longer exist. Two cases failed, blaming the docs. The harness
# written to stop something assuming the shape of its environment was assuming
# the author had staged.
build_fixture() { # dir
	mkdir -p "$1"
	(cd "$ROOT" \
		&& git ls-files -z --cached --others --exclude-standard --deduplicate \
		| while IFS= read -r -d '' f; do [ -f "$f" ] && printf '%s\0' "$f"; done \
		| tar -cf - --null -T -) | (cd "$1" && tar -xf -)
	git -C "$1" init --quiet -b main
	# The commits are DATED, and that matters. Committed "now", every file's
	# last-touch is today, so any doc whose stamp is older than today reads as
	# stale — three small READMEs carry 2026-08-2x stamps that are correct in the
	# real repo, and the fixture failed them. Backdating the bulk commit to before
	# every stamp keeps the honest docs honest; the mutation cases below use a date
	# older still, so they are genuinely in the past relative to it.
	local base='2026-01-01T00:00:00Z'
	local tip='2026-08-25T00:00:00Z'
	git -C "$1" -c user.email=h@x -c user.name=h add -A
	GIT_AUTHOR_DATE="$base" GIT_COMMITTER_DATE="$base" \
		git -C "$1" -c user.email=h@x -c user.name=h commit --quiet -m 'fixture: the working tree'
	# A second, later commit touching exactly one doc, so a depth-2 clone of this
	# fixture has one judgeable doc and declines the rest — the shape that used to
	# pass while hiding stale stamps.
	printf '\n' >> "$1/PRODUCT.md"
	GIT_AUTHOR_DATE="$tip" GIT_COMMITTER_DATE="$tip" \
		git -C "$1" -c user.email=h@x -c user.name=h commit --quiet -am 'fixture: touch one doc'
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

FIXTURE="$WORK/fixture"
build_fixture "$FIXTURE"

echo "=== full history: every stamped doc is judged ==="
DEEP="$WORK/deep"
git clone --quiet "file://$FIXTURE" "$DEEP"
run_validator "$DEEP" | grep -E '^  freshness stamps:' | sed 's/^/  /'
expect_pass "clean tree passes" "$DEEP"
expect_pass "clean tree passes under CI too" "$DEEP" CI=true

for doc in ARCHITECTURE.md ONBOARDING.md README.md PRODUCT.md roadmap.md brand/BRAND_SYSTEM.md deploy/RAILWAY.md; do
	cp "$DEEP/$doc" "$WORK/bak"; stale "$DEEP/$doc" 2020-01-01
	expect_fail "stale stamp in $doc" "predates the file's own last commit" "$DEEP"
	cp "$WORK/bak" "$DEEP/$doc"
done

echo "=== the deployed configuration: partial coverage must fail in CI ==="
# THE CASE THAT PINS THE REGRESSION PATH. A depth-2 clone whose tip commit touches
# a doc judges only that doc and declines the rest. Before the CI floor, it exited
# 0 with five Status: Current docs carrying stale stamps — so a regression to
# fetch-depth: 2 was invisible, and only a literal `0` in ci.yml plus a sentence
# in CONTRIBUTING.md stood between this gate and irrelevance. Note the shapes are
# built with file:// clones of the fixture, because --depth is ignored for a
# plain local-path clone.
D2="$WORK/d2"
git clone --quiet --depth 2 "file://$FIXTURE" "$D2"
expect_fail "depth-2 checkout fails in CI even with every doc honest" \
	'could not be dated because their' "$D2" CI=true
for doc in ARCHITECTURE.md ONBOARDING.md README.md PRODUCT.md roadmap.md; do
	stale "$D2/$doc" 2020-01-01
done
expect_fail "depth-2 clone hiding stale NON-tip docs fails in CI" \
	'could not be dated because their' "$D2" CI=true

echo "=== a clone that can judge nothing fails, CI or not ==="
D1="$WORK/d1"
git clone --quiet --depth 1 "file://$FIXTURE" "$D1"
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
git clone --quiet "file://$FIXTURE" "$BROKEN"
printf '\nthis is not valid javascript(((\n' >> "$BROKEN/tools/validate_docs.js"
expect_fail "a syntax error is not mistaken for a caught defect" \
	'SyntaxError' "$BROKEN"

echo
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] || exit 1
