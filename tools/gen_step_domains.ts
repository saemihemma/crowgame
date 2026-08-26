/**
 * Which curriculum steps the derivation can actually EMIT, per domain.
 *
 * A step no function can produce is not a content gap -- no amount of authoring
 * fills it, because no problem derives onto it. `deriveSubtractionStep` maps
 * operands of 20 or less onto 0..16 and then the next band starts at 21, so
 * steps 17-20 are a dead zone in its range; `deriveMultiplicationStep` can never
 * return 11 because the only fact whose table ranks both reach 11 is 9x9, and
 * squares are caught by an earlier branch.
 *
 * Five rungs were recorded as authoring debt for exactly this reason. They were
 * not. This brute-forces the real functions over every input the pools can
 * contain, so the difference between "nobody wrote it" and "nothing can land
 * there" is measured rather than argued.
 *
 * Run: npx tsx tools/gen_step_domains.ts   (npm run validate checks freshness)
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { deriveCurriculumStep } from './math_curriculum';
import type { MathProblem } from '../math-kernel/utils/Types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'reports', 'math-concepts', 'emittable-steps.json');

/** The widest operands the shipped pools contain, rounded up. */
const MAX_OPERAND = 5000;

const shell = (domain: string, text: string, correct: number): MathProblem => ({
    id: 'probe', domain, skills: [], difficulty: 1, ageBand: [5, 7],
    prompt: { text, assets: null },
    answer: { mode: 'mcq', correct, options: [] },
    hint: '', explanation: '', misconceptionTags: [], generator: null, curriculumStep: 0,
} as unknown as MathProblem);

const emit = (domain: string, texts: Array<[string, number]>) => {
    const steps = new Set<number>();
    for (const [text, correct] of texts) steps.add(deriveCurriculumStep(shell(domain, text, correct)));
    return [...steps].sort((a, b) => a - b);
};

const cases: Record<string, Array<[string, number]>> = {
    addition: [], subtraction: [], multiplication: [], division: [],
    counting: [], comparison: [], pattern_matching: [], number_sequence: [],
};

// Arithmetic: every pair the pools could hold, sampled densely where the bands
// change and coarsely out in the thousands.
const operands: number[] = [];
for (let v = 0; v <= 130; v++) operands.push(v);
for (let v = 140; v <= MAX_OPERAND; v += 37) operands.push(v);
for (const l of operands) {
    for (const r of operands) {
        if (l + r <= MAX_OPERAND) cases.addition.push([`${l} + ${r} = ?`, l + r]);
        if (r <= l) cases.subtraction.push([`${l} - ${r} = ?`, l - r]);
    }
}
for (let l = 0; l <= 99; l++) {
    for (let r = 0; r <= 99; r++) {
        cases.multiplication.push([`${l} × ${r} = ?`, l * r]);
        if (r > 0 && l % r === 0) cases.division.push([`${l} ÷ ${r} = ?`, l / r]);
    }
}
// The non-arithmetic domains derive from their own shapes.
for (let n = 1; n <= 40; n++) {
    cases.counting.push([`Count these: ${'o '.repeat(n).trim()}`, n]);
    cases.comparison.push([`Which number is greater: ${n} or ${n + 1}?`, n + 1]);
}
// Sequence LENGTH is one of the step's own inputs (four visible terms earn a
// rung the same numbers in two terms do not), so sweep every authorable length,
// not just the longest. A four-term-only sweep reported number_sequence step 0
// as a dead zone when in truth `1, 2, ?` lands squarely on it.
for (let start = 0; start <= 400; start += 7) {
    for (const gap of [1, 2, 3, 5, 10, 25, 50]) {
        for (const shown of [2, 3, 4, 5]) {
            const seq = Array.from({ length: shown }, (_, i) => start + gap * i);
            cases.number_sequence.push([`What number comes next? ${seq.join(', ')}, ?`, start + gap * shown]);
        }
        cases.pattern_matching.push([
            `What comes next in the repeat pattern: ${[start, start + gap, start, start + gap, start].join(', ')}, ?`,
            start + gap,
        ]);
        cases.pattern_matching.push([
            `What comes next in the repeat pattern: ${[start, start + gap, start].join(', ')}, ?`,
            start + gap,
        ]);
    }
}

// EVERY AUTHORED PROMPT TOO, not just synthetic ones.
//
// The synthetic cases above only cover shapes I thought of, and the
// shape-derived domains (counting, comparison, sequences, patterns) read the
// problem rather than an operand pair. A first version of this file reported
// number_sequence step 2 as unreachable while eleven authored problems sat on
// it. Anything real is emittable by definition, so the pools are the floor and
// the synthetic sweep only adds reach beyond them.
for (const file of readdirSync(join(ROOT, 'godot', 'data', 'math')).filter(f => f.startsWith('problems_'))) {
    const pool = JSON.parse(readFileSync(join(ROOT, 'godot', 'data', 'math', file), 'utf8')) as { problems?: MathProblem[] };
    for (const p of pool.problems ?? []) {
        if (cases[p.domain]) cases[p.domain].push([p.prompt.text, Number(p.answer.correct)]);
    }
}

/**
 * A stale dead-zone report is worse than none: the guard would excuse a real
 * empty rung as structurally impossible. Hash the two things that can change the
 * answer -- the derivation itself and the pools it is fed -- so `npm run
 * validate` fails the moment this file stops describing the current code.
 */
export function reportHash(domains: unknown): string {
    const hash = createHash('sha256');
    // The payload is hashed alongside its inputs, not just the inputs: hand-
    // editing `unreachable` to excuse a rung is the exact abuse this guards.
    hash.update(JSON.stringify(domains)).update('\0');
    hash.update(readFileSync(join(ROOT, 'tools', 'math_curriculum.ts'), 'utf8'));
    hash.update(readFileSync(join(ROOT, 'tools', 'gen_step_domains.ts'), 'utf8'));
    for (const file of readdirSync(join(ROOT, 'godot', 'data', 'math')).filter(f => f.startsWith('problems_')).sort()) {
        hash.update(file).update('\0').update(readFileSync(join(ROOT, 'godot', 'data', 'math', file), 'utf8'));
    }
    return hash.digest('hex');
}

const result: Record<string, { emittable: number[]; unreachable: number[] }> = {};
for (const [domain, texts] of Object.entries(cases)) {
    const emittable = emit(domain, texts);
    const span = emittable.length > 0 ? emittable[emittable.length - 1] : -1;
    const unreachable: number[] = [];
    for (let s = 0; s <= span; s++) if (!emittable.includes(s)) unreachable.push(s);
    result[domain] = { emittable, unreachable };
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
    generatedBy: 'tools/gen_step_domains.ts',
    note: 'A step in `unreachable` is one the derivation cannot produce for any input. It is not a content gap and cannot be filled by authoring.',
    inputsHash: reportHash(result),
    domains: result,
}, null, 2) + '\n');

for (const [domain, r] of Object.entries(result)) {
    console.log(`${domain.padEnd(17)} emits ${String(r.emittable.length).padStart(3)} steps, top ${String(r.emittable[r.emittable.length - 1]).padStart(2)}` +
        (r.unreachable.length ? `  UNREACHABLE: ${r.unreachable.join(', ')}` : '  (no dead zones)'));
}
