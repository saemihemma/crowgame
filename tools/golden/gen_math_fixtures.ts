/**
 * Golden-value fixture generator for the Godot math/learner parity tests.
 *
 * Drives the REAL TypeScript classes (ELOManager, ProblemPoolManager,
 * problemReplayKey, LearnerStateManager) with fixed seeded inputs and emits
 * godot/tests/fixtures/math_fixtures.json. The Godot port replays the same
 * inputs in test_math_parity.gd and must reproduce these exact outputs.
 *
 * Run: npx tsx tools/golden/gen_math_fixtures.ts
 *
 * Determinism: Math.random is replaced with a seeded PRNG so regenerating is
 * stable. The review-queue "gap" is intentionally random in the source, so the
 * GDScript test range-checks dueAfterAttempt rather than comparing it exactly.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ELOManager } from '../../math-kernel/math/ELOManager';
import { ProblemPoolManager } from '../../math-kernel/math/ProblemPoolManager';
import { buildProblemReplayKey } from '../../math-kernel/math/problemReplayKey';
import { LearnerStateManager } from '../../math-kernel/systems/LearnerStateManager';

// ── seeded PRNG (mulberry32) replacing Math.random for reproducible output ──
let _seed = 0x9e3779b9;
function mulberry32(): number {
  _seed |= 0; _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
(Math as any).random = mulberry32;

const DOMAINS = ['addition', 'subtraction', 'multiplication', 'division', 'counting', 'comparison', 'pattern_matching', 'number_sequence'] as const;

// ── ELO scenarios ──────────────────────────────────────────────────────────
type EloInit = { globalELO?: number; problemsAttempted?: number; domainModifiers?: Record<string, number> };
type EloScenario = { name: string; init: EloInit; updates: { domain: string; problemELO: number; actualScore: number }[] };

function makeStats(init: EloInit) {
  const base = ELOManager.createDefaultStats();
  base.globalELO = init.globalELO ?? base.globalELO;
  base.problemsAttempted = init.problemsAttempted ?? 0;
  if (init.domainModifiers) Object.assign(base.domainModifiers, init.domainModifiers);
  return base;
}

const eloScenarios: EloScenario[] = [
  { name: 'fresh_correct_then_wrong', init: {}, updates: [
    { domain: 'addition', problemELO: 100, actualScore: 1.0 },
    { domain: 'addition', problemELO: 100, actualScore: 1.0 },
    { domain: 'addition', problemELO: 300, actualScore: 0.0 },
    { domain: 'addition', problemELO: 200, actualScore: 0.5 },
  ]},
  { name: 'k_tier_mid_50', init: { globalELO: 400, problemsAttempted: 60 }, updates: [
    { domain: 'multiplication', problemELO: 400, actualScore: 1.0 },
    { domain: 'multiplication', problemELO: 600, actualScore: 0.0 },
  ]},
  { name: 'k_tier_stable_200', init: { globalELO: 800, problemsAttempted: 250 }, updates: [
    { domain: 'division', problemELO: 800, actualScore: 0.5 },
    { domain: 'division', problemELO: 800, actualScore: 1.0 },
  ]},
  { name: 'clamp_global_floor', init: { globalELO: 105, problemsAttempted: 0 }, updates: [
    { domain: 'addition', problemELO: 1100, actualScore: 0.0 },
    { domain: 'addition', problemELO: 1100, actualScore: 0.0 },
    { domain: 'addition', problemELO: 1100, actualScore: 0.0 },
  ]},
  { name: 'clamp_global_ceiling', init: { globalELO: 1196, problemsAttempted: 10 }, updates: [
    { domain: 'addition', problemELO: 100, actualScore: 1.0 },
    { domain: 'addition', problemELO: 100, actualScore: 1.0 },
  ]},
  { name: 'domain_split_7030', init: { globalELO: 500, problemsAttempted: 5 }, updates: [
    { domain: 'comparison', problemELO: 500, actualScore: 1.0 },
  ]},
  { name: 'domain_modifier_floor', init: { globalELO: 600, problemsAttempted: 0, domainModifiers: { division: -98 } }, updates: [
    { domain: 'division', problemELO: 1100, actualScore: 0.0 },
    { domain: 'division', problemELO: 1100, actualScore: 0.0 },
  ]},
];

function runEloScenarios() {
  return eloScenarios.map(sc => {
    const elo = ELOManager.getInstance();
    elo.initialize(makeStats(sc.init));
    const perUpdate = sc.updates.map(u => {
      const r = elo.updateRating(u.domain as any, u.problemELO, u.actualScore);
      return { change: r.change, expectedScore: r.expectedScore, newGlobalELO: r.newGlobalELO, newDomainModifier: r.newDomainModifier };
    });
    const stats = elo.getStats();
    return {
      name: sc.name, init: sc.init, updates: sc.updates, perUpdate,
      final: { globalELO: stats.globalELO, problemsAttempted: stats.problemsAttempted, domainModifiers: { ...stats.domainModifiers } },
    };
  });
}

// ── problem ELO mapping ──────────────────────────────────────────────────────
function runProblemElo() {
  const pool = new ProblemPoolManager();
  const difficulties = [1, 1.5, 2, 2.7, 3, 5, 0.5, 6];
  const problems = difficulties.map((d, i) => ({
    id: `pe_${i}`, domain: 'addition', skills: ['add'], difficulty: d, curriculumStep: 0,
    prompt: { text: `${i} + ${i}` }, answer: { correct: i + i, options: [] },
  }));
  pool.initialize(problems as any);
  return difficulties.map((d, i) => ({ difficulty: d, elo: pool.getProblemELO(`pe_${i}`) }));
}

// ── replay keys ──────────────────────────────────────────────────────────────
function runReplayKeys() {
  const cases: any[] = [
    { domain: 'addition', prompt: { text: '3 + 5' }, answer: { correct: 8 } },
    { domain: 'addition', prompt: { text: '5 + 3' }, answer: { correct: 8 } },
    { domain: 'subtraction', prompt: { text: '9 - 4' }, answer: { correct: 5 } },
    { domain: 'subtraction', prompt: { text: '4 - 9' }, answer: { correct: -5 } },
    { domain: 'multiplication', prompt: { text: '2 × 6' }, answer: { correct: 12 } },
    { domain: 'multiplication', prompt: { text: '6 × 2' }, answer: { correct: 12 } },
    { domain: 'division', prompt: { text: '8 ÷ 2' }, answer: { correct: 4 } },
    { domain: 'counting', prompt: { text: 'Count these: apples' }, answer: { correct: 7 } },
    { domain: 'comparison', prompt: { text: 'Which number is greater: 10 or 5?' }, answer: { correct: '10' } },
    { domain: 'number_sequence', prompt: { text: '1, 2, 3, ?' }, answer: { correct: 4 } },
    { domain: 'pattern_matching', prompt: { text: 'Pattern 2 4 6 then ?' }, answer: { correct: 8 } },
    { domain: 'addition', prompt: { text: 'What comes next, friend?' }, answer: { correct: 'star' } },
  ];
  return cases.map(c => ({ problem: c, key: buildProblemReplayKey(c) }));
}

// ── learner scenarios ────────────────────────────────────────────────────────
type RawAttempt = {
  domain: string; skills: string[]; correct: boolean; firstAttempt: boolean;
  hintsUsed?: number; responseMs?: number; answeredAt?: number; problemELO?: number;
  curriculumStep: number; selectionLane?: string; reviewItemId?: string | null;
};
type LearnerScenario = { name: string; eloInit?: EloInit; attempts: RawAttempt[] };

const learnerScenarios: LearnerScenario[] = [
  { name: 'confidence_decay', attempts: [
    { domain: 'subtraction', skills: ['sub'], correct: true, firstAttempt: true, curriculumStep: 0 },
    { domain: 'subtraction', skills: ['sub'], correct: true, firstAttempt: true, curriculumStep: 0 },
    { domain: 'subtraction', skills: ['sub'], correct: false, firstAttempt: false, curriculumStep: 0 },
    { domain: 'subtraction', skills: ['sub'], correct: true, firstAttempt: false, curriculumStep: 0 },
  ]},
  { name: 'promotion_addition', attempts: Array.from({ length: 5 }, () => (
    { domain: 'addition', skills: ['add'], correct: true, firstAttempt: true, curriculumStep: 2 } as RawAttempt
  ))},
  { name: 'demotion_single_wrong', attempts: [
    { domain: 'addition', skills: ['add'], correct: false, firstAttempt: false, curriculumStep: 2 },
  ]},
  { name: 'review_lifecycle', attempts: [
    { domain: 'multiplication', skills: ['mult_basic'], correct: false, firstAttempt: false, curriculumStep: 0, answeredAt: 1000 },
    { domain: 'multiplication', skills: ['mult_basic'], correct: true, firstAttempt: true, curriculumStep: 0, answeredAt: 2000, reviewItemId: '@existing' },
    { domain: 'multiplication', skills: ['mult_basic'], correct: true, firstAttempt: true, curriculumStep: 0, answeredAt: 3000, reviewItemId: '@existing' },
  ]},
  { name: 'recent_problem_ids_cap', attempts: Array.from({ length: 15 }, (_, i) => (
    { domain: 'counting', skills: ['count'], correct: true, firstAttempt: true, curriculumStep: 2 } as RawAttempt
  ))},
];

function normalizeReviewItems(items: any[]) {
  return items.map(it => ({
    skill: it.skill, domain: it.domain, stage: it.stage,
    successfulReviews: it.successfulReviews,
    dueAt: it.dueAt ?? null,
    dueAfterAttemptSet: it.dueAfterAttempt !== null && it.dueAfterAttempt !== undefined,
    dueAfterAttempt: it.dueAfterAttempt ?? null,
  })).sort((a, b) => (a.domain + a.skill + a.stage).localeCompare(b.domain + b.skill + b.stage));
}

function runLearnerScenarios() {
  return learnerScenarios.map(sc => {
    const elo = ELOManager.getInstance();
    elo.initialize(makeStats(sc.eloInit ?? {}));
    const lsm = LearnerStateManager.getInstance();
    lsm.initialize({ childId: 'c', familyId: 'f' }, undefined, elo.getStats());

    const resolvedAttempts: any[] = [];
    let counter = 0;
    for (const a of sc.attempts) {
      let reviewItemId: string | null = a.reviewItemId ?? null;
      if (reviewItemId === '@existing') {
        const snap = lsm.getSnapshot();
        const found = snap.reviewItems.find(it => it.domain === a.domain && it.skill === a.skills[0] && it.stage !== 'graduated');
        reviewItemId = found ? found.id : null;
      }
      const submission = {
        attemptId: `att_${counter++}`,
        childId: 'c', familyId: 'f',
        problemId: `prob_${counter}`,
        domain: a.domain as any,
        skills: a.skills,
        correct: a.correct,
        firstAttempt: a.firstAttempt,
        hintsUsed: a.hintsUsed ?? 0,
        responseMs: a.responseMs ?? 1000,
        answeredAt: a.answeredAt ?? (1000 + counter),
        problemELO: a.problemELO ?? 150,
        curriculumStep: a.curriculumStep,
        selectionLane: (a.selectionLane ?? 'at_level') as any,
        reviewItemId,
      };
      lsm.recordAttempt(submission as any);
      // Emit the original marker (e.g. "@existing"), NOT the TS-generated id, so
      // the GDScript test re-resolves against its own (differently-id'd) state.
      resolvedAttempts.push({ ...submission, reviewItemId: a.reviewItemId ?? null });
    }

    const snap = lsm.getSnapshot();
    const confidence: Record<string, number> = {};
    const curriculum: Record<string, { currentStep: number; winsAtCurrentStep: number }> = {};
    const unlock: Record<string, boolean> = {};
    for (const d of DOMAINS) {
      confidence[d] = snap.confidenceOffsets[d];
      curriculum[d] = { currentStep: snap.curriculumProgress[d].currentStep, winsAtCurrentStep: snap.curriculumProgress[d].winsAtCurrentStep };
      unlock[d] = snap.unlockState[d] ?? false;
    }
    return {
      name: sc.name, eloInit: sc.eloInit ?? {}, attempts: resolvedAttempts,
      expected: {
        confidenceOffsets: confidence,
        curriculum,
        reviewItems: normalizeReviewItems(snap.reviewItems),
        recentProblemIds: snap.recentProblemIds.slice(),
        unlockState: unlock,
      },
    };
  });
}

const fixtures = {
  _comment: 'Generated by tools/golden/gen_math_fixtures.ts. Do not edit by hand.',
  elo: runEloScenarios(),
  problemELO: runProblemElo(),
  replayKeys: runReplayKeys(),
  learner: runLearnerScenarios(),
};

const outPath = resolve(__dirname, '../../godot/tests/fixtures/math_fixtures.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(fixtures, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`  elo=${fixtures.elo.length} problemELO=${fixtures.problemELO.length} replayKeys=${fixtures.replayKeys.length} learner=${fixtures.learner.length}`);
