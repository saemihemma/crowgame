#!/usr/bin/env node
/**
 * Render every math problem in every locale and read the sentences back.
 *
 * WHY THIS EXISTS. Nothing else in the toolchain does. `validate_i18n.mjs`
 * proves the two bundles have the same keys, the same placeholders and fit the
 * pixel budget. `derive_math_phrasing.mjs` proves a generated English sentence
 * round-trips to a catalog key. `math:review` grades batches for arithmetic,
 * metadata and option integrity. Every one of those passed on a subtraction
 * problem that shipped, to a child, reading:
 *
 *     EN  You had 15. Now there are 1. How many went?
 *     IS  Þú áttir 15. Nú eru 1. Hvað fór margt?
 *
 * Wrong in both languages. The key had no `.one` sibling, so nothing that
 * inspects KEYS could see it: the defect exists only in the rendered string.
 *
 * WHAT IT CHECKS. A numeral this locale counts as singular must not be attached
 * to a plural word. "Attached" is three narrow rules rather than one loose
 * window, because a loose window is wrong in both directions on a sentence with
 * two numerals in it. "3 hópar af 1 gera 3" is CORRECT Icelandic — `gera` agrees
 * with `3 hópar`, not with the 1 beside it — and a window that flags it teaches
 * the next author to switch the check off.
 *
 *   1. A plural NOUN immediately after the numeral. "1 birds", "21 hópar".
 *      Adjacency is decisive here: a noun directly after a numeral always
 *      agrees with it.
 *   2. A plural COPULA immediately before or after it. "there are 1",
 *      "Nú eru 1", "and 1 were left". Only the copulas, never other verbs,
 *      because any other verb may take its subject from further back.
 *   3. A bare plural verb within two tokens after it, for the one shape the
 *      story prompts use: "1 fly away", "1 more land".
 *
 * Icelandic is why the rule is per-locale rather than `n === 1`:
 * `PLURAL_RULES.is` makes 21, 31 and 101 singular too, so "21 hópar" is the
 * same defect as "1 hópar" and an English-shaped check misses every one.
 *
 * The marker lists are closed and small on purpose. The catalog is ~240
 * templates, not a language. A marker that fires on a correct sentence is a bug
 * in the list; a sentence needing a word the list lacks adds it.
 *
 * Usage: node tools/validate_math_agreement.mjs
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PLURAL_RULES, format, pluralKey } from './math_phrasing_catalog.mjs';

const MATH_DIR = 'godot/data/math';
const BUNDLES = {
    en: 'godot/data/i18n/strings_en.json',
    is: 'godot/data/i18n/strings_is.json',
};

/** Rule 1: plural nouns, checked immediately after the numeral. */
const PLURAL_NOUNS = {
    en: new Set([
        'birds', 'berries', 'eggs', 'nests', 'dots', 'stars', 'groups',
        'flowers', 'rings', 'squares', 'diamonds', 'triangles', 'hexagons',
        'hearts', 'moons',
        // "leaves" is NOT here. It is a counting noun in this catalog AND the
        // third-person verb in "3 take away 1 leaves 2", which is correct
        // English. The noun is never written after a numeral -- a counting
        // prompt draws the objects and asks for the number, so the count is the
        // answer and never appears in the sentence.
    ]),
    is: new Set([
        'hópar', 'hópum', 'fuglar', 'fuglarnir', 'punktar', 'stjörnur',
        'blóm', 'hjörtu', 'hringir', 'ferningar',
        // "hópa" is NOT here, and this is the rule's one honest blind spot.
        // Icelandic writes the accusative plural after a preposition whether or
        // not the numeral beside it is what counts the groups: "Deilt í 21 hópa"
        // is wrong (21 counts the groups) and "Deildu 21 í hópa af 3" is right
        // (21 is the dividend). The two are indistinguishable by adjacency, and
        // a marker that fires on the correct one would be worse than the miss.
        // What keeps the wrong one out of the pools is the generator: the
        // divisor in a relational division candidate is bounded well under 21.
    ]),
};

/** Rule 2: copulas, checked immediately before OR after the numeral. */
const PLURAL_COPULAS = {
    en: new Set(['are', 'were']),
    is: new Set(['eru', 'voru']),
};

/** Rule 3: the bare plural verbs the additive stories put after a numeral. */
const BARE_PLURAL_VERBS = {
    en: new Set(['fly', 'land', 'sit']),
    is: new Set(),
};

const BARE_VERB_WINDOW = 2;

/**
 * Words, plus the one piece of punctuation the rule needs.
 *
 * A numeral followed by a comma is an ITEM IN A LIST, not the subject of the
 * verb in front of it: "Tölurnar eru 1, 2, 3, 4, 5!" is correct Icelandic and
 * "Nú eru 1." is not, and the comma is the only thing that separates them.
 */
function tokenize(text) {
    return String(text)
        .split(/\s+/)
        .map(raw => ({
            word: raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase(),
            listItem: /,$/.test(raw),
        }))
        .filter(token => token.word !== '');
}

/** Every disagreement in one rendered sentence, as human-readable reasons. */
export function disagreements(text, locale) {
    const isSingular = PLURAL_RULES[locale] ?? PLURAL_RULES.en;
    const nouns = PLURAL_NOUNS[locale] ?? new Set();
    const copulas = PLURAL_COPULAS[locale] ?? new Set();
    const bareVerbs = BARE_PLURAL_VERBS[locale] ?? new Set();
    const tokens = tokenize(text);
    const found = [];

    for (let i = 0; i < tokens.length; i++) {
        const numeral = tokens[i].word;
        if (!/^\d+$/.test(numeral)) continue;
        if (isSingular(Number(numeral)) !== 'one') continue;
        const before = tokens[i - 1]?.word;
        const after = tokens[i + 1]?.word;

        if (after !== undefined && nouns.has(after)) {
            found.push(`plural noun after a singular numeral: "${numeral} ${after}"`);
            continue;
        }
        // A list item takes its number from the list, not from the verb.
        if (!tokens[i].listItem) {
            if (before !== undefined && copulas.has(before)) {
                found.push(`plural verb before a singular numeral: "${before} ${numeral}"`);
                continue;
            }
            if (after !== undefined && copulas.has(after)) {
                found.push(`plural verb after a singular numeral: "${numeral} ${after}"`);
                continue;
            }
        }
        for (let j = i + 1; j <= Math.min(i + BARE_VERB_WINDOW, tokens.length - 1); j++) {
            if (bareVerbs.has(tokens[j].word)) {
                found.push(`plural verb after a singular numeral: "${numeral} ... ${tokens[j].word}"`);
                break;
            }
        }
    }
    return found;
}

/**
 * The rule has to still be able to see the bug it was written for.
 *
 * A check whose marker lists have been trimmed until it passes is worse than no
 * check, so the three defects that motivated it are asserted here, in the file,
 * against the same function the pools go through. The last three are sentences
 * this catalog renders CORRECTLY, and were false positives of the first draft's
 * two-token window.
 */
const SELF_TEST = [
    { text: 'You had 15. Now there are 1. How many went?', locale: 'en', fires: true },
    { text: 'Þú áttir 15. Nú eru 1. Hvað fór margt?', locale: 'is', fires: true },
    { text: 'Something lost 3 and 1 were left. How many were there to start?', locale: 'en', fires: true },
    { text: '70 birds sit on a branch. 1 fly away. How many are left?', locale: 'en', fires: true },
    { text: 'Það eru 21 punktar!', locale: 'is', fires: true },
    { text: '3 take away 1 leaves 2.', locale: 'en', fires: false },
    { text: '3 hópar af 1 gera 3.', locale: 'is', fires: false },
    { text: 'Deildu 21 í hópa af 3.', locale: 'is', fires: false },
    { text: 'Tölurnar eru 1, 2, 3, 4, 5!', locale: 'is', fires: false },
    { text: 'The numbers are 1, 2, 3, 4, 5!', locale: 'en', fires: false },
];

const selfTestFailures = SELF_TEST.filter(
    ({ text, locale, fires }) => (disagreements(text, locale).length > 0) !== fires,
);
if (selfTestFailures.length > 0) {
    console.log('number agreement: SELF-TEST FAILED — the rule can no longer see its own examples');
    for (const { text, locale, fires } of selfTestFailures) {
        console.log(`  [${locale}] expected ${fires ? 'a hit' : 'no hit'}: ${text}`);
    }
    process.exit(1);
}

/**
 * The sentence a child in `locale` actually sees.
 *
 * A field with no phrasing entry is locale-neutral by construction — a bare
 * equation, "12 - ? = 8" — so its literal text is what both locales render.
 */
function renderField(problem, field, bundle, locale) {
    const entry = problem.phrasing?.[field];
    if (!entry?.key) {
        return field === 'prompt' ? (problem.prompt?.text ?? '') : (problem[field] ?? '');
    }
    const key = pluralKey(entry.key, entry.params ?? {}, locale);
    const template = bundle[key] ?? bundle[entry.key];
    if (template === undefined) return null;
    return format(template, entry.params ?? {}, bundle);
}

const bundles = Object.fromEntries(
    Object.entries(BUNDLES).map(([locale, path]) => [locale, JSON.parse(readFileSync(path, 'utf8'))]),
);

let checked = 0;
const failures = [];

for (const file of readdirSync(MATH_DIR).filter(f => f.endsWith('.json')).sort()) {
    const pool = JSON.parse(readFileSync(join(MATH_DIR, file), 'utf8'));
    for (const problem of pool.problems ?? []) {
        for (const field of ['prompt', 'hint', 'explanation']) {
            for (const locale of Object.keys(bundles)) {
                const text = renderField(problem, field, bundles[locale], locale);
                if (text === null) {
                    failures.push(`  ${problem.id} ${field}:${locale} has no ${locale} template for ${problem.phrasing?.[field]?.key}`);
                    continue;
                }
                if (text === '') continue;
                checked++;
                for (const reason of disagreements(text, locale)) {
                    failures.push(`  ${problem.id} ${field}:${locale} — ${reason}\n      ${text}`);
                }
            }
        }
    }
}

console.log(
    `number agreement: rendered ${checked} strings across ${Object.keys(bundles).length} locales `
    + `(self-test: ${SELF_TEST.length} examples)`,
);
if (failures.length > 0) {
    console.log(`  FAILED: ${failures.length} disagreement(s)`);
    for (const failure of failures.slice(0, 25)) console.log(failure);
    if (failures.length > 25) console.log(`  ... and ${failures.length - 25} more`);
    console.log('\nA numeral this locale counts as singular is attached to a plural word.');
    console.log('Either give the phrasing key a ".one" sibling and a PLURAL_PARAM entry in');
    console.log('tools/math_phrasing_catalog.mjs, or stop the generator producing that value.');
    process.exit(1);
}
console.log('  clean: every singular numeral is attached to singular words');
