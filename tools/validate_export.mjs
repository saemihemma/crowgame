#!/usr/bin/env node
/**
 * Fail when the committed Godot export no longer matches godot/**.
 *
 * `output/web` is not a build artifact in the usual sense -- it is the live
 * game. railway.json -> deploy/web/Dockerfile copies that directory straight
 * into Caddy, so a stale export means players are on an old build while the
 * source, the tests and the reviewers all look correct.
 *
 * That is not hypothetical: the export drifted a whole feature behind `godot/**`
 * unnoticed and cost a play session. Twice in one session I also told the owner a
 * stale pack was "cosmetic, internal, players never see it" -- exactly backwards.
 *
 * The check is a content hash rather than a timestamp because git does not
 * preserve mtimes; see tools/godot_export_fingerprint.mjs.
 */
import { existsSync, readFileSync } from 'fs';
import fg from 'fast-glob';
import { computeGodotExportFingerprint } from './godot_export_fingerprint.mjs';

const RECORD = 'output/web/build_fingerprint.json';
const failures = [];

// The pack is content-addressed (index.<buildId>.pck), so match the shape
// rather than a fixed name. Content addressing busts caches; it does not catch
// staleness, which is what the fingerprint below is for -- an export built from
// old sources still gets a perfectly valid content-addressed name.
const packs = fg.sync('output/web/index.*.pck', { onlyFiles: true });
if (packs.length === 0) {
    failures.push('no output/web/index.*.pck — the deploy directory has no game in it');
} else if (!existsSync(RECORD)) {
    failures.push(
        `${RECORD} is missing, so there is no way to tell whether the committed export `
        + 'matches godot/**. Re-export with: bash godot/tools/build_web.sh',
    );
} else {
    const recorded = JSON.parse(readFileSync(RECORD, 'utf8'));
    const actual = computeGodotExportFingerprint('.');
    if (recorded.value !== actual.value) {
        failures.push(
            'The committed Godot export is STALE. output/web is what Railway serves, so '
            + 'this means players would get an old build.\n'
            + `      recorded ${recorded.value.slice(0, 16)}… over ${recorded.fileCount} files\n`
            + `      current  ${actual.value.slice(0, 16)}… over ${actual.fileCount} files\n`
            + '      Re-export with: bash godot/tools/build_web.sh',
        );
    } else {
        console.log(
            `export freshness: clean (${actual.fileCount} source files, `
            + `${actual.value.slice(0, 12)}…)`,
        );
    }
}

if (failures.length > 0) {
    console.log(`export freshness: ${failures.length} problem(s)`);
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
}
