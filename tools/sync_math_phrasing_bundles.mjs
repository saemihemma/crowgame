#!/usr/bin/env node
/**
 * Push the catalog's English phrasing templates into the i18n bundles.
 *
 * `tools/math_phrasing_catalog.mjs` is the single source for the English side:
 * it is what the derivation parses against and round-trips through, so if the
 * bundle's English drifted from it the round trip would still pass while the game
 * rendered something else. Generating one from the other removes the possibility.
 *
 * The Icelandic side is NOT generated. It is hand-authored in strings_is.json
 * like every other key, and kept honest by tools/validate_i18n.mjs, which
 * enforces EN/IS lockstep, placeholder parity and the pixel fit budget.
 *
 * Usage: node tools/sync_math_phrasing_bundles.mjs [--check]
 *   --check exits non-zero on drift instead of writing. Used by npm run validate.
 */
import { readFileSync, writeFileSync } from 'fs';
import { TEMPLATES } from './math_phrasing_catalog.mjs';

const EN_BUNDLES = ['public/data/i18n/strings_en.json', 'godot/data/i18n/strings_en.json'];
const CHECK = process.argv.includes('--check');

let drifted = 0;
for (const path of EN_BUNDLES) {
    const bundle = JSON.parse(readFileSync(path, 'utf8'));
    const before = JSON.stringify(bundle);
    for (const [key, english] of Object.entries(TEMPLATES)) bundle[key] = english;
    const after = `${JSON.stringify(bundle, null, 2)}\n`;
    if (JSON.stringify(bundle) === before) {
        console.log(`  ok    ${path}`);
        continue;
    }
    drifted++;
    if (CHECK) {
        console.log(`  DRIFT ${path} does not match tools/math_phrasing_catalog.mjs`);
    } else {
        writeFileSync(path, after, 'utf8');
        console.log(`  wrote ${path}`);
    }
}

if (CHECK && drifted > 0) {
    console.log('\nRun: node tools/sync_math_phrasing_bundles.mjs');
    process.exit(1);
}
console.log(`${Object.keys(TEMPLATES).length} phrasing templates in ${EN_BUNDLES.length} English bundles`);
