#!/usr/bin/env node
/**
 * Concept-ladder guard — the six ways a maths lesson can quietly become wrong.
 *
 * The ladder (godot/data/curriculum/concept_ladder.json) is the layer that turns a
 * curriculum step from a difficulty number into a teachable idea, and the
 * tutorials (godot/data/curriculum/tutorials.json) are the lessons it opens
 * with. Neither has a runtime that can tell you it is wrong: a tutorial that
 * teaches 7 + 3 = 11 renders perfectly, and a child believes it.
 *
 * So this checks, in order of how badly it would hurt:
 *
 *  1. THE MATHS. Every number a lesson asserts is recomputed from the picture
 *     it is drawn on. A ten-frame with seven and three in it must not claim
 *     eleven, and a guided question's correct answer must be the answer.
 *  2. STRUCTURE. Concept ranges are contiguous per domain from step 0, never
 *     overlap, and between them claim every step any problem is authored on.
 *  3. COVERAGE, against a declared baseline. A rung with no problems on it must
 *     be listed in knownGaps with a reason; a listed gap that has since been
 *     filled must be deleted. Same for thin rungs. A new hole cannot appear
 *     quietly and a closed one cannot linger as a lie.
 *  4. WIRING. Every concept's tutorial exists, every tutorial belongs to a
 *     concept, and every card names a visual tutorial_visual.gd can draw.
 *  5. WORDS. Every card and title has a string in every locale, and no
 *     tutorial.* string is left over from a card that no longer exists.
 *  6. FIT. Every string is measured against the box tutorial_tuning.json puts
 *     it in, so a layout change re-checks the copy that has to live in it.
 *
 * Also writes reports/math-concepts/coverage.json: the ladder, rung by rung,
 * with what is authored on each. That report is the answer to "what maths is
 * missing", and it is generated rather than remembered. The prose version lives
 * in docs/MATH_CONCEPT_LADDER.md, and check 7 holds that doc to the data:
 * every concept must appear in it, with its real step range.
 *
 * Run: node tools/validate_math_concepts.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'godot', 'data');
const LOCALES = ['en', 'is'];
const REPORT_DIR = join(ROOT, 'reports', 'math-concepts');

/** Same monospace advance the i18n guard measures with; see tools/validate_i18n.mjs. */
const ADVANCE_RATIO = 0.63;

const failures = [];
const fail = (msg) => failures.push(msg);
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const ladder = read(join(DATA, 'curriculum', 'concept_ladder.json'));
const tutorials = read(join(DATA, 'curriculum', 'tutorials.json'));
const tuning = read(join(DATA, 'tuning', 'tutorial_tuning.json'));
const strings = Object.fromEntries(
    LOCALES.map(l => [l, read(join(DATA, 'i18n', `strings_${l}.json`))]),
);

const problems = [];
for (const file of readdirSync(join(DATA, 'math')).filter(f => f.startsWith('problems_'))) {
    for (const p of read(join(DATA, 'math', file)).problems ?? []) problems.push(p);
}

// ── 1. the maths ───────────────────────────────────────────────────────────

/**
 * What a picture actually shows, recomputed from its own parameters.
 *
 * This is the whole point of the file. Each visual has exactly one number it
 * asserts -- the total in the frame, where the hops land, the next term in the
 * pattern -- and every card that states that number, as a `result`, a `reveal`
 * or a guided question's `correct`, is checked against this rather than against
 * itself. Returns null for a picture that asserts nothing.
 */
function truthOf(visual, params) {
    const n = (key, fallback = 0) => Number(params[key] ?? fallback);
    switch (visual) {
        case 'count_all':
            return n('a') + n('b');
        case 'ten_frame':
            return n('filled') + n('second');
        case 'take_away':
            return n('total') - n('gone');
        case 'number_line':
            if (params.start === undefined) return null;
            return n('start') + n('hops');
        case 'balance':
            return Math.max(n('a'), n('b'));
        case 'groups':
            return n('groups') * n('each');
        case 'tens_and_ones':
            return n('tens') * 10 + n('ones') + n('addTens') * 10 + n('addOnes') - n('takeOnes');
        case 'numbers': {
            const values = params.values ?? [];
            if (values.length < 2) return null;
            const gaps = new Set(values.slice(1).map((v, i) => v - values[i]));
            // A sequence with an uneven gap has no next term to assert. Better to
            // check nothing than to invent a rule the child cannot see.
            if (gaps.size !== 1) return null;
            return values[values.length - 1] + [...gaps][0];
        }
        case 'pattern_strip': {
            const core = params.core ?? [];
            if (core.length === 0) return null;
            return core[Number(params.length ?? core.length) % core.length];
        }
        case 'equation': {
            const [a, b] = [n('a'), n('b')];
            switch (params.op) {
                case '+': return a + b;
                case '-': return a - b;
                case '×': return a * b;
                case '÷': return b === 0 ? null : a / b;
                default: return null;
            }
        }
        default:
            return null;
    }
}

// ── 2. structure ───────────────────────────────────────────────────────────

const byDomain = new Map();
for (const concept of ladder.concepts) {
    if (!Array.isArray(concept.steps) || concept.steps.length !== 2) {
        fail(`[${concept.id}] steps must be a [low, high] pair`);
        continue;
    }
    const [lo, hi] = concept.steps;
    if (hi < lo) fail(`[${concept.id}] steps run backwards: [${lo}, ${hi}]`);
    if (!byDomain.has(concept.domain)) byDomain.set(concept.domain, []);
    byDomain.get(concept.domain).push(concept);
}

for (const [domain, concepts] of byDomain) {
    let expected = 0;
    for (const concept of concepts) {
        const [lo, hi] = concept.steps;
        if (lo !== expected) {
            fail(
                `[${concept.id}] starts at step ${lo}, but the previous concept in ${domain} `
                + `ends at ${expected - 1}. Concept ranges must be contiguous from step 0 -- a step `
                + `no concept claims is a step nothing can teach.`,
            );
        }
        expected = hi + 1;
    }
    const highest = Math.max(...problems.filter(p => p.domain === domain).map(p => p.curriculumStep ?? 0), -1);
    if (highest >= expected) {
        fail(
            `${domain} has problems authored up to step ${highest}, but its ladder stops at `
            + `${expected - 1}. Extend the last concept or add another.`,
        );
    }
}

const orphans = problems.filter(p => {
    const concepts = byDomain.get(p.domain) ?? [];
    return !concepts.some(c => p.curriculumStep >= c.steps[0] && p.curriculumStep <= c.steps[1]);
});
for (const p of orphans.slice(0, 10)) {
    fail(`[${p.id}] is ${p.domain} step ${p.curriculumStep}, which no concept covers.`);
}
if (orphans.length > 10) fail(`...and ${orphans.length - 10} more problems no concept covers.`);

// ── 3. coverage against the declared baseline ──────────────────────────────

const MIN_PER_STEP = Number(ladder.gapPolicy?.minPerStep ?? 6);
const countAt = (domain, step) =>
    problems.filter(p => p.domain === domain && p.curriculumStep === step).length;

const actualGaps = new Map();
const actualThin = new Map();
for (const concept of ladder.concepts) {
    const [lo, hi] = concept.steps;
    for (let step = lo; step <= hi; step++) {
        const n = countAt(concept.domain, step);
        const bucket = n === 0 ? actualGaps : (n < MIN_PER_STEP ? actualThin : null);
        if (!bucket) continue;
        if (!bucket.has(concept.domain)) bucket.set(concept.domain, new Set());
        bucket.get(concept.domain).add(step);
    }
}

function checkDeclared(label, declaredList, actual, advice) {
    const declared = new Map();
    for (const entry of declaredList ?? []) {
        if (!entry.why || String(entry.why).trim() === '') {
            fail(`${label} entry for ${entry.domain} has no "why". A gap without a reason is just a bug nobody wrote down.`);
        }
        if (!declared.has(entry.domain)) declared.set(entry.domain, new Set());
        for (const step of entry.steps ?? []) declared.get(entry.domain).add(step);
    }
    for (const [domain, steps] of actual) {
        for (const step of steps) {
            if (!declared.get(domain)?.has(step)) {
                fail(`${domain} step ${step} is ${label} and is not declared. ${advice}`);
            }
        }
    }
    for (const [domain, steps] of declared) {
        for (const step of steps) {
            if (!actual.get(domain)?.has(step)) {
                fail(
                    `${domain} step ${step} is declared ${label} but no longer is `
                    + `(${countAt(domain, step)} problems authored). Delete it from concept_ladder.json -- `
                    + `a closed gap must not stay on the list.`,
                );
            }
        }
    }
}

checkDeclared('knownGaps', ladder.knownGaps, actualGaps,
    'Author problems for it, or add it to knownGaps in concept_ladder.json with a reason.');
checkDeclared('knownThin', ladder.knownThin, actualThin,
    `Author it up to ${MIN_PER_STEP} problems, or add it to knownThin in concept_ladder.json with a reason.`);

// ── 4. wiring ──────────────────────────────────────────────────────────────

const tutorialById = new Map(tutorials.tutorials.map(t => [t.id, t]));
for (const concept of ladder.concepts) {
    if (!concept.tutorial) continue;
    if (!tutorialById.has(concept.tutorial)) {
        fail(`[${concept.id}] names tutorial "${concept.tutorial}", which is not in tutorials.json`);
    }
}
const claimed = new Set(ladder.concepts.map(c => c.tutorial).filter(Boolean));
for (const t of tutorials.tutorials) {
    if (!claimed.has(t.id)) fail(`tutorial [${t.id}] belongs to no concept. Wire it up or delete it.`);
}

/** The visuals tutorial_visual.gd can actually draw, read out of its own RENDERERS map. */
const rendererSource = readFileSync(join(ROOT, 'godot', 'scripts', 'ui', 'components', 'tutorial_visual.gd'), 'utf8');
const rendererBlock = rendererSource.slice(
    rendererSource.indexOf('const RENDERERS := {'),
    rendererSource.indexOf('}', rendererSource.indexOf('const RENDERERS := {')),
);
const drawable = new Set([...rendererBlock.matchAll(/"([a-z_]+)":\s*"_draw_/g)].map(m => m[1]));
if (drawable.size === 0) fail('could not read RENDERERS out of tutorial_visual.gd -- the visual check is not running');

// ── 5 + 6. words, and whether they fit ─────────────────────────────────────

const layout = tuning.layout ?? {};
/**
 * Each string's box, derived from the layout file rather than restated here, so
 * narrowing the board in tuning re-measures the copy that has to live in it.
 * Both labels wrap, so this is a "reads as three tidy lines" budget rather than
 * a clipping cliff -- generous, and it still catches a title nobody can read.
 */
const titleBox = {
    size: Number(layout.title_font_size ?? 30),
    // Board, less its padding, less the skip button and the gap before it.
    max: (Number(layout.board_min_w ?? 620) - 2 * Number(layout.padding ?? 26)
        - Number(layout.skip_button_w ?? 150) - Number(layout.separation ?? 16)) * 2,
    where: 'tutorial title, beside Skip, wrapping to at most two lines',
};
const bodyBox = {
    size: Number(layout.body_font_size ?? 22),
    max: Number(layout.body_wrap_width ?? 540) * 3,
    where: 'tutorial body, wrapping to at most three lines',
};

const expectedKeys = new Set(['tutorial.skip', 'tutorial.next', 'tutorial.back', 'tutorial.start', 'tutorial.nice']);
let measured = 0;

const measure = (key, box) => {
    for (const locale of LOCALES) {
        const value = strings[locale][key];
        if (value === undefined) {
            fail(`[${key}] is missing from strings_${locale}.json`);
            continue;
        }
        if (String(value).trim() === '') fail(`[${key}] is empty in strings_${locale}.json`);
        const width = String(value).length * box.size * ADVANCE_RATIO;
        measured++;
        if (width > box.max) {
            fail(
                `[${key}] in ${locale.toUpperCase()} needs ~${Math.round(width)}px in a `
                + `${box.max}px box (${box.where}). Shorten it, or widen the box in tutorial_tuning.json.`,
            );
        }
    }
};

for (const key of expectedKeys) measure(key, titleBox);

for (const tutorial of tutorials.tutorials) {
    const titleKey = `tutorial.${tutorial.id}.title`;
    expectedKeys.add(titleKey);
    measure(titleKey, titleBox);

    if ((tutorial.cards ?? []).length === 0) fail(`tutorial [${tutorial.id}] has no cards`);

    for (const [index, card] of (tutorial.cards ?? []).entries()) {
        const where = `${tutorial.id} card ${index + 1} (${card.body})`;

        if (!drawable.has(card.visual)) {
            fail(`${where} draws "${card.visual}", which tutorial_visual.gd has no renderer for.`);
        }

        const bodyKey = `tutorial.${tutorial.id}.${card.body}`;
        expectedKeys.add(bodyKey);
        measure(bodyKey, bodyBox);

        const truth = truthOf(card.visual, card.params ?? {});

        // A card that states an answer must state the true one.
        if (card.params?.result !== undefined && truth !== null && Number(card.params.result) !== truth) {
            fail(`${where} shows the answer ${card.params.result}, but its own numbers make ${truth}.`);
        }
        if (card.params?.reveal !== undefined && truth !== null && Number(card.params.reveal) !== truth) {
            fail(`${where} reveals ${card.params.reveal}, but its own numbers make ${truth}.`);
        }

        if (!card.choice) continue;
        const { options = [], correct } = card.choice;
        if (options.length < 2) fail(`${where} asks a question with fewer than two options.`);
        if (new Set(options.map(String)).size !== options.length) {
            fail(`${where} offers the same option twice.`);
        }
        if (!options.map(String).includes(String(correct))) {
            fail(`${where} marks ${correct} correct, but it is not one of the options.`);
        }
        if (truth === null) {
            fail(`${where} asks a question on a "${card.visual}" that asserts no answer, so nothing can check it.`);
        } else if (Number(correct) !== truth) {
            fail(`${where} marks ${correct} correct, but its own picture makes ${truth}.`);
        }
    }
}

// The last guided card is the child's turn: a lesson that never hands over is a
// lecture, and this pack's whole claim is that it does not give them.
for (const tutorial of tutorials.tutorials) {
    const cards = tutorial.cards ?? [];
    if (cards.length > 0 && !cards[cards.length - 1].choice) {
        fail(`tutorial [${tutorial.id}] ends without a question. The last card has to be the child's turn.`);
    }
    if (cards.slice(0, -1).some(c => c.choice)) {
        fail(`tutorial [${tutorial.id}] asks a question before the last card. Guided practice comes after the worked example, not during it.`);
    }
}

for (const locale of LOCALES) {
    for (const key of Object.keys(strings[locale])) {
        if (key.startsWith('tutorial.') && !expectedKeys.has(key)) {
            fail(`[${key}] is in strings_${locale}.json but no tutorial card uses it. Delete it from every locale.`);
        }
    }
}

// ── the report ─────────────────────────────────────────────────────────────

const rows = ladder.concepts.map(concept => {
    const [lo, hi] = concept.steps;
    const steps = [];
    for (let step = lo; step <= hi; step++) steps.push({ step, problems: countAt(concept.domain, step) });
    const authored = new Set(
        problems
            .filter(p => p.domain === concept.domain && p.curriculumStep >= lo && p.curriculumStep <= hi)
            .flatMap(p => p.skills ?? []),
    );
    return {
        id: concept.id,
        domain: concept.domain,
        steps: concept.steps,
        tutorial: concept.tutorial ?? null,
        total: steps.reduce((a, s) => a + s.problems, 0),
        empty: steps.filter(s => s.problems === 0).map(s => s.step),
        thin: steps.filter(s => s.problems > 0 && s.problems < MIN_PER_STEP).map(s => s.step),
        perStep: steps,
        skillsAuthored: [...authored].sort(),
        skillsDeclared: [...(concept.skills ?? [])].sort(),
    };
});

// Drift between what a concept SAYS it covers and what is authored in its range
// is a warning, not a failure: the declared list is a design statement and the
// pools move underneath it. It still belongs in the report.
const skillDrift = rows.flatMap(row => [
    ...row.skillsAuthored.filter(s => !row.skillsDeclared.includes(s)).map(s => ({ concept: row.id, skill: s, state: 'authored but not declared' })),
    ...row.skillsDeclared.filter(s => !row.skillsAuthored.includes(s)).map(s => ({ concept: row.id, skill: s, state: 'declared but not authored' })),
]);

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, 'coverage.json'), JSON.stringify({
    generatedBy: 'tools/validate_math_concepts.mjs',
    minPerStep: MIN_PER_STEP,
    totalProblems: problems.length,
    concepts: rows,
    skillDrift,
}, null, 2) + '\n');

// ── 7. the doc that explains all this must still be describing it ─────────
//
// The numbers live in coverage.json, which is generated. The ladder's SHAPE --
// which concepts exist and which steps each one owns -- is a design decision,
// and it belongs in prose a human wrote. This check is what stops that prose
// from quietly becoming fiction.
const LADDER_DOC = 'docs/MATH_CONCEPT_LADDER.md';
{
    // Whitespace-normalised: the doc wraps its prose at 80 columns, so a
    // reason that matches perfectly still has newlines through the middle of it.
    // Dashes normalised too: prose typesets an aside with an em dash and JSON
    // data does not, and that difference is not a fact about the ladder.
    const flat = (text) => String(text).replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ');
    const doc = flat(readFileSync(join(ROOT, LADDER_DOC), 'utf8'));
    for (const concept of ladder.concepts) {
        if (!doc.includes(concept.id)) {
            fail(`${LADDER_DOC} does not mention concept [${concept.id}].`);
            continue;
        }
        const range = `${concept.steps[0]}-${concept.steps[1]}`;
        if (!doc.includes(range)) {
            fail(`${LADDER_DOC} does not give [${concept.id}] its step range ${range}.`);
        }
    }
    // Each declared gap's first sentence has to appear in the doc, so the
    // explanation a contributor reads is the one the data commits to.
    for (const gap of ladder.knownGaps ?? []) {
        const firstSentence = flat(gap.why).split(/(?<=\.)\s/)[0];
        if (!doc.includes(firstSentence)) {
            fail(
                `${LADDER_DOC} does not carry the reason declared for the ${gap.domain} gap `
                + `(looking for "${firstSentence}").`,
            );
        }
    }
}

// ── result ─────────────────────────────────────────────────────────────────

if (failures.length > 0) {
    console.error('concept ladder guard: FAILED');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
const gapCount = [...actualGaps.values()].reduce((a, s) => a + s.size, 0);
const thinCount = [...actualThin.values()].reduce((a, s) => a + s.size, 0);
console.log(
    `concept ladder guard: clean (${ladder.concepts.length} concepts, ${tutorials.tutorials.length} tutorials, `
    + `${tutorials.tutorials.reduce((a, t) => a + t.cards.length, 0)} cards verified against their own arithmetic, `
    + `${measured} strings measured)`,
);
console.log(`  ${gapCount} empty rungs and ${thinCount} thin rungs, all declared -- see reports/math-concepts/coverage.json`);
if (skillDrift.length > 0) console.log(`  ${skillDrift.length} skill-tag drifts reported (not fatal)`);
