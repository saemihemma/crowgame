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

/**
 * Adjectives that may sit between a numeral and the noun it counts.
 *
 * "There are 5 red berries" puts one word between the two, and Rule 1 read only
 * the next token — so `berries_two_colours`, the very template that needs the
 * check, defeated it in both locales. Kept to a list rather than "any word",
 * because any word would step over the preposition in "Deildu 21 í hópa af 3"
 * and reopen the blind spot below.
 */
const COUNTING_ADJECTIVES = {
    en: new Set(['red', 'blue', 'green', 'yellow']),
    is: new Set(['rauð', 'blá', 'græn', 'gul', 'rautt', 'blátt', 'grænt', 'gult']),
};

/**
 * In Icelandic the adjective inflects too, so it is a marker in its own right.
 *
 * "21 blá ber" wants "21 blátt ber", and the noun cannot show it: `ber` is
 * neuter and identical in both numbers, which is exactly why it was chosen for
 * these stories. The colour is the only word in the phrase that carries the
 * number, so the colour is what has to be read. English adjectives do not
 * inflect and have no entry here.
 */
const PLURAL_ADJECTIVES = {
    en: new Set(),
    is: new Set(['rauð', 'blá', 'græn', 'gul']),
};

/** Rule 1: plural nouns, checked immediately after the numeral. */
const PLURAL_NOUNS = {
    en: new Set([
        'birds', 'berries', 'eggs', 'nests', 'dots', 'stars', 'groups',
        'flowers', 'rings', 'squares', 'diamonds', 'triangles', 'hexagons',
        'hearts', 'moons', 'rows',
        // "leaves" is NOT here. It is a counting noun in this catalog AND the
        // third-person verb in "3 take away 1 leaves 2", which is correct
        // English. The noun is never written after a numeral -- a counting
        // prompt draws the objects and asks for the number, so the count is the
        // answer and never appears in the sentence.
    ]),
    is: new Set([
        'hópar', 'hópum', 'fuglar', 'fuglarnir', 'punktar', 'stjörnur',
        'blóm', 'hjörtu', 'hringir', 'ferningar', 'raðir',
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

/**
 * Rule 4, the converse: a SINGULAR noun after a plural numeral.
 *
 * Everything above asks whether a singular numeral got a plural word. Nothing
 * asked the other way round, and the other way round is exactly what a
 * PLURAL_PARAM keyed to the wrong parameter produces: "5 bird sits on a branch"
 * renders when the `.one` form is chosen off the wrong number. The round-1 fix
 * rests on that keying being right, so it needs a check of its own.
 */
const SINGULAR_NOUNS = {
    en: new Set([
        'bird', 'berry', 'egg', 'nest', 'dot', 'star', 'group', 'flower',
        'ring', 'square', 'diamond', 'triangle', 'hexagon', 'heart', 'moon', 'row',
    ]),
    is: new Set(['hópur', 'fugl', 'punktur', 'stjarna', 'röð', 'hringur', 'ferningur']),
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

    const adjectives = COUNTING_ADJECTIVES[locale] ?? new Set();
    const singulars = SINGULAR_NOUNS[locale] ?? new Set();

    for (let i = 0; i < tokens.length; i++) {
        const numeral = tokens[i].word;
        if (!/^\d+$/.test(numeral)) continue;
        const before = tokens[i - 1]?.word;
        const after = tokens[i + 1]?.word;
        // The noun this numeral counts: the next token, or the one past a single
        // colour adjective.
        const counted = after !== undefined && adjectives.has(after) ? tokens[i + 2]?.word : after;

        if (isSingular(Number(numeral)) !== 'one') {
            if (counted !== undefined && singulars.has(counted)) {
                found.push(`singular noun after a plural numeral: "${numeral} ${counted}"`);
            }
            continue;
        }

        if (after !== undefined && (PLURAL_ADJECTIVES[locale] ?? new Set()).has(after)) {
            found.push(`plural adjective after a singular numeral: "${numeral} ${after}"`);
            continue;
        }
        if (counted !== undefined && nouns.has(counted)) {
            found.push(`plural noun after a singular numeral: "${numeral} ${counted}"`);
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
    // The adjective gap. `berries_two_colours` puts a colour between the numeral
    // and its noun in BOTH locales, and the first draft of this rule read only
    // the next token -- so the one template that most needed the check was the
    // one template that defeated it.
    { text: 'There are 5 red berries and 1 blue berries. How many berries in all?', locale: 'en', fires: true },
    { text: 'Það eru 5 rauð ber og 21 blá ber. Hvað eru berin mörg alls?', locale: 'is', fires: true },
    { text: 'Það eru 5 rauð ber og 8 blá ber. Hvað eru berin mörg alls?', locale: 'is', fires: false },
    { text: 'There are 5 rows of 4 eggs. How many eggs in all?', locale: 'en', fires: false },
    // The converse: a `.one` form chosen off the wrong parameter.
    { text: '5 bird sits on a branch. 3 more land. How many birds?', locale: 'en', fires: true },
    { text: 'Það eru 5 hópur.', locale: 'is', fires: true },
    { text: '3 take away 1 leaves 2.', locale: 'en', fires: false },
    { text: '3 hópar af 1 gera 3.', locale: 'is', fires: false },
    { text: 'Deildu 21 í hópa af 3.', locale: 'is', fires: false },
    { text: 'Tölurnar eru 1, 2, 3, 4, 5!', locale: 'is', fires: false },
];

/**
 * Every marker must be load-bearing.
 *
 * The hand-written examples above pin the RULES. They do not pin the LISTS: a
 * reviewer deleted 23 of the 28 markers and every example still passed, which
 * means most of the vocabulary could rot out without a single test noticing.
 * These are generated, one per marker, so a marker cannot be removed while the
 * self-test stands — which is what "the rule cannot be trimmed until it passes"
 * has to mean if it is to mean anything.
 */
function markerPins() {
    const pins = [];
    for (const [locale, set] of Object.entries(PLURAL_NOUNS)) {
        for (const noun of set) pins.push({ text: `1 ${noun}`, locale, fires: true });
    }
    for (const [locale, set] of Object.entries(SINGULAR_NOUNS)) {
        for (const noun of set) pins.push({ text: `5 ${noun}`, locale, fires: true });
    }
    for (const [locale, set] of Object.entries(PLURAL_COPULAS)) {
        for (const verb of set) pins.push({ text: `there ${verb} 1 here`, locale, fires: true });
    }
    for (const [locale, set] of Object.entries(BARE_PLURAL_VERBS)) {
        for (const verb of set) pins.push({ text: `1 ${verb} away`, locale, fires: true });
    }
    for (const [locale, set] of Object.entries(PLURAL_ADJECTIVES)) {
        for (const adjective of set) pins.push({ text: `1 ${adjective} ber`, locale, fires: true });
    }
    return pins;
}

const ALL_SELF_TESTS = [...SELF_TEST, ...markerPins()];
const selfTestFailures = ALL_SELF_TESTS.filter(
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
    + `(self-test: ${SELF_TEST.length} sentences + ${ALL_SELF_TESTS.length - SELF_TEST.length} marker pins)`,
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
