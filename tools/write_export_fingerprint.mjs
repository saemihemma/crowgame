#!/usr/bin/env node
/**
 * Record what the Godot web export was built from.
 *
 * Called by godot/tools/build_web.sh right after the export. `npm run validate`
 * recomputes the same hash and fails if the committed export no longer matches
 * `godot/**` -- see tools/validate_export.mjs for why that gate exists.
 *
 * A separate file rather than an inline `node -e` in the build script: the shell
 * quoting needed to embed an ES module with template literals inside a heredoc
 * is unreadable and broke on the first run.
 */
import { writeFileSync } from 'fs';
import { computeGodotExportFingerprint } from './godot_export_fingerprint.mjs';

const root = process.argv[2] ?? '.';
const out = `${root}/output/web/build_fingerprint.json`;
const fingerprint = computeGodotExportFingerprint(root);
writeFileSync(out, `${JSON.stringify(fingerprint, null, 2)}\n`);
console.log(
    `Export fingerprint: ${fingerprint.value.slice(0, 16)}… over `
    + `${fingerprint.fileCount} source files`,
);
