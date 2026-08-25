#!/usr/bin/env bash
# Does the doc validator actually catch what it claims?
#
# Usage: bash tools/test_validate_docs.sh        (also: npm run validate:docs-test)
#
# WHY THIS EXISTS
# ---------------
# A gate nobody has tried to break is a gate nobody should trust. Two of the
# checks in validate_docs.js shipped enforcing nothing and were caught only by
# deliberately mutating them, so every check now has a case here that proves it
# fails for the right reason. `expect_fail` asserts the failure MESSAGE, not the
# exit status: a validator too broken to parse also exits non-zero, and a suite
# that accepts any non-zero exit reports "ok" for that.
#
# This used to be four times longer, because most of it built clone shapes — full
# depth, depth 2, depth 1 — for a freshness-stamp gate that has since been
# deleted. That gate asserted a doc had been edited recently, which git already
# answers, and bumping the stamp in the same commit always satisfied it. Deleting
# the claim deleted the gate, and deleting the gate deleted all of that
# machinery. What is left tests contracts: promises to a parent, the wire
# contract, and references that must not dangle.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

# A copy of the WORKING TREE — tracked plus not-yet-added, minus anything
# gitignored, minus index entries whose file is gone. Reading the index instead
# was a real bug: with a new migration unstaged, the copy disagreed with the docs
# and the suite blamed the docs.
TREE="$WORK/tree"
mkdir -p "$TREE"
(cd "$ROOT" \
	&& git ls-files -z --cached --others --exclude-standard --deduplicate \
	| while IFS= read -r -d '' f; do [ -f "$f" ] && printf '%s\0' "$f"; done \
	| tar -cf - --null -T -) | (cd "$TREE" && tar -xf -)

run() { (cd "$TREE" && node tools/validate_docs.js 2>&1); }

expect_pass() { # description
	local out status
	out="$(run)"; status=$?
	if [ "$status" -eq 0 ] && grep -q 'Documentation is internally consistent' <<<"$out"; then
		printf '  ok   %s\n' "$1"; pass=$((pass + 1))
	else
		printf '  FAIL %s (expected a clean pass)\n' "$1"
		grep -E '^- ' <<<"$out" | head -3 | sed 's/^/         /'
		fail=$((fail + 1))
	fi
}

expect_fail() { # description, needle
	local out status
	out="$(run)"; status=$?
	if [ "$status" -eq 0 ]; then
		printf '  FAIL %s (passed; expected failure)\n' "$1"; fail=$((fail + 1))
	elif grep -qF "$2" <<<"$out"; then
		printf '  ok   %s\n' "$1"; pass=$((pass + 1))
	else
		printf '  FAIL %s (failed for the WRONG reason)\n' "$1"
		printf '         wanted: %s\n' "$2"
		grep -E '^- |Error' <<<"$out" | head -2 | sed 's/^/         got:    /'
		fail=$((fail + 1))
	fi
}

# Mutate one file, run one case, put it back.
mutate() { # description, needle, file, sed-expression
	cp "$TREE/$3" "$WORK/bak"
	sed -i "$4" "$TREE/$3"
	expect_fail "$1" "$2"
	cp "$WORK/bak" "$TREE/$3"
}

echo "=== the clean tree passes ==="
expect_pass "clean tree passes"
expect_pass "clean tree passes under CI too"

echo "=== promises to a parent track the code that keeps them ==="
# PRIVACY.md states the window twice, in two sections a parent reads separately.
# One stale copy is the interesting case: an `includes` check is satisfied by the
# other one, which is how the first version of this gate passed here.
mutate "ONE stale copy of the retention window, with a fresh copy elsewhere" \
	"Every copy of a promise has to agree" \
	PRIVACY.md 's/kept for 30 days/kept for 90 days/'
mutate "BOTH copies drifted" "broken promise" \
	PRIVACY.md 's/30 days/90 days/g'
mutate "drifted retention window in the runbook" "broken promise" \
	deploy/RAILWAY.md 's/live 30 days/live 90 days/'
mutate "drifted save-history depth" "broken promise" \
	SECURITY.md 's/last 20 save versions/last 50 save versions/'

echo "=== the wire contract tracks the routes ==="
mutate "a documented route the server does not register" "does not register" \
	ARCHITECTURE.md 's#| `GET` | `/api/v1/health`#| `GET` | `/api/v1/ghost` | none | nope |\n| `GET` | `/api/v1/health`#'
mutate "a registered route with no row" "has no row for it" \
	ARCHITECTURE.md '\#| `DELETE` | `/api/v1/family`#d'

echo "=== the derived payload figures track the artifact ==="
mutate "drifted raw payload total" "payload totals" \
	deploy/RAILWAY.md 's/\*\*47.7 MB\*\*/**40.0 MB**/'
mutate "drifted first-launch transfer figure" "first-launch transfer figure" \
	deploy/RAILWAY.md 's/transfers about \*\*15.9 MB\*\*/transfers about **12.0 MB**/'

echo "=== references must not dangle ==="
mutate "a doc pointing at the retired Phaser tree" "retired Phaser tree" \
	PRODUCT.md '1a The loop lives in `src/systems/loop.ts`.'
mutate "a doc pointing at the deleted staging tree" "staging, not runtime" \
	PRODUCT.md '1a Art is staged in `ai_assets/`.'

echo "=== the roadmap may not record finished work ==="
mutate "a ticked checkbox in the roadmap" "must be DELETED" \
	roadmap.md '$a - [x] shipped the thing'

echo "=== a validator too broken to parse must not read as success ==="
printf '\nthis is not valid javascript(((\n' >> "$TREE/tools/validate_docs.js"
expect_fail "a syntax error is not mistaken for a caught defect" 'SyntaxError'

echo
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] || exit 1
