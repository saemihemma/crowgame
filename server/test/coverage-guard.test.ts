import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The suites that need a database skip when DATABASE_URL is unset. That is a
 * deliberate local convenience (see README.md) — but node:test counts a skipped
 * `describe` as ONE passing test rather than as its children, so the run prints
 *
 *     # tests 11   # pass 11   # skipped 0
 *
 * and exits 0 while 20 of the 31 authored assertions never executed. `cloud save`
 * alone is 15 of them. A green tick that means "most of this did not run" is the
 * same defect as a threshold set below the data, and this repo has been deleting
 * those.
 *
 * So: in CI, a missing DATABASE_URL is a hard failure — coverage vanishing
 * silently there is how a regression ships. Locally it is a loud warning, which
 * keeps the documented "a machine without a database does not fail" behaviour.
 */
const HAS_DB = Boolean(process.env['DATABASE_URL']);
const IS_CI = Boolean(process.env['CI']);

test('database-backed coverage is not silently skipped', () => {
    if (HAS_DB) return;

    const message =
        'DATABASE_URL is not set, so the database-backed suites did not run. ' +
        'node:test still reports "skipped 0" because it counts a skipped describe ' +
        'as one passing test, so the summary above is not evidence of coverage.';

    assert.ok(IS_CI === false, `${message} In CI this is a failure: set DATABASE_URL.`);

    console.warn(`\n  !! ${message}\n`);
});
