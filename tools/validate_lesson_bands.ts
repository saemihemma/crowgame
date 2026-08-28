/**
 * Does each lesson card teach a fact from the rung its concept actually covers?
 *
 * A lesson is authored copy; the pools are generated. When a concept is re-cut,
 * split, or its step range moved, the lesson keeps teaching whatever it always
 * taught and nothing notices. `addition.make_ten` covers steps 6-9; if its cards
 * demonstrate 2 + 1, a child who unlocked the concept is shown a lesson for a
 * rung they left three promotions ago, and the practice that follows will not
 * resemble it.
 *
 * So: recompute the fact each card demonstrates, put it through the SAME
 * derivation the pools use, and require the result to sit inside the concept's
 * declared band. No generated report and no hash, because there is nothing to
 * keep fresh -- this reads the two JSON files and the live derivation every run.
 *
 * Cards that demonstrate no arithmetic fact (a bare ten-frame, a balance scale,
 * a pattern strip) are counted and reported, not silently skipped: "we checked
 * 96 of 152" is a fact a reader needs, and "all clear" over a third of the deck
 * would be a lie.
 *
 * Run: npx tsx tools/validate_lesson_bands.ts   (part of npm run validate)
 */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deriveCurriculumStep } from './math_curriculum';
import type { MathProblem } from '../math-kernel/utils/Types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

interface Concept {
    id: string;
    domain: string;
    steps: number[];
    tutorial: string | null;
    requires?: { skill?: string };
}
interface Card {
    body: string;
    visual: string;
    params?: Record<string, number | string>;
}
interface Tutorial { id: string; cards: Card[] }

const ladder = read(join(ROOT, 'godot', 'data', 'curriculum', 'concept_ladder.json'));
const tutorials: Tutorial[] = read(join(ROOT, 'godot', 'data', 'curriculum', 'tutorials.json')).tutorials;
const concepts: Concept[] = ladder.concepts;

type Fact = { op: '+' | '-' | '×' | '÷'; left: number; right: number };

/**
 * Only these four domains derive their step FROM the fact.
 *
 * counting's rung is the size of the count, number_sequence's is the length and
 * delta of the run, comparison's and pattern_matching's are their own shapes. A
 * number-line hop inside a sequence lesson is a legitimate way to DRAW "+2"; it
 * is not an addition problem, and banding it against a sequence rung compares
 * two different scales. The first version of this file did exactly that and
 * reported six sequence and counting lessons as broken when none of them were.
 */
const FACT_DERIVED = new Set(['addition', 'subtraction', 'multiplication', 'division']);

/**
 * Where in the four-card arc a card is allowed to sit.
 *
 * The worked example and the guided try ARE the rung: the worked-example effect
 * only holds if the example matches the problem the child is about to meet, and
 * a try card is a rehearsal of the practice that follows. Those must be in band.
 *
 * The `see` and `model` cards are the concrete and pictorial on-ramp, and
 * opening one rung below the floor is how a lesson connects to what the child
 * already owns before it asks for anything new. One rung, and never above the
 * ceiling -- a lesson may start gentler than its band, never harder.
 */
const ONRAMP_CARDS = new Set(['see', 'model']);
const ONRAMP_SLACK = 1;

/**
 * The fact a card demonstrates, read back out of its own parameters.
 *
 * Deliberately the same discipline as the concept guard's `truthOf`: derive from
 * the picture's inputs rather than trusting a label, so a card cannot claim a
 * rung it does not teach. A visual that demonstrates no fact returns null.
 */
function factOf(card: Card): Fact | null {
    const p = card.params ?? {};
    const n = (k: string): number | null => (typeof p[k] === 'number' ? (p[k] as number) : null);
    const has = (...keys: string[]) => keys.every(k => n(k) !== null);

    switch (card.visual) {
        case 'equation': {
            const op = String(p.op ?? '+') as Fact['op'];
            // A complete equation names both operands. A card with one operand
            // missing is the question form -- recover the absent side from the
            // result, because the fact being taught is the whole equation.
            if (has('a', 'b')) return { op, left: n('a')!, right: n('b')! };
            // Recover the absent side from the result, per operator. `a / b = r`
            // inverts to `a = b * r`, not to a subtraction -- getting that wrong
            // would band every division question card off its own rung.
            if (has('b', 'result')) {
                const [b, r] = [n('b')!, n('result')!];
                const a = op === '+' ? r - b : op === '-' ? r + b : op === '×' ? (b === 0 ? NaN : r / b) : b * r;
                return { op, left: a, right: b };
            }
            if (has('a', 'result')) {
                const [a, r] = [n('a')!, n('result')!];
                const b = op === '+' ? r - a : op === '-' ? a - r : op === '×' ? (a === 0 ? NaN : r / a) : (r === 0 ? NaN : a / r);
                return { op, left: a, right: b };
            }
            return null;
        }
        // A ten-frame with a second colour is "this many, then this many more".
        case 'ten_frame':
            return has('filled', 'second') ? { op: '+', left: n('filled')!, right: n('second')! } : null;
        case 'count_all':
            return has('a', 'b') ? { op: '+', left: n('a')!, right: n('b')! } : null;
        case 'take_away':
            return has('total', 'gone') ? { op: '-', left: n('total')!, right: n('gone')! } : null;
        // Part-whole shows the whole and one part; the fact is the subtraction
        // that finds the other.
        case 'part_whole':
            return has('total', 'known') ? { op: '-', left: n('total')!, right: n('known')! } : null;
        // `from`/`to` are only the axis. `start` plus signed `hops` is the move,
        // and the move is the fact.
        case 'number_line': {
            if (!has('start', 'hops')) return null;
            const hops = n('hops')!;
            return hops >= 0
                ? { op: '+', left: n('start')!, right: hops }
                : { op: '-', left: n('start')!, right: -hops };
        }
        case 'groups':
            return has('groups', 'each') ? { op: '×', left: n('groups')!, right: n('each')! } : null;
        case 'tens_and_ones': {
            if (!has('tens', 'ones')) return null;
            // `hundreds` is the third place, and it has to be read here or a
            // multi-digit card bands as the two-digit number underneath it --
            // 214 + 134 would check as 14 + 134 and land nine rungs low.
            const whole = (n('hundreds') ?? 0) * 100 + n('tens')! * 10 + n('ones')!;
            const added = (n('addHundreds') ?? 0) * 100 + (n('addTens') ?? 0) * 10 + (n('addOnes') ?? 0);
            if (added > 0) return { op: '+', left: whole, right: added };
            const taken = (n('takeHundreds') ?? 0) * 100 + (n('takeTens') ?? 0) * 10 + (n('takeOnes') ?? 0);
            if (taken > 0) return { op: '-', left: whole, right: taken };
            return null;
        }
        // balance (two quantities compared), numbers (a sequence) and
        // pattern_strip (a repeat) demonstrate no arithmetic fact.
        default:
            return null;
    }
}

const answerOf = (f: Fact): number => {
    switch (f.op) {
        case '+': return f.left + f.right;
        case '-': return f.left - f.right;
        case '×': return f.left * f.right;
        case '÷': return f.right === 0 ? NaN : f.left / f.right;
    }
};

const stepOf = (domain: string, f: Fact): number => deriveCurriculumStep({
    id: 'lesson-card', domain, skills: [], difficulty: 1, ageBand: [5, 7],
    prompt: { text: `${f.left} ${f.op} ${f.right} = ?`, assets: null },
    answer: { mode: 'mcq', correct: answerOf(f), options: [] },
    hint: '', explanation: '', misconceptionTags: [], generator: null, curriculumStep: 0,
} as unknown as MathProblem);

const failures: string[] = [];
const exempt = new Map<string, string>(
    (ladder.lessonBandExemptions ?? []).map((e: { card: string; why: string }) => [e.card, e.why]),
);
const claimedExemptions = new Set<string>();

let checked = 0;
let unbandable = 0;
let notFactDerived = 0;

for (const concept of concepts) {
    if (!concept.tutorial) continue;
    if (!FACT_DERIVED.has(concept.domain)) {
        notFactDerived += tutorials.find(t => t.id === concept.tutorial)?.cards.length ?? 0;
        continue;
    }
    const tutorial = tutorials.find(t => t.id === concept.tutorial);
    if (!tutorial) {
        failures.push(`[${concept.id}] names tutorial "${concept.tutorial}", which does not exist.`);
        continue;
    }
    const [lo, hi] = [concept.steps[0], concept.steps[concept.steps.length - 1]];

    tutorial.cards.forEach((card, i) => {
        const fact = factOf(card);
        if (fact === null) { unbandable += 1; return; }
        // A card whose arithmetic is broken is the concept guard's job, not
        // this one's; skip it rather than report the same defect twice.
        const answer = answerOf(fact);
        if (!Number.isFinite(answer) || answer < 0) return;
        if (!Number.isFinite(fact.left) || !Number.isFinite(fact.right)) return;

        checked += 1;
        const step = stepOf(concept.domain, fact);
        const floor = ONRAMP_CARDS.has(card.body) ? lo - ONRAMP_SLACK : lo;
        if (step >= floor && step <= hi) return;

        const key = `${tutorial.id}#${i}`;
        if (exempt.has(key)) { claimedExemptions.add(key); return; }
        failures.push(
            `[${concept.id}] card ${i + 1} (${card.body}/${card.visual}) demonstrates `
            + `${fact.left} ${fact.op} ${fact.right}, which derives onto step ${step}, `
            + `outside the concept's band ${lo}-${hi}`
            + (ONRAMP_CARDS.has(card.body) ? ` (${lo - ONRAMP_SLACK}-${hi} for an on-ramp card)` : '')
            + `. Either the card teaches the wrong rung, `
            + `or the concept was re-cut and its lesson was left behind. `
            + `Fix the numbers, or declare "${key}" in lessonBandExemptions with a reason.`,
        );
    });
}

for (const [key, why] of exempt) {
    if (!claimedExemptions.has(key)) {
        failures.push(
            `lessonBandExemptions declares "${key}" (${why}) but that card is inside its band now. `
            + 'Delete it -- a closed exemption must not stay on the list.',
        );
    }
}

if (failures.length > 0) {
    console.error('lesson band guard: FAILED');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
// Every card is accounted for out loud. "All clear" over a third of the deck
// with no denominator is the shape of a guard that is quietly not looking.
console.log(`lesson band guard: clean (${checked + unbandable + notFactDerived} cards: `
    + `${checked} derived onto their concept's band, `
    + `${unbandable} demonstrate no arithmetic fact, `
    + `${notFactDerived} in domains whose rung is not fact-derived`
    + (exempt.size > 0 ? `, ${exempt.size} declared exemption(s)` : '') + ')');
