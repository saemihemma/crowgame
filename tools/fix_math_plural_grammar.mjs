#!/usr/bin/env node
/**
 * Correct the pools' English where a phrasing does not agree with its number.
 *
 * The authored pools got plural agreement wrong in 55 places, and a child reads
 * every one of them: "Think of 1 groups of 2." (x23), "1 groups of 2 makes 2."
 * (x23), "2 split into groups of 2 makes 1 groups." (x7), "There are 1
 * altogether." (x2). This was found while translating -- Icelandic makes the
 * same distinction and more sharply -- but it is an English bug, not a
 * translation one.
 *
 * WHY THIS IS A SEPARATE, COMMITTED STEP
 * -------------------------------------
 * `tools/derive_math_phrasing.mjs` must never rewrite canonical text; its whole
 * safety argument is that it only adds an overlay and verifies it against what is
 * already there. Correcting the English is a different act and gets its own tool,
 * which says exactly what it changed.
 *
 * It is committed rather than run once because `npm run math:materialize`
 * regenerates problems_curriculum.json from the authoring seed and would bring
 * the broken forms back. It runs as part of `npm run math:phrasing`, before the
 * derivation, and is idempotent.
 *
 * SCOPE: `hint` and `explanation` only. `prompt.text` is never touched -- it is
 * parsed by tools/math_verifier.ts and math-kernel/math/problemReplayKey.ts and compared
 * byte for byte by the golden fixtures. Nothing reads `hint` or `explanation`
 * except the renderers (verified: the fixtures use synthetic inline problems).
 *
 * Usage: node tools/fix_math_plural_grammar.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'fs';
import { matchers, render, PLURAL_PARAM, format, TEMPLATES } from './math_phrasing_catalog.mjs';

const POOL_DIRS = ['godot/data/math'];
const POOLS = ['problems_easy', 'problems_dataset', 'problems_gaps', 'problems_curriculum'];
const CHECK = process.argv.includes('--check');
const FIELDS = ['hint', 'explanation'];

let corrected = 0;
const samples = [];

for (const pool of POOLS) {
    const path = `${POOL_DIRS[0]}/${pool}.json`;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    let touched = false;

    for (const problem of data.problems ?? []) {
        for (const field of FIELDS) {
            const text = problem[field];
            if (!text) continue;

            for (const matcher of matchers[field]) {
                // Only plural-sensitive phrasings are in scope. Anything else
                // that fails to round-trip is a matcher problem for the
                // derivation to report, not text for this tool to rewrite.
                if (!(matcher.key in PLURAL_PARAM)) continue;
                const params = matcher.parse(text);
                if (!params) continue;

                // The matcher matched, so the text is one of the two forms. If
                // the correct form for this number differs, the text is wrong.
                const correct = render(matcher.key, params, TEMPLATES, 'en');
                if (correct !== null && correct !== text) {
                    if (samples.length < 6) samples.push({ id: problem.id, field, from: text, to: correct });
                    corrected++;
                    if (!CHECK) {
                        problem[field] = correct;
                        touched = true;
                    }
                }
                break;
            }
        }
    }

    if (touched && !CHECK) {
        const json = `${JSON.stringify(data, null, 2)}\n`;
        for (const dir of POOL_DIRS) writeFileSync(`${dir}/${pool}.json`, json, 'utf8');
    }
}

if (corrected === 0) {
    console.log('plural grammar: nothing to correct');
    process.exit(0);
}

console.log(`plural grammar: ${corrected} string(s) ${CHECK ? 'still wrong' : 'corrected'}`);
for (const s of samples) {
    console.log(`  ${s.id} ${s.field}`);
    console.log(`     was: ${JSON.stringify(s.from)}`);
    console.log(`     now: ${JSON.stringify(s.to)}`);
}
if (CHECK) {
    console.log('\nRun: node tools/fix_math_plural_grammar.mjs');
    process.exit(1);
}
