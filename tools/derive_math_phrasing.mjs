#!/usr/bin/env node
/**
 * Derive localisable phrasing for the math pools.
 *
 * The problems ask their questions in English: "Complete: 2 + 0 = ?", "Start at
 * 3, then count 4 more.", "5 plus 2 makes 7." Roughly 8200 such strings across
 * 3000 problems -- but only about 60 distinct phrasings, because the numbers are
 * parameters and the wording repeats. So we localise the phrasing, not the
 * problems.
 *
 * WHAT THIS DOES NOT TOUCH
 * ------------------------
 * `prompt.text`, `hint` and `explanation` stay exactly as they are, in English,
 * and stay canonical. Four separate things read them and would break if they
 * became Icelandic:
 *
 *   - tools/math_verifier.ts recomputes the answer by regex-parsing operands out
 *     of prompt.text, which is the only independent check that a problem's
 *     answer is arithmetically right;
 *   - src/math/problemReplayKey.ts builds the anti-repeat key from prompt.text,
 *     including literal English tests like startsWith('count these:');
 *   - buildPromptUniquenessKey dedupes the pools on prompt.text;
 *   - the golden fixtures shared with the Godot parity tests.
 *
 * So localisation is a render-time overlay, never a data rewrite.
 *
 * WHAT IT ADDS
 * ------------
 * An optional `phrasing` sibling per problem:
 *
 *   "phrasing": {
 *     "prompt":      { "key": "math.prompt.arith.complete", "params": { "a": 2, "op": "+", "b": 0 } },
 *     "hint":        { "key": "math.hint.count_on",         "params": { "a": 2, "b": 0 } },
 *     "explanation": { "key": "math.expl.add",              "params": { "a": 2, "b": 0, "sum": 2 } }
 *   }
 *
 * Params carry numbers and locale-neutral payloads only (operator symbols, glyph
 * runs, comma-joined sequences). All natural language lives in the template, in
 * the i18n bundles, so it inherits the lockstep, glyph-allowlist and
 * placeholder-parity guards that already exist.
 *
 * TWO GATES, AND ONLY ONE OF THEM IS WORTH MUCH
 * ---------------------------------------------
 * Every derivation is rendered back through the ENGLISH template and must
 * reproduce the original string exactly. That gate is cheap and nearly free of
 * false positives -- and nearly worthless on its own, because the matchers in
 * math_phrasing_catalog.mjs are GENERATED FROM those templates, so the round trip
 * is true by construction. Corrupting a template two different ways (swapping
 * `{a}` and `{b}` in math.hint.count_back, and splitting its repeated `{mid}`)
 * round-tripped 3000/3000 clean, and the first of those renders a hint that lies
 * to the child. It keeps its place because it still catches number formatting and
 * a params/placeholder name mismatch, but it is not the check that matters.
 *
 * The check that matters is SEMANTIC, and it is grounded outside the catalog: the
 * numbers a phrasing captured must agree arithmetically with that problem's own
 * `answer.correct`, which no template can influence. "Start at {a}, then count
 * back {b}." must satisfy a - b == answer. Both corruptions above fail it
 * immediately.
 *
 * A problem that fails either gate gets no phrasing entry and keeps showing
 * English. Templates with no verifier are reported rather than counted as passes,
 * so the gap stays visible.
 *
 * Usage:
 *   node tools/derive_math_phrasing.mjs [--write] [--report]
 * Without --write it reports coverage and changes nothing.
 */
import { readFileSync, writeFileSync } from 'fs';
import { format, TEMPLATES, matchers, verify } from './math_phrasing_catalog.mjs';

const POOL_DIRS = ['public/data/math', 'godot/data/math'];
const POOLS = ['problems_easy', 'problems_dataset', 'problems_gaps', 'problems_curriculum'];
const WRITE = process.argv.includes('--write');
const REPORT = process.argv.includes('--report');

const stats = {
    problems: 0,
    fields: { prompt: 0, hint: 0, explanation: 0 },
    matched: { prompt: 0, hint: 0, explanation: 0 },
    localeNeutral: { prompt: 0, hint: 0, explanation: 0 },
    roundTripRejected: [],
    semanticRejected: [],
    unverified: new Map(),
    unmatched: { prompt: new Map(), hint: new Map(), explanation: new Map() },
    keyUse: new Map(),
};

const hasWords = s => /[A-Za-z]{2,}/.test(s ?? '');

function note(map, text) {
    const skeleton = String(text).replace(/\d+/g, 'N').replace(/\s+/g, ' ').trim();
    map.set(skeleton, (map.get(skeleton) ?? 0) + 1);
}

/**
 * Derive one field. Returns { key, params } on a verified match, 'neutral' when
 * the text has no natural language to translate, or null when nothing matched.
 */
function derive(field, problem, text) {
    if (!text) return null;
    if (!hasWords(text)) return 'neutral';

    for (const matcher of matchers[field]) {
        const params = matcher.parse(text, problem);
        if (!params) continue;

        const template = TEMPLATES[matcher.key];
        if (template === undefined) {
            throw new Error(`matcher ${matcher.key} has no English template`);
        }

        // Gate 1: the English render must reproduce the original exactly.
        const rendered = format(template, params);
        if (rendered !== text) {
            stats.roundTripRejected.push({
                id: problem.id, field, key: matcher.key,
                original: text, rendered,
            });
            continue;
        }

        // Gate 2: the numbers must agree with the problem's own answer.
        const problem_ = verify(matcher.key, params, problem);
        if (problem_ === undefined) {
            stats.unverified.set(matcher.key, (stats.unverified.get(matcher.key) ?? 0) + 1);
        } else if (problem_ !== null) {
            stats.semanticRejected.push({
                id: problem.id, field, key: matcher.key, text, reason: problem_,
            });
            continue;
        }

        stats.keyUse.set(matcher.key, (stats.keyUse.get(matcher.key) ?? 0) + 1);
        return { key: matcher.key, params };
    }
    return null;
}

let changed = 0;

for (const pool of POOLS) {
    const primary = `${POOL_DIRS[0]}/${pool}.json`;
    const data = JSON.parse(readFileSync(primary, 'utf8'));

    for (const problem of data.problems ?? []) {
        stats.problems++;
        const phrasing = {};

        const fields = {
            prompt: problem.prompt?.text ?? '',
            hint: problem.hint ?? '',
            explanation: problem.explanation ?? '',
        };

        for (const [field, text] of Object.entries(fields)) {
            if (!text) continue;
            stats.fields[field]++;
            const result = derive(field, problem, text);
            if (result === 'neutral') {
                stats.localeNeutral[field]++;
            } else if (result) {
                stats.matched[field]++;
                phrasing[field] = result;
            } else {
                note(stats.unmatched[field], text);
            }
        }

        if (Object.keys(phrasing).length > 0) {
            problem.phrasing = phrasing;
            changed++;
        } else {
            delete problem.phrasing;
        }
    }

    if (WRITE) {
        const json = `${JSON.stringify(data, null, 2)}\n`;
        for (const dir of POOL_DIRS) writeFileSync(`${dir}/${pool}.json`, json, 'utf8');
    }
}

// ── report ─────────────────────────────────────────────────────────────────
const pct = (n, d) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
console.log(`problems: ${stats.problems}   with phrasing: ${changed}`);
for (const field of ['prompt', 'hint', 'explanation']) {
    const total = stats.fields[field];
    const done = stats.matched[field] + stats.localeNeutral[field];
    console.log(
        `  ${field.padEnd(12)} ${String(total).padStart(4)} present   `
        + `${String(stats.matched[field]).padStart(4)} templated   `
        + `${String(stats.localeNeutral[field]).padStart(4)} locale-neutral   `
        + `covered ${pct(done, total)}`,
    );
}

const unverifiedStrings = [...stats.unverified.values()].reduce((a, b) => a + b, 0);
console.log(`templates used: ${stats.keyUse.size}   `
    + `semantically verified: ${stats.keyUse.size - stats.unverified.size} templates, `
    + `${unverifiedStrings} strings rely on the round trip alone`);

if (stats.semanticRejected.length > 0) {
    console.log(`\nsemantic rejections: ${stats.semanticRejected.length} (left as English)`);
    const byKey = new Map();
    for (const r of stats.semanticRejected) byKey.set(r.key, (byKey.get(r.key) ?? 0) + 1);
    for (const [key, n] of [...byKey].sort((a, b) => b[1] - a[1])) {
        const sample = stats.semanticRejected.find(r => r.key === key);
        console.log(`  ${String(n).padStart(4)}  ${key}`);
        console.log(`        e.g. ${sample.id}: ${JSON.stringify(sample.text)} — ${sample.reason}`);
    }
}

if (stats.roundTripRejected.length > 0) {
    console.log(`\nround-trip rejections: ${stats.roundTripRejected.length} (left as English)`);
    for (const r of stats.roundTripRejected.slice(0, 8)) {
        console.log(`  ${r.id} ${r.field} via ${r.key}`);
        console.log(`     original: ${JSON.stringify(r.original)}`);
        console.log(`     rendered: ${JSON.stringify(r.rendered)}`);
    }
}

if (REPORT) {
    for (const field of ['prompt', 'hint', 'explanation']) {
        const rows = [...stats.unmatched[field].entries()].sort((a, b) => b[1] - a[1]);
        const missed = rows.reduce((n, [, c]) => n + c, 0);
        console.log(`\nunmatched ${field}: ${missed} strings, ${rows.length} shapes`);
        for (const [skeleton, n] of rows.slice(0, 25)) {
            console.log(`   ${String(n).padStart(5)}  ${skeleton}`);
        }
        if (rows.length > 25) console.log(`   ... ${rows.length - 25} more shapes`);
    }
}

console.log(WRITE ? '\nwrote both pool mirrors' : '\ndry run — pass --write to apply');
