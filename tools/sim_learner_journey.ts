/**
 * What a child actually experiences, over a whole journey rather than a smoke.
 *
 * The runtime-selector smoke proves the owl never breaches a cap. That is a
 * safety property, and it is silent on the question that matters to a child:
 * does answering correctly get you MORE MATHS? It runs 50-160 attempts, tracks
 * one domain's unlock, and accepts a run in which a domain unlocked and was then
 * never served at all.
 *
 * This plays a long journey on the same rails and reports the lived experience:
 *
 *   - when each domain UNLOCKS, and when it is first actually SERVED. A gap
 *     between those two numbers is content a child earned and did not receive.
 *   - how far up each ladder a child climbs, and which concepts they meet, which
 *     is the same thing as which lessons ever open.
 *   - what is left on the shelf: authored, servable by every cap, and never
 *     reached in a full journey.
 *
 * The last one is the point. Problems that no journey reaches are problems
 * sitting in git.
 *
 * Run: npx tsx tools/sim_learner_journey.ts [--attempts=N] [--report]
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MathProblemManager } from '../math-kernel/math/MathProblemManager';
import { ELOManager } from '../math-kernel/math/ELOManager';
import { LearnerStateManager } from '../math-kernel/systems/LearnerStateManager';
import { selectOwlProblem } from '../math-kernel/math/owlSelection';
import { MathTuning } from '../math-kernel/math/MathTuning';
import type { MathDomain, MathProblem } from '../math-kernel/utils/Types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf-8'));

// ── the rails, read from the shipped data rather than restated ──────────────

interface Concept { id: string; domain: string; steps: number[]; tutorial: string | null; requires?: { skill?: string } }
const ladder = read(join(ROOT, 'godot', 'data', 'curriculum', 'concept_ladder.json')) as { concepts: Concept[] };
const overlays = ladder.concepts.filter(c => c.requires?.skill);
const rungs = ladder.concepts.filter(c => !c.requires?.skill);

/** The same overlay-then-step rule the runtime and the concept guard both use. */
function conceptFor(problem: MathProblem): string | null {
    const skills = problem.skills ?? [];
    for (const o of overlays) {
        if (o.domain === problem.domain && skills.includes(o.requires!.skill!)) return o.id;
    }
    for (const r of rungs) {
        if (r.domain === problem.domain
            && problem.curriculumStep >= r.steps[0] && problem.curriculumStep <= r.steps[1]) return r.id;
    }
    return null;
}

function loadPools(): MathProblem[] {
    const dir = join(ROOT, 'godot', 'data', 'math');
    const out: MathProblem[] = [];
    for (const file of readdirSync(dir).filter(f => f.startsWith('problems_')).sort()) {
        out.push(...(read(join(dir, file)).problems ?? []));
    }
    return out;
}

function loadOwl(): { domains: MathDomain[]; difficultyRange: [number, number]; problemCount: number } {
    const registry = read(join(ROOT, 'godot', 'data', 'npcs', 'npc_registry.json')) as {
        npcs: Array<{ id: string; components: Array<Record<string, unknown>> }>;
    };
    // The teacher owl is the one a child meets first and most.
    const owl = registry.npcs.find(n => n.id === 'owl_teacher_01')!;
    const math = owl.components.find(c => c['type'] === 'math_challenge')!;
    return {
        domains: math['problemTypes'] as MathDomain[],
        difficultyRange: math['difficultyRange'] as [number, number],
        problemCount: Number(math['problemCount'] ?? 1),
    };
}

/** The age-band cap, mirrored from math_challenge_component.gd. */
const MAX_OPERAND = 20;

// Deterministic, including the selector's own coin flips.
//
// buildDomainAttemptOrder calls Math.random to decide whether the preferred
// domain goes first. Left unseeded, the same journey produces different numbers
// every run -- which makes a guard with thresholds flaky and a document quoting
// exact figures a lie by the next commit. So the whole run, learner and selector
// alike, is driven from one seed.
let seed = 0x2f6f2b3d;
const rand = (): number => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) % 100000) / 100000;
};
const realRandom = Math.random;
const withSeededRandom = <T>(fn: () => T): T => {
    Math.random = rand;
    try { return fn(); } finally { Math.random = realRandom; }
};

export interface DomainJourney {
    domain: string;
    /** The unlock that is still standing, or null if the gate closed again. */
    unlockedAt: number | null;
    firstServedAt: number | null;
    served: number;
    maxStep: number;
    /** Times this domain opened and closed again before it was ever served. */
    unlockFlickers?: number;
}
export interface JourneyResult {
    profile: string;
    successRate: number;
    attempts: number;
    servedProblems: number;
    exhaustedAt: number | null;
    domains: DomainJourney[];
    conceptsMet: string[];
    /** currentStep per domain sampled every 200 attempts, to tell a stall from slow going. */
    stepTrace: Array<{ at: number; steps: Record<string, number> }>;
    conceptsNeverMet: string[];
    lessonsOpened: number;
    uniqueProblemsServed: number;
}

export function runJourney(profile: string, successRate: number, attempts: number): JourneyResult {
    return withSeededRandom(() => runJourneyInner(profile, successRate, attempts));
}

function runJourneyInner(profile: string, successRate: number, attempts: number): JourneyResult {
    // The kernel reads its ladder and lane knobs from the shipped tuning file.
    // The Godot boot path does this at runtime; a Node tool has to do it itself.
    MathTuning.initialize(read(join(ROOT, 'godot', 'data', 'tuning', 'math_tuning.json')));
    const problems = loadPools();
    const owl = loadOwl();
    const manager = MathProblemManager.getInstance();
    manager.addPool('journey', { problems } as never);
    manager.resetAnswered();
    ELOManager.getInstance().initialize(undefined);
    // The same provider elo_update_manager.gd installs at runtime. Without it
    // reconcileCurriculumFloors early-returns and every domain sits on step 0 --
    // which made division look permanently unreachable when the fault was this
    // harness being unfaithful to the game, not the game.
    const byStep = new Map<string, number>();
    for (const p of problems) {
        const key = `${p.domain}:${p.curriculumStep}`;
        byStep.set(key, (byStep.get(key) ?? 0) + 1);
    }
    LearnerStateManager.getInstance().setStepContentProvider(
        (domain, step) => (byStep.get(`${domain}:${step}`) ?? 0) >= 3,
    );
    LearnerStateManager.getInstance().initialize(
        { childId: `journey-${profile}`, familyId: 'journey' },
        undefined,
        ELOManager.getInstance().getStats(),
    );

    const state: Record<string, DomainJourney> = {};
    for (const d of owl.domains) {
        state[d] = { domain: d, unlockedAt: null, firstServedAt: null, served: 0, maxStep: -1 };
    }
    const conceptsMet = new Map<string, number>();
    const stepTrace: Array<{ at: number; steps: Record<string, number> }> = [];
    const seenIds = new Set<string>();
    let exhaustedAt: number | null = null;
    let servedProblems = 0;
    let previousDomain: MathDomain | null = null;
    let inEncounter = 0;

    const config = {
        domains: owl.domains,
        difficultyRange: owl.difficultyRange,
        maxCurriculumStep: Math.max(0, Math.round(owl.difficultyRange[1] * 10)),
        maxOperand: MAX_OPERAND,
        primaryDomain: owl.domains[0],
        domainWeights: read(join(ROOT, 'godot', 'data', 'tuning', 'math_tuning.json')).domainWeights ?? {},
    };

    for (let attempt = 1; attempt <= attempts; attempt++) {
        // UNLOCKING IS NOT A ONE-WAY DOOR.
        //
        // A domain opens behind an accuracy gate over its own recent history, so
        // a child hovering around that gate crosses it in both directions. This
        // used to latch the FIRST unlock and never clear it, which made the gap
        // check below measure from a moment that had since been undone: the
        // struggling profile unlocked multiplication at attempt 161, re-locked a
        // few attempts later, and the guard then reported 396 attempts of
        // "withheld earned content" for a domain the child had not, at that
        // point, earned. It found that only when an unrelated selection change
        // moved the flicker, which is how a latch bug hides.
        //
        // So track the unlock that is still standing, and count the flickers --
        // a domain that oscillates is worth knowing about on its own.
        for (const d of owl.domains) {
            const unlocked = LearnerStateManager.getInstance().isDomainUnlocked(d);
            if (unlocked && state[d].unlockedAt === null) {
                state[d].unlockedAt = attempt;
            } else if (!unlocked && state[d].unlockedAt !== null && state[d].firstServedAt === null) {
                // Opened and closed again without ever being served. That is not
                // withheld content, it is a gate the child has not held.
                state[d].unlockedAt = null;
                state[d].unlockFlickers = (state[d].unlockFlickers ?? 0) + 1;
            }
        }

        if (attempt % 200 === 0) {
            const snap = LearnerStateManager.getInstance().getSnapshot();
            stepTrace.push({ at: attempt, steps: Object.fromEntries(
                owl.domains.map(d => [d, snap.curriculumProgress[d]?.currentStep ?? -1])) });
        }
        const problem = selectOwlProblem(manager, config, inEncounter > 0 ? previousDomain : null);
        if (!problem) { exhaustedAt = attempt; break; }

        servedProblems += 1;
        seenIds.add(problem.id);
        const s = state[problem.domain] ?? (state[problem.domain] = {
            domain: problem.domain, unlockedAt: null, firstServedAt: null, served: 0, maxStep: -1,
        });
        s.served += 1;
        s.maxStep = Math.max(s.maxStep, problem.curriculumStep);
        if (s.firstServedAt === null) s.firstServedAt = attempt;
        const concept = conceptFor(problem);
        if (concept && !conceptsMet.has(concept)) conceptsMet.set(concept, attempt);

        const meta = manager.consumeSelectionMeta(problem.id) ?? { lane: 'comfort', reviewItemId: null };
        const problemELO = manager.getPoolManager()?.getProblemELO(problem.id) ?? 400;
        const success = rand() < successRate;
        ELOManager.getInstance().updateRating(problem.domain, problemELO, success ? 1 : 0);
        LearnerStateManager.getInstance().recordAttempt({
            attemptId: `a-${attempt}`, childId: `journey-${profile}`, familyId: 'journey',
            problemId: problem.id, domain: problem.domain, skills: problem.skills ?? [],
            correct: success, firstAttempt: true, hintsUsed: 0, responseMs: 4000,
            problemELO, curriculumStep: problem.curriculumStep,
            selectionLane: meta.lane, reviewItemId: meta.reviewItemId,
            answeredAt: new Date(Date.now() + attempt * 1000).toISOString(),
        } as never);

        if (success && inEncounter + 1 < owl.problemCount) { inEncounter += 1; previousDomain = problem.domain; }
        else { inEncounter = 0; previousDomain = null; }
    }

    const withLesson = ladder.concepts.filter(c => c.tutorial);
    return {
        profile, successRate, attempts, servedProblems, exhaustedAt,
        domains: owl.domains.map(d => state[d]),
        conceptsMet: [...conceptsMet.keys()], stepTrace,
        conceptsNeverMet: withLesson.filter(c => !conceptsMet.has(c.id)).map(c => c.id),
        lessonsOpened: [...conceptsMet.keys()].filter(id => withLesson.some(c => c.id === id)).length,
        uniqueProblemsServed: seenIds.size,
    };
}

// ── report ──────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('sim_learner_journey.ts')) {
    const attemptsArg = process.argv.find(a => a.startsWith('--attempts='));
    const attempts = attemptsArg ? Number(attemptsArg.split('=')[1]) : 1200;
    const results: JourneyResult[] = [];
    for (const [name, rate] of [['thriving', 0.95], ['steady', 0.85], ['struggling', 0.7]] as const) {
        seed = 0x2f6f2b3d;
        results.push(runJourney(name, rate, attempts));
    }

    for (const r of results) {
        console.log(`\n=== ${r.profile} (${(r.successRate * 100).toFixed(0)}% correct, ${r.attempts} attempts) ===`);
        if (r.exhaustedAt) console.log(`  EXHAUSTED at attempt ${r.exhaustedAt}: the owl ran out of problems.`);
        console.log(`  ${r.servedProblems} served, ${r.uniqueProblemsServed} distinct, ${r.lessonsOpened} lessons opened`);
        const flickering = r.domains.filter(d => (d.unlockFlickers ?? 0) > 0);
        if (flickering.length > 0) {
            console.log('  gates that opened and closed again before being served: '
                + flickering.map(d => `${d.domain} x${d.unlockFlickers}`).join(', '));
        }
        console.log('  domain            unlocked  first served   gap   served  top step');
        for (const d of r.domains) {
            const gap = d.unlockedAt !== null && d.firstServedAt !== null ? d.firstServedAt - d.unlockedAt
                : d.unlockedAt !== null ? Infinity : null;
            console.log(`  ${d.domain.padEnd(17)}${String(d.unlockedAt ?? '-').padStart(8)}`
                + `${String(d.firstServedAt ?? 'NEVER').padStart(14)}`
                + `${(gap === null ? '-' : gap === Infinity ? 'NEVER' : String(gap)).padStart(6)}`
                + `${String(d.served).padStart(8)}${String(d.maxStep < 0 ? '-' : d.maxStep).padStart(10)}`);
        }
        if (process.argv.includes('--trace')) {
            console.log('  step trace (currentStep per domain):');
            for (const t of r.stepTrace) {
                console.log(`    @${String(t.at).padStart(4)}  ` +
                    Object.entries(t.steps).map(([d, v]) => `${d.slice(0, 4)}:${String(v).padStart(2)}`).join(' '));
            }
        }
        if (r.conceptsNeverMet.length > 0) {
            console.log(`  ${r.conceptsNeverMet.length} concept(s) with a lesson never reached:`);
            console.log(`    ${r.conceptsNeverMet.join(', ')}`);
        }
    }

    // ── the guard ───────────────────────────────────────────────────────────
    //
    // Three properties, each one a defect this file was written to catch:
    //
    //   1. A domain a child EARNED must actually be served. The gap between
    //      unlocking and being offered was 78 attempts for comparison and
    //      infinite for division before the selector picked by staleness.
    //   2. A thriving child must reach division. It was arithmetically
    //      impossible while unlocking read a domain's slice of a shared window.
    //   3. Coverage must not collapse. 335 distinct problems out of 4039 in a
    //      1200-attempt journey is content sitting in git.
    const MAX_UNLOCK_TO_SERVED_GAP = 25;
    const MIN_DISTINCT_FOR_THRIVING = 450;
    const failures: string[] = [];
    for (const r of results) {
        for (const d of r.domains) {
            if (d.unlockedAt === null) continue;
            if (d.firstServedAt === null) {
                failures.push(`[${r.profile}] ${d.domain} unlocked at attempt ${d.unlockedAt} and was NEVER served. `
                    + 'A child earned it and did not receive it.');
                continue;
            }
            const gap = d.firstServedAt - d.unlockedAt;
            if (gap > MAX_UNLOCK_TO_SERVED_GAP) {
                failures.push(`[${r.profile}] ${d.domain} unlocked at ${d.unlockedAt} but was not served until `
                    + `${d.firstServedAt} -- ${gap} attempts of earned content withheld (limit ${MAX_UNLOCK_TO_SERVED_GAP}).`);
            }
        }
        if (r.exhaustedAt !== null) {
            failures.push(`[${r.profile}] the owl ran out of problems at attempt ${r.exhaustedAt}.`);
        }
    }
    const thriving = results.find(r => r.profile === 'thriving')!;
    if (!thriving.domains.some(d => d.domain === 'division' && (d.served ?? 0) > 0)) {
        failures.push('a thriving child never reaches division. Multiplication and division are authored '
            + 'and reachable; a journey that never arrives at them is content sitting in git.');
    }
    if (thriving.uniqueProblemsServed < MIN_DISTINCT_FOR_THRIVING) {
        failures.push(`a thriving child saw only ${thriving.uniqueProblemsServed} distinct problems `
            + `(floor ${MIN_DISTINCT_FOR_THRIVING}). Coverage has collapsed.`);
    }

    if (failures.length > 0) {
        console.error('\nlearner journey guard: FAILED');
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
    }
    console.log(`\nlearner journey guard: clean (3 journeys, every unlocked domain served within `
        + `${MAX_UNLOCK_TO_SERVED_GAP} attempts, thriving child reaches division and `
        + `${thriving.uniqueProblemsServed} distinct problems)`);

    if (process.argv.includes('--report')) {
        const out = join(ROOT, 'reports', 'math-concepts', 'learner-journey.json');
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, JSON.stringify({ generatedBy: 'tools/sim_learner_journey.ts', results }, null, 2) + '\n');
        console.log(`\nWrote ${out}`);
    }
}
