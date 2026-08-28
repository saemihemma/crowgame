import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { deriveCurriculumStep, deriveDifficultyTraits } from './math_curriculum';
import { buildPromptUniquenessKey, deriveVerifiedDifficultyTraits, evaluateArithmeticPrompt } from './math_verifier';
import { ELOManager } from '../math-kernel/math/ELOManager';
import { MathProblemManager } from '../math-kernel/math/MathProblemManager';
import { selectOwlProblem, type OwlSelectionConfig } from '../math-kernel/math/owlSelection';
import { buildProblemReplayKey } from '../math-kernel/math/problemReplayKey';
import { parseWordedArithmetic } from '../math-kernel/math/wordedArithmetic';
import { LearnerStateManager } from '../math-kernel/systems/LearnerStateManager';
import { MathTuning } from '../math-kernel/math/MathTuning';
import type { LearnerAttemptSubmission, MathDomain, MathProblem, MathProblemPool, SelectionLane } from '../math-kernel/utils/Types';

const ROOT = resolve(join(__dirname, '..'));

// Selector smoke and simulations drive the real ladder, so they need the
// shared tuning JSON loaded exactly like the game does.
MathTuning.initialize(JSON.parse(readFileSync(join(ROOT, 'godot/data/tuning/math_tuning.json'), 'utf8')));
const AUTHORING_DIR = join(ROOT, 'authoring', 'math');
const REPORTS_DIR = join(ROOT, 'reports', 'math-batches');
const DATA_DIR = join(ROOT, 'godot', 'data', 'math');

type NumericRange = [number, number];

export type AuthoringTemplateKind =
    | 'addition'
    | 'subtraction'
    | 'multiplication'
    | 'division'
    | 'counting'
    | 'comparison'
    | 'pattern_matching'
    | 'number_sequence';

export interface MathBand {
    id: string;
    domain: AuthoringTemplateKind;
    family: string;
    curriculumStepRange: NumericRange;
    targetEloRange: NumericRange;
    ageBand: [number, number];
    notes?: string;
}

export interface MathBandTable {
    bands: MathBand[];
}

interface BaseTemplateSpec {
    id: string;
    kind: AuthoringTemplateKind;
    family: string;
    bandId: string;
    count: number;
    skill: string;
    promptVariants: string[];
    hintStrategy: string;
    explanationStrategy: string;
    misconceptionTags: string[];
    promptLeadIn?: string;
    templateStepRange?: NumericRange;
    ageBand?: [number, number];
    /**
     * Use ONLY the listed promptVariants instead of unioning the kind's
     * fallback set. Without this, a story-only template loses most of its
     * count to bare-equation variants in the hash lottery.
     */
    strictVariants?: boolean;
}

export interface ArithmeticTemplateSpec extends BaseTemplateSpec {
    kind: 'addition' | 'subtraction' | 'multiplication' | 'division';
    leftRange: NumericRange;
    rightRange: NumericRange;
    leftValues?: number[];
    rightValues?: number[];
    resultRange?: NumericRange;
    sumRange?: NumericRange;
    allowZero?: boolean;
    distinctOperands?: boolean;
    orderedOperands?: boolean;
    operandDeltaRange?: NumericRange;
    requireCarry?: boolean;
    requireBorrow?: boolean;
    forceDivisible?: boolean;
    maxOperand?: number;
    minOperand?: number;
    /**
     * Emit relational prompts -- the unknown somewhere other than alone on the
     * right -- INSTEAD of the plain framings.
     *
     * "1 + ? = 2" is the same bond as "1 + 1 = ?" asked from the other end, and
     * `deriveCurriculumStep` gives it the same rung, so these land exactly where
     * the plain facts do. They are the number-bond half of early addition: a
     * child who can only answer the plain form has learnt a procedure, and one
     * who can answer both has learnt the bond.
     *
     * `both_sides` ("8 + 7 = ? + 6") is the Falkner/Levi/Carpenter form that
     * separates "=" as a relation from "=" as an instruction. It is a harder
     * idea than a missing part and belongs above the bottom of the ladder.
     * Addition only, and the second right-hand addend comes from
     * `bothSidesOffsets`.
     *
     * MULTIPLICATION and DIVISION take the three one-sided shapes too, and they
     * are not decoration: "3 x ? = 12" is the question a times table answers
     * from the other end, and "? / 4 = 3" is the same fact asked backwards
     * rather than a separate ritual. `godot/data/curriculum/concept_ladder.json`
     * has carried `multiplication.missing_factor`, `division.missing_groups`
     * and `division.start_unknown` -- with tutorials -- since before any
     * template could author them.
     *
     * The shapes and the arithmetic that reads them back live in
     * RELATIONAL_PATTERNS in tools/math_verifier.ts -- this only writes text
     * that file can already parse.
     */
    relationalShapes?: Array<'missing_right' | 'missing_left' | 'total_first' | 'both_sides'>;
    /**
     * The second addend on the RIGHT of a `both_sides` prompt, as an offset from
     * this candidate's own `right`. "8 + 7 = ? + 6" is offset -1.
     *
     * It has to be authored rather than derived, because `d` is a free number:
     * the fact underneath is still a + b, and every d between 1 and a + b - 1
     * gives a different question about the same fact. A fixed spread keeps the
     * template's `count` accountable and keeps the answer near the addend the
     * child can see, which is what makes the form about the equals sign rather
     * than about arithmetic they cannot do yet.
     */
    bothSidesOffsets?: number[];
}

export interface CountingTemplateSpec extends BaseTemplateSpec {
    kind: 'counting';
    countRange: NumericRange;
    /** A single marker for the whole template. Superseded by `symbols`. */
    symbol?: string;
    /**
     * The markers this template may draw its tokens from, cycled across counts.
     *
     * The point is that the shape must NOT tell a child how big the answer is.
     * Every counting template used to pin one marker to one count range -- `o`
     * was always 1-4, `*` always 5-8, `x` always 17-20 -- so the drawn shape was
     * a perfect predictor of the magnitude, and a five-year-old working inside
     * four met exactly one shape for as long as they stayed there. Listing
     * markers here spreads the whole alphabet across every count instead.
     *
     * Omit for the default alphabet (COUNTING_MARKER_ALPHABET).
     */
    symbols?: string[];
}

export interface ComparisonTemplateSpec extends BaseTemplateSpec {
    kind: 'comparison';
    leftRange: NumericRange;
    rightRange: NumericRange;
    relation: 'greater' | 'smaller';
    distinctOperands?: boolean;
}

export interface SequenceTemplateSpec extends BaseTemplateSpec {
    kind: 'number_sequence';
    startRange: NumericRange;
    stepChoices: number[];
    length: number;
}

export interface PatternTemplateSpec extends BaseTemplateSpec {
    kind: 'pattern_matching';
    patternLength: 2 | 3 | 4;
    valueRange: NumericRange;
    cycles: number;
}

export type BatchTemplateSpec =
    | ArithmeticTemplateSpec
    | CountingTemplateSpec
    | ComparisonTemplateSpec
    | SequenceTemplateSpec
    | PatternTemplateSpec;

export interface MathBatchSpec {
    id: string;
    title: string;
    theme: string;
    targetCount: number;
    templates: BatchTemplateSpec[];
}

export interface MathBatchCollection {
    batches: MathBatchSpec[];
}

export interface MaterializedBatch {
    batch: MathBatchSpec;
    problems: MathProblem[];
}

export interface MaterializationResult {
    seedProblems: MathProblem[];
    generatedProblems: MathProblem[];
    curriculumPool: { problems: MathProblem[] };
    materializedBatches: MaterializedBatch[];
}

export interface BatchReviewCategory {
    grade: number;
    summary: string;
    metrics: Record<string, number | string | boolean>;
}

export interface BatchReviewRoleGrade {
    role: string;
    grade: number;
    rationale: string;
}

export interface BatchReview {
    batchId: string;
    title: string;
    accepted: boolean;
    averageGrade: number;
    criticalIssues: string[];
    templateReview: {
        category: BatchReviewCategory;
        roleGrades: BatchReviewRoleGrade[];
    };
    concreteReview: {
        category: BatchReviewCategory;
        roleGrades: BatchReviewRoleGrade[];
    };
    simulationReview: {
        category: BatchReviewCategory;
        roleGrades: BatchReviewRoleGrade[];
        devilAdvocate: {
            passed: boolean;
            note: string;
        };
    };
    samplePrompts: string[];
}

export interface ReviewSummary {
    reviewMethod: {
        kind: 'computed_rubric';
        independentReview: false;
        note: string;
    };
    generatedProblemCount: number;
    acceptedBatchCount: number;
    averageAcceptedGrade: number;
    domainTotals: Record<string, number>;
    owlSurface: {
        domains: MathDomain[];
        openingUnlockedDomains: MathDomain[];
        owlEligibleProblemCount: number;
        owlEligibleUniquePromptCount: number;
        owlEligibleUniqueFactCount: number;
        domainCounts: Record<string, number>;
        openingUnlockedInventoryProblemCount: number;
        openingUnlockedInventoryUniquePromptCount: number;
        openingUnlockedInventoryUniqueFactCount: number;
        freshReachableProblemCount: number;
        freshReachableUniquePromptCount: number;
        freshReachableUniqueFactCount: number;
        freshReachableDomainCounts: Record<string, number>;
        freshReachableAdditionFactCount: number;
        freshReachableCountingFactCount: number;
        currentInteractionProblemCount: number;
        owlAdditionByStep: Array<{
            step: number;
            rowCount: number;
            uniquePromptCount: number;
            uniqueFactCount: number;
        }>;
    };
    batchReviews: BatchReview[];
    runtimeSelectorSmoke: {
        accepted: boolean;
        averageGrade: number;
        summary: string;
        metrics: Record<string, number | string | boolean>;
        roleGrades: BatchReviewRoleGrade[];
        devilAdvocate: {
            passed: boolean;
            note: string;
        };
        caveats: string[];
    };
}

type RawCandidate = {
    values: Record<string, number>;
    promptText: string;
    correct: number;
    complexity: number;
    ageBand: [number, number];
    domain: MathDomain;
    /**
     * Set only by candidates whose hint, explanation or distractors cannot be
     * derived from the template's strategy fields alone.
     *
     * A relational prompt is the reason this exists: "1 + ? = 2" and "? + 1 = 2"
     * are the same fact, but they hand the child a different KNOWN number, so
     * one hint sentence cannot serve both. The shape picks the sentence.
     */
    hint?: string;
    explanation?: string;
    optionPreference?: number[];
    /**
     * Tags this candidate earns beyond its template's. A compare story and a
     * plain sum come off the SAME template and are wrong in different ways, so
     * "the child added instead of subtracting" is a property of the shape, not
     * of the batch.
     */
    misconceptionTags?: string[];
};

function readJson<T>(filePath: string): T {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

type LiveOwlMathConfig = OwlSelectionConfig & {
    problemCount: number;
};

function loadLiveOwlMathConfig(): LiveOwlMathConfig {
    const registry = readJson<{
        npcs?: Array<{
            id?: string;
            components?: Array<Record<string, unknown>>;
        }>;
    }>(join(ROOT, 'godot', 'data', 'npcs', 'npc_registry.json'));

    const owlDefinition = registry.npcs?.find(npc => npc.id === 'owl_teacher_01') ?? registry.npcs?.[0];
    const mathComponent = owlDefinition?.components?.find(component => component.type === 'math_challenge') ?? {};

    const configuredDomains = Array.isArray(mathComponent.problemTypes)
        ? mathComponent.problemTypes.filter((value): value is MathDomain => typeof value === 'string')
        : [];
    const difficultyRange = Array.isArray(mathComponent.difficultyRange) && mathComponent.difficultyRange.length === 2
        ? [Number(mathComponent.difficultyRange[0]), Number(mathComponent.difficultyRange[1])] as [number, number]
        : [1, 2] as [number, number];
    const domains: MathDomain[] = configuredDomains.length > 0
        ? configuredDomains
        : ['addition', 'subtraction'];

    return {
        domains,
        difficultyRange,
        maxCurriculumStep: Math.max(0, Math.round(difficultyRange[1] * 10)),
        // No operand rail: the live component stopped sending one (it froze
        // progression at sums of ~20). The rails model must match what ships.
        maxOperand: Number.POSITIVE_INFINITY,
        problemCount: typeof mathComponent.problemCount === 'number' ? mathComponent.problemCount : 1,
        primaryDomain: domains[0],
    };
}

function isProblemWithinOwlRails(problem: MathProblem, owlConfig: LiveOwlMathConfig): boolean {
    if (!owlConfig.domains.includes(problem.domain)) return false;

    if (problem.difficulty < owlConfig.difficultyRange[0] || problem.difficulty > owlConfig.difficultyRange[1]) {
        return false;
    }

    if (problem.curriculumStep > owlConfig.maxCurriculumStep) {
        return false;
    }

    // An absent rail means no operand cap (the shipped state since 2026-08).
    if (
        problem.difficultyTraits?.maxOperand !== undefined &&
        problem.difficultyTraits.maxOperand > (owlConfig.maxOperand ?? Number.POSITIVE_INFINITY)
    ) {
        return false;
    }

    return true;
}

function writeJson(filePath: string, value: unknown): void {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

function stableHash(input: string): number {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index++) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createSeededRandom(seed: number): () => number {
    let state = seed >>> 0 || 1;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function withSeededRandom<T>(seed: number, fn: () => T): T {
    const originalRandom = Math.random;
    Math.random = createSeededRandom(seed);
    try {
        return fn();
    } finally {
        Math.random = originalRandom;
    }
}

export function computeInitialProblemELO(difficulty: number): number {
    const minELO = 100;
    const maxELO = 1100;
    const minDifficulty = 1;
    const maxDifficulty = 5;
    const normalized = (difficulty - minDifficulty) / (maxDifficulty - minDifficulty);
    return Math.round(minELO + clamp(normalized, 0, 1) * (maxELO - minELO));
}

function difficultyFromTargetELO(targetELO: number): number {
    const minELO = 100;
    const maxELO = 1100;
    const normalized = clamp((targetELO - minELO) / (maxELO - minELO), 0, 1);
    return roundTo(1 + normalized * 4, 2);
}

function interpolate(range: NumericRange, progress: number): number {
    return range[0] + (range[1] - range[0]) * clamp(progress, 0, 1);
}

function toOperator(kind: ArithmeticTemplateSpec['kind']): string {
    if (kind === 'addition') return '+';
    if (kind === 'subtraction') return '-';
    if (kind === 'multiplication') return '\u00D7';
    return '\u00F7';
}

/**
 * English plural agreement for a generated sentence.
 *
 * These generators emitted the plural unconditionally, which produced broken
 * English in the pools that a child reads: "Think of 1 groups of 2.", "1 groups
 * of 2 makes 2.", "There are 1 altogether.", "1 birds sit on a branch.", "You
 * have 1 berries." Correcting the pool files alone was not enough -- the
 * materializer regenerates them from here, so the fix belongs at the source.
 */
function plural(n: number, one: string, other: string): string {
    return n === 1 ? one : other;
}

function formatArithmeticPrompt(variant: string, left: number, operator: string, right: number): string {
    switch (variant) {
        case 'question':
            return `What is ${left} ${operator} ${right}?`;
        case 'solve':
            return `Solve: ${left} ${operator} ${right}`;
        case 'equals':
            return `${left} ${operator} ${right} equals ?`;
        case 'complete':
            return `Complete: ${left} ${operator} ${right} = ?`;
        case 'mental_math':
            return `Try this: ${left} ${operator} ${right}`;
        case 'how_much':
            return `How much is ${left} ${operator} ${right}?`;
        case 'answer':
            return `Answer: ${left} ${operator} ${right}`;
        case 'blank_equals':
            return `${left} ${operator} ${right} =`;
        case 'quick_check':
            return `Quick check: ${left} ${operator} ${right}`;
        // Worded prompts: every shape here must have a matching pattern in
        // math-kernel/math/wordedArithmetic.ts so steps, traits, replay keys, and the
        // verifier can re-derive the underlying fact from the text.
        case 'story_find':
            return `You have ${left} ${plural(left, 'berry', 'berries')}. You find ${right} more. How many berries?`;
        case 'story_land':
            return `${left} ${plural(left, 'bird sits', 'birds sit')} on a branch. ${right} more land. How many birds?`;
        case 'story_eat':
            return `You have ${left} ${plural(left, 'berry', 'berries')}. You eat ${right}. How many are left?`;
        case 'story_fly':
            return `${left} ${plural(left, 'bird sits', 'birds sit')} on a branch. ${right} fly away. How many are left?`;
        // Multiplicative stories (CGI equal-groups and partitive sharing). Both
        // quantities are kept >= 2 by the candidate filter, and the nouns were
        // chosen so their Icelandic forms survive the 21/31 singular-agreement
        // rule (ber, egg, hreiður are identical singular/plural) — so the plain
        // plural here is correct in both languages for every authored value.
        case 'story_nests':
            return `There are ${left} nests. Each nest has ${right} eggs. How many eggs in all?`;
        case 'story_share':
            return `${left} berries are shared by ${right} birds. How many berries does each bird get?`;
        // CGI compare. The two shapes read the SAME two numbers and run opposite
        // ways: "a bird has 3 more" adds, "a bird has 3 berries" subtracts.
        // Telling them apart is the skill, which is why both ship.
        case 'story_more_than':
            return `You have ${left} berries. A bird has ${right} more. How many does the bird have?`;
        case 'story_difference':
            return `You have ${left} berries. A bird has ${right} berries. How many more do you have?`;
        // CGI part-part-whole: no event, just two parts and a whole. The hardest
        // additive situation for a child who has learnt "story means something
        // happens".
        case 'story_two_colours':
            return `There are ${left} red berries and ${right} blue berries. How many berries in all?`;
        case 'story_the_rest':
            return `There are ${left} berries. ${right} are red. How many are blue?`;
        // The array: the same product said the other way round, and the picture
        // behind the commutative law.
        case 'story_rows':
            return `There are ${left} rows of ${right} eggs. How many eggs in all?`;
        // Quotative (measurement) division: how many GROUPS, where sharing asks
        // how many EACH.
        case 'story_each_nest':
            return `You have ${left} berries. You put ${right} in each nest. How many nests?`;
        default:
            return `${left} ${operator} ${right} = ?`;
    }
}

/**
 * The counting markers, and what the object each one draws is called.
 *
 * A marker is an internal SHAPE SELECTOR, never typography. The board replaces
 * the run it labels with drawn objects (godot/scripts/ui/components/count_row.gd),
 * so no child ever reads a ";" -- which is why the alphabet can afford one.
 *
 * These pairs must mirror SHAPE_BY_MARKER in count_row.gd. A prompt that says
 * "How many hearts?" over a row of drawn discs is worse than one that says
 * nothing at all, and godot/tests/test_count_row.gd is what holds the two files
 * to each other.
 *
 * Twelve, because the low band is where the variety is needed and there is not
 * much else to vary down there: counting one to four is four questions, and
 * without shape variety it is four questions that always look the same.
 */
const COUNTING_MARKERS: ReadonlyArray<{ marker: string; noun: string }> = [
    { marker: 'o', noun: 'dots' },
    { marker: '@', noun: 'rings' },
    { marker: '#', noun: 'squares' },
    { marker: '%', noun: 'diamonds' },
    { marker: '&', noun: 'leaves' },
    { marker: '*', noun: 'flowers' },
    { marker: '^', noun: 'stars' },
    { marker: '<', noun: 'triangles' },
    { marker: '~', noun: 'hexagons' },
    { marker: ';', noun: 'hearts' },
    { marker: '(', noun: 'eggs' },
    { marker: ')', noun: 'moons' },
];

export const COUNTING_MARKER_ALPHABET: readonly string[] = COUNTING_MARKERS.map(entry => entry.marker);

const COUNTING_NOUN_BY_MARKER = new Map(COUNTING_MARKERS.map(entry => [entry.marker, entry.noun]));

function formatCountingPrompt(variant: string, symbol: string, count: number): string {
    const items = Array.from({ length: count }, () => symbol).join(' ');
    // "marks" is the honest word for a marker with no shape of its own; every
    // marker in the alphabet has one, so this is the fallback, not the norm.
    const noun = COUNTING_NOUN_BY_MARKER.get(symbol) ?? 'marks';
    switch (variant) {
        case 'how_many':
            return `How many are here: ${items}`;
        case 'count_them':
            return `Count these: ${items}`;
        case 'see':
            return `How many do you see: ${items}`;
        case 'altogether':
            return `How many altogether: ${items}`;
        case 'say_number':
            return `Say the number: ${items}`;
        case 'point_count':
            return `Point and count: ${items}`;
        case 'how_many_of':
            return `How many ${noun}? ${items}`;
        default:
            return `Count the ${noun}: ${items}`;
    }
}

function formatComparisonPrompt(variant: string, relation: 'greater' | 'smaller', left: number, right: number): string {
    const adjective = relation === 'greater' ? 'greater' : 'smaller';
    // "bigger" and "smaller" are the words a six-year-old actually uses, and the
    // phrasing catalog has carried them -- translated -- since the hand-authored
    // seed pool, which is the only place they were ever rendered. The generator
    // knew three shapes of one question; comparison is the domain with the least
    // to vary and it was varying least.
    const plainAdjective = relation === 'greater' ? 'bigger' : 'smaller';
    switch (variant) {
        case 'pick':
            return `Pick the ${adjective} number: ${left} or ${right}`;
        case 'which':
            return `Which number is ${adjective}: ${left} or ${right}?`;
        case 'which_plain':
            return `Which number is ${plainAdjective}: ${left} or ${right}?`;
        case 'is':
            return `Which is ${plainAdjective}: ${left} or ${right}?`;
        default:
            return `Find the ${adjective} number: ${left} or ${right}`;
    }
}

function formatSequencePrompt(variant: string, sequence: number[]): string {
    const prefix = sequence.join(', ');
    switch (variant) {
        case 'keep_going':
            return `Keep the pattern going: ${prefix}, ?`;
        case 'number_pattern':
            return `What comes next in the number pattern: ${prefix}, ?`;
        // These two NAME the strategy rather than describing the shape, and
        // Sproti 1 names them the same way: talning áfram and talning aftur á
        // bak are two skills, not one skill run in two directions. The generator
        // only offers each to a run that actually goes that way -- a framing that
        // lied about the direction would be worse than the third wording the low
        // rungs were stuck with.
        case 'count_on':
            return `Count on: ${prefix}, ?`;
        case 'count_back':
            return `Count back: ${prefix}, ?`;
        default:
            return `What number comes next? ${prefix}, ?`;
    }
}

function formatPatternPrompt(variant: string, sequence: number[]): string {
    const prefix = sequence.join(', ');
    switch (variant) {
        case 'repeat':
            return `What comes next in the repeat pattern: ${prefix}, ?`;
        case 'keep_going':
            return `Keep the repeat going: ${prefix}, ?`;
        default:
            return `What comes next? ${prefix}, ?`;
    }
}

function applyPromptLeadIn(text: string, leadIn?: string): string {
    return leadIn ? `${leadIn} ${text}` : text;
}

function withFallbackVariants(kind: AuthoringTemplateKind, promptVariants: string[], strict = false): string[] {
    if (strict && promptVariants.length > 0) {
        return Array.from(new Set(promptVariants));
    }
    const fallbackByKind: Record<AuthoringTemplateKind, string[]> = {
        addition: [
            'equation', 'question', 'solve', 'equals', 'complete', 'mental_math',
            'how_much', 'answer', 'blank_equals', 'quick_check',
            'story_find', 'story_land', 'story_more_than', 'story_two_colours',
        ],
        subtraction: [
            'equation', 'question', 'solve', 'equals', 'complete', 'mental_math',
            'how_much', 'answer', 'blank_equals', 'quick_check',
            'story_eat', 'story_fly', 'story_difference', 'story_the_rest',
        ],
        multiplication: ['equation', 'question', 'solve', 'equals', 'complete', 'how_much', 'answer', 'blank_equals', 'story_rows'],
        division: ['equation', 'question', 'solve', 'equals', 'complete', 'how_much', 'answer', 'blank_equals', 'story_each_nest'],
        counting: [
            'count', 'how_many', 'count_them', 'how_many_of',
            'see', 'altogether', 'say_number', 'point_count',
        ],
        comparison: ['which', 'pick', 'find', 'which_plain', 'is'],
        pattern_matching: ['repeat', 'keep_going'],
        number_sequence: ['next', 'keep_going', 'number_pattern', 'count_on', 'count_back'],
    };

    return Array.from(new Set([...(promptVariants.length > 0 ? promptVariants : []), ...fallbackByKind[kind]]));
}

function buildOptions(correct: number, preferred: number[]): number[] {
    const options = new Set<number>([correct]);
    for (const candidate of preferred) {
        if (candidate >= 0) {
            options.add(candidate);
        }
        if (options.size >= 4) {
            break;
        }
    }

    // TOP-OF-LOOP, not bottom. Tested at the bottom this loop always ran once,
    // so a template whose misconception-driven distractors had already filled the
    // four slots got a fifth mechanical option (correct - 3) added anyway -- and
    // the `.slice(0, 4)` below then kept the four SMALLEST, silently throwing the
    // authored top distractor away. "Count fourteen" was authored {13, 14, 15, 16}
    // and shipped {11, 13, 14, 15}. The offsets are a fallback for when the
    // preferred list cannot fill four, which is what this now is.
    const fallbackOffsets = [-3, -2, -1, 1, 2, 3, 4, 5, 6];
    for (const offset of fallbackOffsets) {
        if (options.size >= 4) {
            break;
        }
        const next = correct + offset;
        if (next >= 0) {
            options.add(next);
        }
    }

    const finalOptions = Array.from(options)
        .sort((left, right) => left - right)
        .slice(0, 4);

    // Deterministic per-problem shuffle: the old ascending order put the
    // correct answer in a predictable slot (62% last position across the
    // pool), which kids learn to exploit on any surface that renders data
    // order. Seeded by the option values so regeneration stays stable.
    const rng = createSeededRandom(stableHash(`options|${correct}|${finalOptions.join(',')}`));
    for (let i = finalOptions.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [finalOptions[i], finalOptions[j]] = [finalOptions[j], finalOptions[i]];
    }

    return finalOptions;
}

function buildArithmeticOptions(kind: AuthoringTemplateKind, left: number, right: number, correct: number): number[] {
    const preferred: number[] = [];

    // Counting has its OWN misconceptions and they are all near misses: skipping
    // one (n-1), counting one twice (n+1), losing or double-counting a pair in a
    // long row (n±2). It used to fall through to the generic branch below, whose
    // third distractor is `right` -- and `right` for a counting candidate is the
    // constant 1, so "count fourteen" was offered {14, 13, 11, 1}. A child who
    // has counted anything at all can eliminate 1 without counting, which makes
    // it a free option rather than a distractor (docs/MATH_AUTHORING_STANDARDS.md
    // §4: every distractor plausible in magnitude).
    if (kind === 'counting') {
        preferred.push(correct - 1, correct + 1, correct + 2, correct - 2);
        return buildOptions(correct, preferred);
    }

    if (kind === 'addition') {
        preferred.push(correct - 1, correct + 1, Math.max(left, right), correct + 2);
    } else if (kind === 'subtraction') {
        preferred.push(correct - 1, correct + 1, right, left - 1);
    } else if (kind === 'multiplication') {
        preferred.push(correct - right, correct + right, left + right, correct + 1);
    } else if (kind === 'number_sequence' || kind === 'pattern_matching') {
        // The two ways a child gets a sequence wrong: stopping one term short
        // (repeating the last visible number) and running one term too far.
        // `right` here is the step, so both are expressed in it -- which also
        // means a count-back run gets count-back distractors rather than the
        // generic +1/-1 pair.
        preferred.push(correct - right, correct + right, correct - 1, correct + 1);
    } else {
        preferred.push(correct - 1, correct + 1, right, left);
    }

    return buildOptions(correct, preferred);
}

function renderHint(strategy: string, values: Record<string, number>): string {
    const left = values.left ?? values.start ?? values.a ?? 0;
    const right = values.right ?? values.step ?? values.b ?? 0;

    switch (strategy) {
        case 'count_on':
            return `Start at ${left}, then count ${right} more.`;
        case 'make_ten':
            return `Try making 10 first, then add what is left.`;
        case 'add_tens':
            return `Add the tens first, then add the ones.`;
        case 'count_back':
            return `Start at ${left}, then count back ${right}.`;
        case 'bridge_ten':
            return `Hop back to the nearest 10 first, then finish counting back.`;
        case 'add_place_value':
            return `Add the hundreds, then the tens, then the ones.`;
        case 'subtract_place_value':
            return `Take away the hundreds, then the tens, then the ones.`;
        case 'multiply_groups':
            return `Think of ${left} ${plural(left, 'group', 'groups')} of ${right}.`;
        case 'split_tens':
            return `Multiply the tens, multiply the ones, then add the two parts.`;
        case 'divide_groups':
            return `Share ${left} into groups of ${right}.`;
        case 'count_symbols':
            return `Touch each one once as you count.`;
        // The counting principles, one hint each, so a counting question is not
        // always answered with the same sentence. One-to-one correspondence, the
        // subitising look, and the two structural landmarks the ten-frame draws:
        // the gap after five and the wrap after ten.
        case 'count_whole_group':
            return `Look at the whole group and say how many.`;
        case 'count_one_each':
            return `Say one number for each one you touch.`;
        case 'count_from_five':
            return `There is a gap after five. Start at five and count on.`;
        case 'count_from_ten':
            return `A full row is ten. Start at ten and count on.`;
        case 'compare_numbers':
            return `Look at which number has more value.`;
        case 'sequence_step':
            return `Look at how the numbers are changing each time.`;
        // Counting back is its own skill, not addition with a minus sign, and
        // `count_back` above would render "count back -1" for a sequence whose
        // step is negative.
        case 'sequence_back':
            return `Count backwards!`;
        case 'sequence_back_from':
            return `Count back from ${left}!`;
        case 'pattern_repeat':
            return `See which numbers are repeating in order.`;
        default:
            return `Check each part carefully, then choose the best answer.`;
    }
}

function renderExplanation(strategy: string, values: Record<string, number>): string {
    const left = values.left ?? values.start ?? values.a ?? 0;
    const right = values.right ?? values.step ?? values.b ?? 0;
    const correct = values.correct ?? values.answer ?? 0;

    switch (strategy) {
        case 'sum_result':
            return `${left} plus ${right} makes ${correct}.`;
        case 'sum_make_ten':
            return `Make 10 first, then add the rest. The answer is ${correct}.`;
        case 'sum_tens':
            return `Add the tens and ones together. The answer is ${correct}.`;
        case 'difference_result':
            return `${left} take away ${right} leaves ${correct}.`;
        case 'difference_bridge_ten':
            return `Step back to 10 first, then finish. The answer is ${correct}.`;
        case 'sum_place_value':
            return `Add each place, hundreds to ones. The answer is ${correct}.`;
        case 'difference_place_value':
            return `Take away place by place. The answer is ${correct}.`;
        case 'product_result':
            return `${left} ${plural(left, 'group', 'groups')} of ${right} makes ${correct}.`;
        case 'product_split':
            return `Multiply the tens by ${right}, then the ones, and add the parts. The answer is ${correct}.`;
        case 'quotient_share':
            return `${left} shared into ${right} equal ${plural(right, 'group', 'groups')} gives ${correct} each.`;
        case 'quotient_result':
            return `${left} split into groups of ${right} makes ${correct} ${plural(correct, 'group', 'groups')}.`;
        case 'count_result':
            return `There ${plural(correct, 'is', 'are')} ${correct} altogether.`;
        // The cardinality principle, said out loud: the last number you say IS
        // the answer. Children who can recite the sequence and still cannot
        // answer "how many" are missing exactly this.
        case 'count_last_number':
            return `The last number you say is ${correct}.`;
        case 'count_five_and':
            return `Five and ${correct - 5} more makes ${correct}.`;
        case 'count_ten_and':
            return `Ten and ${correct - 10} more makes ${correct}.`;
        case 'comparison_result':
            return `${correct} is the correct choice.`;
        case 'sequence_result':
            return `The pattern keeps going to ${correct}.`;
        case 'pattern_result':
            return `The repeating pattern comes back to ${correct}.`;
        default:
            return `The correct answer is ${correct}.`;
    }
}

function determineAgeBand(template: BatchTemplateSpec, band: MathBand): [number, number] {
    return template.ageBand ?? band.ageBand;
}

function buildGeneratorMetadata(batch: MathBatchSpec, template: BatchTemplateSpec, band: MathBand, values: Record<string, number>) {
    return {
        template: `offline_${template.kind}`,
        params: {
            batchId: batch.id,
            templateId: template.id,
            family: template.family,
            bandId: band.id,
            ...values,
        },
        evaluator: 'tools/math_authoring.ts',
    };
}

function buildProblemId(batch: MathBatchSpec, template: BatchTemplateSpec, values: Record<string, number>, promptText: string): string {
    const raw = `${batch.id}|${template.id}|${promptText}|${JSON.stringify(values)}`;
    return `auth_${batch.id}_${template.id}_${stableHash(raw).toString(36)}`;
}

function enumerateRange([min, max]: NumericRange): number[] {
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function evaluateArithmetic(kind: ArithmeticTemplateSpec['kind'], left: number, right: number): number | null {
    if (kind === 'addition') return left + right;
    if (kind === 'subtraction') return left - right;
    if (kind === 'multiplication') return left * right;
    if (right === 0 || left % right !== 0) return null;
    return left / right;
}

function requiresCarry(left: number, right: number): boolean {
    return left > 0 && right > 0 && ((left % 10) + (right % 10)) >= 10;
}

function requiresBorrow(left: number, right: number): boolean {
    return left >= 10 && (left % 10) < (right % 10);
}

function normalizedProgress(value: number, range: NumericRange): number {
    if (range[0] === range[1]) return 0.5;
    return (value - range[0]) / (range[1] - range[0]);
}

/**
 * How far a child can be asked to COUNT UP TO A NUMBER THEY CANNOT SEE.
 *
 * Ten, because a full row of the ten-frame is ten and this pack's own counting
 * hints already say so ("A full row is ten. Start at ten and count on"). It is
 * also, for these shapes, exactly the answer: the gap between the known part and
 * the whole IS the missing part, so the rule reads "name counting only when the
 * answer is small".
 *
 * SCOPE, deliberately narrow, and the narrowness is a known debt rather than a
 * principle. This governs the relational and compare hints, where the span is
 * unbounded -- the pools reach four-digit number bonds and produced "Start at
 * 345 and count up to 3504", which is not a strategy in any language.
 *
 * It does NOT govern `count_on` and `count_back`, and as of 2026-08 those two
 * render 241 hints with a span above ten, worst case "Start at 20, then count
 * back 20". That is tedious rather than impossible -- twenty steps is a thing a
 * seven-year-old can actually do, where counting to 3504 is not -- so they are
 * left alone rather than half-fixed. Applying the same line to them needs a
 * strategy to fall back TO, and the phrasing catalog has none: there is no
 * translated "add the tens, then the ones" that does not also state the answer.
 * Closing it is a phrasing-catalog change with new Icelandic in it, which is the
 * owner's call, not a generator change.
 */
function countableGap(gap: number): boolean {
    return gap <= 10;
}

/**
 * One relational prompt, with the hint and explanation its shape earns.
 *
 * `left`/`right` are the plain fact's operands and `result` is what the plain
 * fact evaluates to, so for addition the written total is `result` and for
 * subtraction it is the difference. Which of the three numbers is the ANSWER
 * depends on the shape, which is the whole point of the form.
 *
 * The wording is not free text: every sentence below has to render exactly from
 * a template in tools/math_phrasing_catalog.mjs, or the problem ships in English
 * to an Icelandic child. The math.hint.rel.* / math.expl.rel.* family was
 * already there, translated, for the hand-authored relational problems in the
 * gaps pool -- this reuses it rather than inventing new strings.
 */
function buildRelationalCandidate(
    shape: 'missing_right' | 'missing_left' | 'total_first',
    kind: 'addition' | 'subtraction',
    left: number,
    right: number,
    result: number,
): { promptText: string; correct: number; hint: string; explanation: string; optionPreference: number[] } | null {
    const operator = kind === 'addition' ? '+' : '-';
    // For addition the number the child reads on the far side is the total; for
    // subtraction it is what is left. `whole` is the bigger of the two either
    // way, which is what the additive hints want to name.
    const written = result;

    if (kind === 'addition') {
        const explanation = (known: number, unknown: number) => `${known} and ${unknown} makes ${written}.`;
        // The distractor that matters: answering the TOTAL. A child who reads
        // "=" as "work it out" answers 5 to "2 + ? = 5", and that is a
        // diagnosis, not noise. Then the off-by-ones, then the known part.
        const options = (unknown: number, known: number) => [written, unknown - 1, unknown + 1, known];

        if (shape === 'missing_right') {
            return {
                promptText: `${left} ${operator} ? = ${written}`,
                correct: right,
                hint: `You have ${left}. How many more to make ${written}?`,
                explanation: explanation(left, right),
                optionPreference: options(right, left),
            };
        }
        if (shape === 'missing_left') {
            return {
                promptText: `? ${operator} ${right} = ${written}`,
                correct: left,
                // "Start at 345 and count up to 3504" is not a strategy, it is an
                // instruction nobody can follow, and §4 asks a hint to teach one.
                // Above a countable gap the sentence states the RELATION and
                // stops: the child still has to find the missing part, and is no
                // longer told to find it a way that cannot be done. Same rule the
                // sequence framings got -- a hint that names counting has to mean
                // counting.
                hint: countableGap(written - right)
                    ? `Something and ${right} makes ${written}. Start at ${right} and count up to ${written}.`
                    : `You have ${right}. How many more to make ${written}?`,
                explanation: explanation(right, left),
                optionPreference: options(left, right),
            };
        }
        return {
            promptText: `${written} = ${left} ${operator} ?`,
            correct: right,
            hint: `${written} is the whole, and ${left} is one part. What is the other part?`,
            explanation: explanation(left, right),
            optionPreference: options(right, left),
        };
    }

    const explanation = `${left} take away ${right} leaves ${written}.`;
    // These two sentences inflect a VERB, on the number that is LEFT rather than
    // the one the problem starts from. "15 - ? = 1" shipped as "Now there are 1."
    // in English and "Nu eru 1." in Icelandic -- wrong in both, and invisible to
    // every gate, because nothing in the toolchain rendered the text and read it.
    if (shape === 'missing_right') {
        return {
            promptText: `${left} ${operator} ? = ${written}`,
            correct: right,
            hint: `You had ${left}. Now there ${plural(written, 'is', 'are')} ${written}. How many went?`,
            explanation,
            optionPreference: [written, right - 1, right + 1, left],
        };
    }
    if (shape === 'missing_left') {
        return {
            promptText: `? ${operator} ${right} = ${written}`,
            correct: left,
            hint: `Something lost ${right} and ${written} ${plural(written, 'was', 'were')} left. How many were there to start?`,
            explanation,
            optionPreference: [written, left - 1, left + 1, right],
        };
    }
    return {
        promptText: `${written} = ${left} ${operator} ?`,
        correct: right,
        hint: `${written} is what is left when you take some away from ${left}. How many were taken?`,
        explanation,
        optionPreference: [written, right - 1, right + 1, left],
    };
}

/**
 * One multiplicative relational prompt, with the hint and explanation its shape
 * earns.
 *
 * `left`/`right`/`result` are the plain fact: for multiplication the two factors
 * and their product, for division the dividend, the divisor and the quotient.
 * Which of the three is the ANSWER depends on the shape.
 *
 * As with the additive builder, none of this wording is free text. Every
 * sentence renders exactly from a template in tools/math_phrasing_catalog.mjs --
 * the math.hint.rel.each_group_size / how_many_groups / shared_into /
 * how_many_shared family, plus math.expl.rel.grouped and math.expl.share_each --
 * all of which were already there, translated, for the hand-authored relational
 * problems in the gaps pool.
 *
 * Every sentence here is written in the PLURAL, because the catalog entries it
 * has to round-trip through are: math.expl.share_each and
 * math.hint.rel.each_group_size / how_many_shared have no singular variant. The
 * caller therefore keeps both the group count and the divisor at 2 or more --
 * which costs nothing, since "3 x ? = 3" and "6 / ? = 6" are not questions
 * about grouping anyway.
 */
function buildMultiplicativeRelationalCandidate(
    shape: 'missing_right' | 'missing_left' | 'total_first',
    kind: 'multiplication' | 'division',
    left: number,
    right: number,
    result: number,
): { promptText: string; correct: number; hint: string; explanation: string; optionPreference: number[] } | null {
    if (kind === 'multiplication') {
        // groups x each = product. The explanation names the same two numbers
        // whichever slot was blanked, because it states the fact, not the search.
        const explanation = `${left} groups of ${right} makes ${result} in all.`;
        // Leading distractor: the product already written on the far side. A
        // child who reads "=" as "work it out" reaches for the number that is
        // there, and answering it is a diagnosis rather than noise. Then the
        // adjacent facts either side, then the factor they can see.
        const options = (unknown: number, known: number) => [result, unknown - 1, unknown + 1, known];

        if (shape === 'missing_right') {
            return {
                promptText: `${left} \u00D7 ? = ${result}`,
                correct: right,
                hint: `${left} groups make ${result} altogether. How many in each group?`,
                explanation,
                optionPreference: options(right, left),
            };
        }
        if (shape === 'missing_left') {
            return {
                promptText: `? \u00D7 ${right} = ${result}`,
                correct: left,
                hint: `Groups of ${right} make ${result} altogether. How many groups?`,
                explanation,
                optionPreference: options(left, right),
            };
        }
        return {
            promptText: `${result} = ${left} \u00D7 ?`,
            correct: right,
            hint: `${left} groups make ${result} altogether. How many in each group?`,
            explanation,
            optionPreference: options(right, left),
        };
    }

    // dividend / divisor = quotient.
    const explanation = `${left} shared into ${right} equal groups gives ${result} each.`;
    // The two unknowns sit at opposite ends of the magnitude range -- a missing
    // divisor is small, a missing dividend is the biggest number in the problem
    // -- so they cannot share one distractor list without one of them offering
    // a free elimination (docs/MATH_AUTHORING_STANDARDS.md section 4: every
    // distractor plausible in magnitude).
    const divisorOptions = [result, right - 1, right + 1, left - result];
    const dividendOptions = [right + result, left + right, left - right, result];

    if (shape === 'missing_right') {
        return {
            promptText: `${left} \u00F7 ? = ${result}`,
            correct: right,
            hint: `${left} shared out gives ${result} in each group. How many groups?`,
            explanation,
            optionPreference: divisorOptions,
        };
    }
    if (shape === 'missing_left') {
        return {
            promptText: `? \u00F7 ${right} = ${result}`,
            correct: left,
            // "Add the two numbers" is the error this form actually produces,
            // and one group too many or too few are the other two.
            hint: `Shared into ${right} groups it gives ${result} each. How many were there to start?`,
            explanation,
            optionPreference: dividendOptions,
        };
    }
    return {
        promptText: `${result} = ${left} \u00F7 ?`,
        correct: right,
        hint: `${left} shared out gives ${result} in each group. How many groups?`,
        explanation,
        optionPreference: divisorOptions,
    };
}

/**
 * "8 + 7 = ? + 6" -- an operation on BOTH sides of the equals sign.
 *
 * The Falkner/Levi/Carpenter form, and the one place a child's reading of "="
 * is actually measured: answering 15 means "=" was read as "now work it out",
 * and answering 7 means the right-hand side was copied from the left. Both are
 * in the option list on purpose, so the answer diagnoses the reading.
 *
 * `other` is the addend written on the right. A prompt where it equals `right`
 * is dropped: "8 + 7 = ? + 7" can be answered by matching shapes without ever
 * meeting the idea.
 */
function buildBothSidesCandidate(
    left: number,
    right: number,
    other: number,
): { promptText: string; correct: number; hint: string; explanation: string; optionPreference: number[] } | null {
    const total = left + right;
    const unknown = total - other;
    if (other < 1 || other === right || unknown < 1 || unknown === right) return null;

    return {
        promptText: `${left} + ${right} = ? + ${other}`,
        correct: unknown,
        hint: `This side makes ${total}. The other side has ${other}, so it needs enough to reach ${total} too.`,
        explanation: `${other} and ${unknown} makes ${total}.`,
        // The total first (the "work it out" reading), then the left-hand
        // addend a copier reaches for, then the near misses.
        optionPreference: [total, right, unknown - 1, unknown + 1],
    };
}

/**
 * Per-shape constraints a story needs beyond "both quantities >= 2".
 *
 * Two kinds of reason, and both are about the sentence rather than the sum.
 *
 * A CAP, where the Icelandic wording puts a numeral next to a word that
 * inflects with it. "Það eru 21 rauð ber" wants "Það er 21 rautt ber", because
 * Icelandic counts 21, 31 and 101 as singular, and one phrasing key can carry
 * only one plural parameter while these sentences have two sensitive numbers.
 * The existing equal-groups story avoids the same trap by keeping its factors
 * under ten; these keep their whole under twenty-one, which is also where
 * part-part-whole belongs on the ladder (CGI puts it in the first two years).
 * `npm run validate:agreement` is what would catch a slip.
 *
 * And a SENSE constraint: "You have 5 berries. A bird has 5 berries. How many
 * more do you have?" has the answer none, which is a riddle rather than a
 * comparison.
 */
function storyFits(variant: string, left: number, right: number, correct: number): boolean {
    if (!variant.startsWith('story_')) return true;

    // §4, structurally rather than per template: "Story framing stops at
    // two-digit facts; a child sharing 847 berries is not a story, it is noise."
    // A template that lists framings without `strictVariants` gets the whole
    // fallback set unioned in, so the rule cannot live in the templates -- four
    // batches proved that by shipping 56 three-digit stories, and one shared 150
    // berries between five birds.
    if (Math.max(left, right) > 99) return false;

    switch (variant) {
        case 'story_two_colours':
            return left + right <= 20;
        case 'story_the_rest':
            return left <= 20 && right <= 20 && correct >= 2;
        case 'story_difference':
            return left > right;
        // An array or a set of equal groups is a PICTURE, and the numbers have
        // to be ones a child can hold in their head as one. "8 nests, each with
        // 90 eggs" and "48 rows of 4 eggs" both parse, both multiply, and
        // neither is a nest or a row. The equal-groups story was already inside
        // these bounds by the shape of the templates feeding it; the array was
        // not, and nothing said so.
        case 'story_nests':
        case 'story_rows':
            return left <= 12 && right <= 12;
        default:
            return true;
    }
}

/**
 * The teaching a STORY earns, where its template's strategy fields would teach
 * the wrong thing.
 *
 * A template names one hint strategy and one explanation strategy for every
 * candidate it renders, which is right while every candidate is the same
 * situation. It stopped being right when compare and part-part-whole arrived:
 * both come off subtraction templates, so both inherited count-back and
 * take-away, and
 *
 *     You have 10 berries. A bird has 5 berries. How many more do you have?
 *     hint: Start at 10, then count back 5.
 *     expl: 10 take away 5 leaves 5.
 *
 * shipped. Nothing is taken away in that story. The bird's berries are not
 * removed from yours; the two sets are matched against each other, and the
 * strategy is to count up from the smaller to the larger. Teaching take-away
 * over a compare situation is the exact thing shipping four CGI situations was
 * meant to stop, undone one field below the prompt.
 *
 * Every sentence here renders from a template that is already in the phrasing
 * catalog and already translated -- the math.hint.rel.* / math.expl.rel.* family
 * the relational shapes use -- because counting up to a whole is the same
 * strategy whether the unknown is written as a blank or told as a story.
 *
 * The distractors matter as much. §4 requires "added-instead-of-subtracted",
 * and the compare pair is where that misconception actually lives: the two
 * shapes read the SAME two numbers and run opposite ways, so each one's
 * distractor list leads with the other one's answer.
 */
function storyScaffold(
    variant: string,
    left: number,
    right: number,
    correct: number,
): Pick<RawCandidate, 'hint' | 'explanation' | 'optionPreference' | 'misconceptionTags'> | null {
    switch (variant) {
        // Compare, difference unknown. left is yours, right is the bird's,
        // correct is the gap. Count up from the smaller to the larger.
        case 'story_difference':
            return {
                hint: countableGap(left - right)
                    ? `Something and ${right} makes ${left}. Start at ${right} and count up to ${left}.`
                    : `${left} is the whole, and ${right} is one part. What is the other part?`,
                explanation: `${right} and ${correct} makes ${left}.`,
                optionPreference: [left + right, correct - 1, correct + 1, right],
                misconceptionTags: ['added_instead', 'off_by_one'],
            };
        // Compare, quantity unknown: the same two numbers, added. Its own
        // leading distractor is the difference -- the other half of the pair --
        // except when the two quantities are equal, where the difference is zero
        // and a child eliminates it without doing any arithmetic (§4: every
        // distractor plausible in magnitude).
        case 'story_more_than':
            // The subtracted-instead answer is the DIFFERENCE, whichever way
            // round the two numbers came: a child who subtracts takes the
            // smaller from the larger regardless of which the story named first.
            // Writing it as `left - right` left 12 problems declaring a
            // misconception their options could not express -- the same defect,
            // one field down, that the tag-replacement rule above fixed.
            return {
                optionPreference: Math.abs(left - right) >= 1
                    ? [Math.abs(left - right), correct - 1, correct + 1, left]
                    : [correct - 1, correct + 1, left, correct + 2],
                misconceptionTags: Math.abs(left - right) >= 1
                    ? ['subtracted_instead', 'off_by_one']
                    : ['off_by_one'],
            };
        // Part-part-whole, part unknown. left is the whole, right the known
        // part. Nothing happened to anything; there are two parts and a whole.
        case 'story_the_rest':
            return {
                hint: `${left} is the whole, and ${right} is one part. What is the other part?`,
                explanation: `${right} and ${correct} makes ${left}.`,
                // The whole and the known part are both written down, so the
                // child who adds them instead of taking one from the other lands
                // on left + right -- and that value has to BE in the list for the
                // declared tag to mean anything.
                optionPreference: [left + right, right, correct - 1, correct + 1],
                misconceptionTags: ['added_instead', 'off_by_one'],
            };
        default:
            return null;
    }
}

function renderArithmeticCandidates(template: ArithmeticTemplateSpec): RawCandidate[] {
    const operator = toOperator(template.kind);
    const candidates: RawCandidate[] = [];
    const leftValues = template.leftValues ?? enumerateRange(template.leftRange);
    const rightValues = template.rightValues ?? enumerateRange(template.rightRange);
    const leftBounds: NumericRange = template.leftRange ?? [Math.min(...leftValues), Math.max(...leftValues)];
    const rightBounds: NumericRange = template.rightRange ?? [Math.min(...rightValues), Math.max(...rightValues)];
    const promptVariants = withFallbackVariants(template.kind, template.promptVariants, template.strictVariants);

    for (const left of leftValues) {
        for (const right of rightValues) {
            if (template.maxOperand !== undefined && Math.max(left, right) > template.maxOperand) continue;
            if (template.minOperand !== undefined && Math.min(left, right) < template.minOperand) continue;
            if (template.allowZero === false && (left === 0 || right === 0)) continue;
            if (template.distinctOperands && left === right) continue;
            if (template.orderedOperands === false && left > right) continue;
            if (template.operandDeltaRange) {
                const delta = Math.abs(left - right);
                if (delta < template.operandDeltaRange[0] || delta > template.operandDeltaRange[1]) continue;
            }
            if (template.kind === 'division' && template.forceDivisible !== false && (right === 0 || left % right !== 0)) continue;

            const correct = evaluateArithmetic(template.kind, left, right);
            if (correct === null || correct < 0) continue;
            if (template.resultRange && (correct < template.resultRange[0] || correct > template.resultRange[1])) continue;
            if (template.sumRange && (left + right < template.sumRange[0] || left + right > template.sumRange[1])) continue;
            if (template.requireCarry !== undefined && requiresCarry(left, right) !== template.requireCarry) continue;
            if (template.requireBorrow !== undefined && requiresBorrow(left, right) !== template.requireBorrow) continue;

            const complexityOperand = Math.max(
                normalizedProgress(left, leftBounds),
                normalizedProgress(right, rightBounds),
            );
            const complexityResult = template.resultRange
                ? normalizedProgress(correct, template.resultRange)
                : normalizedProgress(correct, [0, Math.max(correct, 1)]);
            const complexity = clamp((complexityOperand * 0.7) + (complexityResult * 0.3), 0, 1);

            // Steps 0-2 belong to brand-new readers, so nothing down there gets a
            // STORY: a narrative is a second thing to decode on top of the fact.
            //
            // It used to be narrower than that -- `equation` and `question` only
            // -- and the cost was measurable. Addition step 0 is the four facts
            // inside 0+0..1+1 and nothing else can ever join them, so two
            // framings over four facts is the entire first-ever experience of the
            // game: a child met "1 + 1 = ?" and "What is 1 + 1?" and then met
            // them again. The framings below are all short and wordless or nearly
            // so ("Solve:", "Answer:", "Quick check:"), which is what the rule was
            // protecting; they carry no extra math to read.
            const maxOperandValue = Math.max(left, right);
            const storyFree = template.kind === 'addition'
                ? maxOperandValue <= 3
                : template.kind === 'subtraction' && maxOperandValue <= 7;
            const EARLY_FRAMINGS = new Set([
                'equation', 'question', 'blank_equals', 'complete', 'equals',
                'solve', 'answer', 'how_much', 'quick_check', 'mental_math',
            ]);

            // A relational template emits ONLY relational prompts. Mixing the
            // two in one template makes its `count` unaccountable -- the hash
            // lottery would decide how many number bonds a batch actually got.
            if (template.relationalShapes && template.relationalShapes.length > 0) {
                const additive = template.kind === 'addition' || template.kind === 'subtraction';
                for (const shape of template.relationalShapes) {
                    if (shape === 'both_sides') {
                        // Addition only. The multiplicative two-sided form asks a
                        // child to hold two products at once, which is a
                        // working-memory problem rather than a relational one --
                        // the same reason math_verifier.ts does not parse it.
                        if (template.kind !== 'addition') {
                            throw new Error(
                                `Template ${template.id}: both_sides is an addition shape; `
                                + `${template.kind} has no two-sided form in this age band `
                                + '(see RELATIONAL_PATTERNS in tools/math_verifier.ts).',
                            );
                        }
                        for (const offset of template.bothSidesOffsets ?? [-2, -1, 1, 2]) {
                            const twoSided = buildBothSidesCandidate(left, right, right + offset);
                            if (!twoSided) continue;
                            candidates.push({
                                values: { left, right, correct: twoSided.correct },
                                promptText: applyPromptLeadIn(twoSided.promptText, template.promptLeadIn),
                                correct: twoSided.correct,
                                complexity,
                                ageBand: template.ageBand ?? [5, 7],
                                domain: template.kind,
                                hint: twoSided.hint,
                                explanation: twoSided.explanation,
                                optionPreference: twoSided.optionPreference,
                            });
                        }
                        continue;
                    }

                    // A times or share fact read from the other end. The grouping
                    // sentences are plural-only in the phrasing catalog, and
                    // "3 x ? = 3" is not a question about grouping, so one group
                    // and one share are both refused here rather than rendered.
                    const relational = additive
                        ? buildRelationalCandidate(shape, template.kind as 'addition' | 'subtraction', left, right, correct)
                        : (left >= 2 && right >= 2 && correct >= 2)
                            ? buildMultiplicativeRelationalCandidate(
                                shape,
                                template.kind as 'multiplication' | 'division',
                                left,
                                right,
                                correct,
                            )
                            : null;
                    // Nothing in this age band has an answer below zero, and a
                    // prompt whose blank is 0 ("2 + ? = 2") reads as a trick
                    // rather than a bond.
                    if (!relational || relational.correct <= 0) continue;
                    candidates.push({
                        values: { left, right, correct: relational.correct },
                        promptText: applyPromptLeadIn(relational.promptText, template.promptLeadIn),
                        correct: relational.correct,
                        complexity,
                        ageBand: template.ageBand ?? [5, 7],
                        domain: template.kind,
                        hint: relational.hint,
                        explanation: relational.explanation,
                        optionPreference: relational.optionPreference,
                    });
                }
                continue;
            }

            for (const variant of promptVariants) {
                if (storyFree && !EARLY_FRAMINGS.has(variant)) continue;
                // EVERY story keeps BOTH quantities >= 2, which is what
                // docs/MATH_AUTHORING_STANDARDS.md §4 has always said and what
                // only the multiplicative branch actually enforced. The additive
                // stories inflect their subject noun on the FIRST number only --
                // "1 bird sits" has a singular sibling, "1 fly away" does not --
                // so "70 birds sit on a branch. 1 fly away." shipped, ungrammatical
                // in English. (Icelandic escapes it: "Þeim fækkar um 1" is
                // impersonal and does not inflect. English is the language with
                // the bug, which is the opposite of the usual direction here.)
                if (variant.startsWith('story_') && (left < 2 || right < 2)) continue;
                if (
                    variant.startsWith('story_') &&
                    (template.kind === 'multiplication' || template.kind === 'division') &&
                    correct < 2
                ) continue;
                if (!storyFits(variant, left, right, correct)) continue;

                const promptText = applyPromptLeadIn(formatArithmeticPrompt(variant, left, operator, right), template.promptLeadIn);
                candidates.push({
                    values: { left, right, correct },
                    promptText,
                    correct,
                    complexity,
                    ageBand: template.ageBand ?? [5, 7],
                    domain: template.kind,
                    ...(storyScaffold(variant, left, right, correct) ?? {}),
                });
            }
        }
    }

    return candidates;
}

function renderCountingCandidates(template: CountingTemplateSpec): RawCandidate[] {
    // `symbols` first, then a single legacy `symbol`, then the whole alphabet.
    // The default is the alphabet rather than "o" on purpose: a template that
    // says nothing about shape should get variety, not the same disc every time.
    const symbols = template.symbols && template.symbols.length > 0
        ? template.symbols
        : template.symbol
            ? [template.symbol]
            : [...COUNTING_MARKER_ALPHABET];
    const promptVariants = withFallbackVariants(template.kind, template.promptVariants, template.strictVariants);
    const counts = enumerateRange(template.countRange);
    const candidates: RawCandidate[] = [];

    for (const count of counts) {
        const complexity = normalizedProgress(count, template.countRange);
        for (const symbol of symbols) {
            for (const variant of promptVariants) {
                const promptText = applyPromptLeadIn(formatCountingPrompt(variant, symbol, count), template.promptLeadIn);
                candidates.push({
                    values: { count, correct: count },
                    promptText,
                    correct: count,
                    complexity,
                    ageBand: template.ageBand ?? [5, 7],
                    domain: 'counting',
                });
            }
        }
    }

    return candidates;
}

function renderComparisonCandidates(template: ComparisonTemplateSpec): RawCandidate[] {
    const promptVariants = withFallbackVariants(template.kind, template.promptVariants, template.strictVariants);
    const leftValues = enumerateRange(template.leftRange);
    const rightValues = enumerateRange(template.rightRange);
    const candidates: RawCandidate[] = [];

    for (const left of leftValues) {
        for (const right of rightValues) {
            if (template.distinctOperands !== false && left === right) continue;
            const correct = template.relation === 'greater' ? Math.max(left, right) : Math.min(left, right);
            const complexity = normalizedProgress(
                Math.max(left, right),
                [Math.min(template.leftRange[0], template.rightRange[0]), Math.max(template.leftRange[1], template.rightRange[1])],
            );
            for (const variant of promptVariants) {
                const promptText = applyPromptLeadIn(formatComparisonPrompt(variant, template.relation, left, right), template.promptLeadIn);
                candidates.push({
                    values: { left, right, correct },
                    promptText,
                    correct,
                    complexity,
                    ageBand: template.ageBand ?? [5, 7],
                    domain: 'comparison',
                });
            }
        }
    }

    return candidates;
}

function renderSequenceCandidates(template: SequenceTemplateSpec): RawCandidate[] {
    const promptVariants = withFallbackVariants(template.kind, template.promptVariants, template.strictVariants);
    const starts = enumerateRange(template.startRange);
    const candidates: RawCandidate[] = [];

    for (const start of starts) {
        for (const step of template.stepChoices) {
            const sequence = Array.from({ length: template.length }, (_, index) => start + (index * step));
            const correct = start + (template.length * step);
            // Counting back is a grade-1 skill in its own right (Sproti 1:
            // talning aftur a bak), which means stepChoices may be negative --
            // and negative numbers are outside this game's format entirely
            // (docs/MATH_AUTHORING_STANDARDS.md section 8), so a run that would
            // walk past zero is not a hard problem, it is an unanswerable one.
            if (correct < 0 || sequence.some(value => value < 0)) continue;
            const maxValue = Math.max(correct, ...sequence);
            const minValue = Math.min(correct, ...sequence);
            const complexity = clamp(
                ((Math.abs(step) - 1) / 9) * 0.45 +
                normalizedProgress(maxValue, [minValue, Math.max(maxValue, minValue + 1)]) * 0.55,
                0,
                1,
            );
            for (const variant of promptVariants) {
                // A run that climbs is not "counting back", whatever the template
                // asked for.
                // Talning áfram and talning aftur á bak are UNIT counting. A run
                // that jumps by 25 is skip counting, and calling it "counting on"
                // names the wrong strategy in both languages -- the catalog
                // already has keep_pattern and number_pattern for those. The
                // direction check alone let 25s and 50s through.
                if ((variant === 'count_on' || variant === 'count_back') && Math.abs(step) !== 1) continue;
                if (variant === 'count_on' && step <= 0) continue;
                if (variant === 'count_back' && step >= 0) continue;
                const promptText = applyPromptLeadIn(formatSequencePrompt(variant, sequence), template.promptLeadIn);
                candidates.push({
                    values: { start, step, correct },
                    promptText,
                    correct,
                    complexity,
                    ageBand: template.ageBand ?? [5, 7],
                    domain: 'number_sequence',
                });
            }
        }
    }

    return candidates;
}

function renderPatternCandidates(template: PatternTemplateSpec): RawCandidate[] {
    const promptVariants = withFallbackVariants(template.kind, template.promptVariants, template.strictVariants);
    const values = enumerateRange(template.valueRange);
    const candidates: RawCandidate[] = [];
    const seenPatterns = new Set<string>();
    const basePatterns: number[][] = [];

    const buildPatterns = (current: number[]): void => {
        if (current.length === template.patternLength) {
            basePatterns.push([...current]);
            return;
        }

        for (const next of values) {
            if (current.includes(next)) continue;
            current.push(next);
            buildPatterns(current);
            current.pop();
        }
    };

    buildPatterns([]);

    for (const basePattern of basePatterns) {
        const key = basePattern.join('-');
        if (seenPatterns.has(key)) continue;
        seenPatterns.add(key);

        const sequence = Array.from(
            { length: template.cycles * template.patternLength },
            (_, index) => basePattern[index % basePattern.length],
        );
        const visible = sequence.slice(0, Math.max(template.patternLength + 2, (template.cycles * template.patternLength) - 1));
        const correct = sequence[visible.length];
        const complexity = normalizedProgress(basePattern[basePattern.length - 1], template.valueRange);

        for (const variant of promptVariants) {
            const promptText = applyPromptLeadIn(formatPatternPrompt(variant, visible), template.promptLeadIn);
            candidates.push({
                values: { correct, a: basePattern[0], b: basePattern[1] ?? basePattern[0] },
                promptText,
                correct,
                complexity,
                ageBand: template.ageBand ?? [5, 7],
                domain: 'pattern_matching',
            });
        }
    }

    return candidates;
}

function renderCandidates(template: BatchTemplateSpec): RawCandidate[] {
    if (template.kind === 'counting') return renderCountingCandidates(template);
    if (template.kind === 'comparison') return renderComparisonCandidates(template);
    if (template.kind === 'number_sequence') return renderSequenceCandidates(template);
    if (template.kind === 'pattern_matching') return renderPatternCandidates(template);
    return renderArithmeticCandidates(template);
}

function candidateComplexityToDifficulty(candidate: RawCandidate, band: MathBand): number {
    const targetElo = interpolate(band.targetEloRange, candidate.complexity);
    return difficultyFromTargetELO(targetElo);
}

function buildProblemFromCandidate(batch: MathBatchSpec, template: BatchTemplateSpec, band: MathBand, candidate: RawCandidate): MathProblem | null {
    const difficulty = candidateComplexityToDifficulty(candidate, band);
    const placeholder: MathProblem = {
        id: 'placeholder',
        domain: candidate.domain,
        skills: [template.skill],
        difficulty,
        curriculumStep: 0,
        ageBand: determineAgeBand(template, band),
        difficultyTraits: undefined,
        prompt: {
            text: candidate.promptText,
            assets: null,
        },
        answer: {
            mode: 'mcq',
            correct: candidate.correct,
            options: [],
        },
        hint: candidate.hint ?? renderHint(template.hintStrategy, { ...candidate.values, correct: candidate.correct }),
        explanation: candidate.explanation
            ?? renderExplanation(template.explanationStrategy, { ...candidate.values, correct: candidate.correct }),
        // A candidate that names its own tags REPLACES the template's rather than
        // adding to them. A compare story comes off a subtraction template, and
        // "counting_back_error" is not a mistake it can produce -- nothing is
        // counted back in it. Merging would have left the analytics claiming a
        // misconception the problem cannot express.
        misconceptionTags: candidate.misconceptionTags ?? template.misconceptionTags,
        generator: buildGeneratorMetadata(batch, template, band, candidate.values),
    };

    placeholder.curriculumStep = deriveCurriculumStep(placeholder);
    placeholder.difficultyTraits = deriveDifficultyTraits(placeholder);

    // §4: "Steps 0-2 carry no story: a narrative is a second thing to decode on
    // top of the fact."
    //
    // Scoped to the two domains a new child actually starts in, and this is a
    // real reading of the rule rather than a convenient one. The rule is about
    // READING LOAD at the bottom of the ladder -- a five-year-old meeting their
    // first sum, who cannot yet decode a sentence and a fact at once. Read as a
    // step index across every domain it says something else entirely, and
    // something §1 forbids: division steps 0-2 are sharing by two, and §1's own
    // words are "Sharing stories (partitive) are the natural intro framing" for
    // division. A child reaching division step 2 has climbed the whole additive
    // ladder first; they are eight, not five, and the array is the standard
    // model for meeting multiplication rather than a second thing to decode.
    //
    // Checked on the DERIVED step rather than the operand size the generator
    // used to approximate it with. For these two domains the two are provably
    // the same test -- addition step = maxOperand - 1 without a carry, so step
    // <= 2 is exactly maxOperand <= 3, and subtraction step = maxOperand - 5, so
    // step <= 2 is exactly maxOperand <= 7 -- but the step is what the rule says
    // and reading it off an operand was one derivation change away from drifting.
    if (
        (placeholder.domain === 'addition' || placeholder.domain === 'subtraction')
        && placeholder.curriculumStep <= 2
        && parseWordedArithmetic(placeholder.prompt.text)
    ) {
        return null;
    }

    if (template.templateStepRange) {
        const [minTemplateStep, maxTemplateStep] = template.templateStepRange;
        if (placeholder.curriculumStep < minTemplateStep || placeholder.curriculumStep > maxTemplateStep) {
            return null;
        }
    }

    const [minBandStep, maxBandStep] = band.curriculumStepRange;
    if (placeholder.curriculumStep < minBandStep || placeholder.curriculumStep > maxBandStep) {
        return null;
    }

    const problemId = buildProblemId(batch, template, candidate.values, candidate.promptText);
    const answerOptions = candidate.optionPreference
        ? buildOptions(candidate.correct, candidate.optionPreference)
        : template.kind === 'comparison'
        ? buildOptions(candidate.correct, [candidate.values.left ?? candidate.correct, candidate.values.right ?? candidate.correct, candidate.correct - 1, candidate.correct + 1])
        : buildArithmeticOptions(
            template.kind,
            candidate.values.left ?? candidate.values.count ?? candidate.values.start ?? candidate.correct,
            candidate.values.right ?? candidate.values.step ?? 1,
            candidate.correct,
        );

    return {
        ...placeholder,
        id: problemId,
        answer: {
            mode: 'mcq',
            correct: candidate.correct,
            options: answerOptions,
        },
    };
}

function createBatchProblems(
    batch: MathBatchSpec,
    bandsById: Map<string, MathBand>,
    usedIds: Set<string>,
    usedPrompts: Set<string>,
): MathProblem[] {
    const problems: MathProblem[] = [];

    for (const template of batch.templates) {
        const band = bandsById.get(template.bandId);
        if (!band) {
            throw new Error(`Missing band ${template.bandId} for template ${batch.id}/${template.id}`);
        }

        // COVER EVERY FACT BEFORE REPEATING ONE.
        //
        // A template renders one candidate per (fact x framing) -- and for
        // counting, per (count x marker x framing) -- then keeps the first
        // `count` of them by hash. A flat hash sort is a lottery over that whole
        // cross product, so a template asking for ten problems out of 384 could
        // hand back six ways of saying "three" and never ask for two at all. The
        // wider the framing and marker sets got, the worse the lottery behaved:
        // adding variety to the presentation was quietly costing coverage of the
        // content.
        //
        // So candidates are dealt round by round instead. Round 0 takes the best
        // candidate for each distinct fact, round 1 the second-best, and so on;
        // within a round the hash still decides, so the choice of framing and
        // marker stays arbitrary and stable. A template can no longer ask the
        // same fact twice while another fact in its range goes unasked.
        const candidates = renderCandidates(template)
            .map(candidate => ({
                candidate,
                coverageKey: JSON.stringify(candidate.values),
                hash: stableHash(`${batch.id}|${template.id}|${candidate.promptText}`),
                round: 0,
            }))
            .sort((left, right) => left.hash - right.hash);

        const dealt = new Map<string, number>();
        for (const entry of candidates) {
            const round = dealt.get(entry.coverageKey) ?? 0;
            entry.round = round;
            dealt.set(entry.coverageKey, round + 1);
        }
        candidates.sort((left, right) => left.round - right.round || left.hash - right.hash);

        const templateProblems: MathProblem[] = [];
        for (const entry of candidates) {
            if (templateProblems.length >= template.count) break;

            const problem = buildProblemFromCandidate(batch, template, band, entry.candidate);
            if (!problem) continue;
            const promptKey = buildPromptUniquenessKey(problem.prompt.text);
            if (usedIds.has(problem.id)) continue;
            if (usedPrompts.has(promptKey)) continue;

            usedIds.add(problem.id);
            usedPrompts.add(promptKey);
            templateProblems.push(problem);
        }

        if (templateProblems.length !== template.count) {
            throw new Error(`Template ${batch.id}/${template.id} only materialized ${templateProblems.length} of ${template.count} requested problems`);
        }

        problems.push(...templateProblems);
    }

    if (problems.length !== batch.targetCount) {
        throw new Error(`Batch ${batch.id} materialized ${problems.length} problems but targetCount is ${batch.targetCount}`);
    }

    return problems;
}

export function loadBandTable(): MathBandTable {
    return readJson<MathBandTable>(join(AUTHORING_DIR, 'band-table.json'));
}

function loadBatchSpecs(): MathBatchCollection {
    return readJson<MathBatchCollection>(join(AUTHORING_DIR, 'batches.json'));
}

function loadCurriculumSeed(): { problems: MathProblem[] } {
    return readJson<{ problems: MathProblem[] }>(join(AUTHORING_DIR, 'seed', 'problems_curriculum_seed.json'));
}

function loadProtectedRuntimeProblems(): MathProblem[] {
    if (!existsSync(DATA_DIR)) {
        return [];
    }

    return readdirSync(DATA_DIR)
        .filter(file => file.endsWith('.json') && file !== 'problems_curriculum.json')
        .sort()
        .flatMap(file => {
            const data = readJson<{ problems?: MathProblem[] }>(join(DATA_DIR, file));
            return Array.isArray(data.problems) ? data.problems : [];
        });
}

export function materializeMathBatches(): MaterializationResult {
    const seedPool = loadCurriculumSeed();
    const protectedRuntimeProblems = loadProtectedRuntimeProblems();
    const batchCollection = loadBatchSpecs();
    const bands = loadBandTable();
    const bandsById = new Map(bands.bands.map(band => [band.id, band]));
    const usedIds = new Set<string>();
    const usedPrompts = new Set<string>();

    for (const problem of [...protectedRuntimeProblems, ...seedPool.problems]) {
        usedIds.add(problem.id);
        usedPrompts.add(buildPromptUniquenessKey(problem.prompt.text));
    }

    const materializedBatches = batchCollection.batches.map(batch => ({
        batch,
        problems: createBatchProblems(batch, bandsById, usedIds, usedPrompts),
    }));

    const generatedProblems = materializedBatches.flatMap(batch => batch.problems);
    const curriculumPool = {
        problems: [...seedPool.problems, ...generatedProblems],
    };

    return {
        seedProblems: seedPool.problems,
        generatedProblems,
        curriculumPool,
        materializedBatches,
    };
}

type SimulationProfile = {
    name: string;
    successRate: number;
    initialStep: number;
};

function reviewTemplateBatch(batch: MathBatchSpec, problems: MathProblem[]): BatchReview['templateReview'] {
    const familyCount = new Set(batch.templates.map(template => template.family)).size;
    const stepValues = problems.map(problem => problem.curriculumStep);
    const minStep = Math.min(...stepValues);
    const maxStep = Math.max(...stepValues);
    // The variants a template ACTUALLY renders, not the ones it lists. Most
    // templates name a handful and then receive the whole fallback union, so the
    // listed field describes nothing that ships -- and this number feeds the
    // pacing grade the batch gate reads. Grading a batch on a field the
    // generator ignores is grading it on a wish.
    const promptVariantCount = batch.templates.reduce(
        (sum, template) => sum + withFallbackVariants(
            template.kind,
            template.promptVariants,
            template.strictVariants,
        ).length,
        0,
    );
    const templateCoverage = problems.length / batch.templates.length;
    const pacingGrade = clamp(
        9 + Math.min(1, familyCount / 10) + Math.min(0.5, promptVariantCount / 40) - Math.max(0, (maxStep - minStep > 12 ? 0.6 : 0)),
        0,
        10,
    );
    const analyticsGrade = clamp(9 + Math.min(0.6, templateCoverage / 25), 0, 10);
    const leadGrade = roundTo((pacingGrade + analyticsGrade) / 2, 1);

    return {
        category: {
            grade: leadGrade,
            summary: `Template coverage is stable: ${batch.templates.length} templates, ${familyCount} families, steps ${minStep}-${maxStep}.`,
            metrics: {
                templateCount: batch.templates.length,
                familyCount,
                minStep,
                maxStep,
                promptVariantCount,
                averageProblemsPerTemplate: roundTo(templateCoverage, 1),
            },
        },
        roleGrades: [
            {
                role: 'Lead Producer',
                grade: leadGrade,
                rationale: 'Batch shape is dense enough to scale without a cliff.',
            },
            {
                role: 'role-game-designer',
                grade: roundTo(pacingGrade, 1),
                rationale: 'Families and wording variants support replay and gentle pacing.',
            },
            {
                role: 'role-analytics-engineer',
                grade: roundTo(analyticsGrade, 1),
                rationale: 'Template volume and spread are consistent enough for later measurement.',
            },
        ],
    };
}

function reviewConcreteBatch(
    batch: MathBatchSpec,
    problems: MathProblem[],
    bandLookup: Map<string, MathBand>,
    protectedPromptKeys: Set<string>,
): BatchReview['concreteReview'] {
    let arithmeticErrors = 0;
    let metadataErrors = 0;
    let optionErrors = 0;
    let promptDuplicates = 0;
    let protectedPromptOverlaps = 0;
    let bandMismatches = 0;
    const prompts = new Set<string>();

    for (const problem of problems) {
        const evaluatedAnswer = evaluateArithmeticPrompt(problem.prompt.text);
        if (evaluatedAnswer !== null && problem.answer.correct !== evaluatedAnswer) {
            arithmeticErrors++;
        }

        const derivedStep = deriveCurriculumStep(problem);
        if (derivedStep !== problem.curriculumStep) {
            metadataErrors++;
        }

        const derivedTraits = deriveVerifiedDifficultyTraits(problem) ?? deriveDifficultyTraits(problem);
        if (derivedTraits && (
            problem.difficultyTraits?.maxOperand !== derivedTraits.maxOperand ||
            (problem.difficultyTraits?.requiresCarry ?? false) !== (derivedTraits.requiresCarry ?? false) ||
            (problem.difficultyTraits?.requiresBorrow ?? false) !== (derivedTraits.requiresBorrow ?? false)
        )) {
            metadataErrors++;
        }

        if (problem.answer.mode !== 'mcq' || !problem.answer.options.includes(problem.answer.correct as number) || new Set(problem.answer.options).size !== problem.answer.options.length) {
            optionErrors++;
        }

        const promptKey = buildPromptUniquenessKey(problem.prompt.text);
        if (prompts.has(promptKey)) {
            promptDuplicates++;
        }
        prompts.add(promptKey);

        if (protectedPromptKeys.has(promptKey)) {
            protectedPromptOverlaps++;
        }

        const bandId = String((problem.generator as { params?: Record<string, unknown> } | null)?.params?.bandId ?? '');
        const band = bandLookup.get(bandId);
        if (!band) {
            bandMismatches++;
            continue;
        }

        const problemElo = computeInitialProblemELO(problem.difficulty);
        if (problem.curriculumStep < band.curriculumStepRange[0] || problem.curriculumStep > band.curriculumStepRange[1]) {
            bandMismatches++;
            continue;
        }
        if (problemElo < band.targetEloRange[0] || problemElo > band.targetEloRange[1]) {
            bandMismatches++;
        }
    }

    const deductions = (arithmeticErrors * 1.5) + metadataErrors + optionErrors + (promptDuplicates * 2) + (protectedPromptOverlaps * 2) + (bandMismatches * 1.5);
    const baseGrade = clamp(10 - Math.min(4, deductions / Math.max(1, problems.length / 25)), 0, 10);

    return {
        category: {
            grade: roundTo(baseGrade, 1),
            summary: `Concrete batch review found ${arithmeticErrors} arithmetic issues, ${metadataErrors} metadata issues, ${optionErrors} option issues, ${promptDuplicates} duplicate prompts, ${protectedPromptOverlaps} protected-prompt overlaps, and ${bandMismatches} band mismatches.`,
            metrics: {
                problemCount: problems.length,
                arithmeticErrors,
                metadataErrors,
                optionErrors,
                promptDuplicates,
                protectedPromptOverlaps,
                bandMismatches,
            },
        },
        roleGrades: [
            {
                role: 'Lead Producer',
                grade: roundTo(baseGrade, 1),
                rationale: 'Concrete problems match the batch contract closely enough to trust them.',
            },
            {
                role: 'role-qa-engineer',
                grade: roundTo(clamp(baseGrade - (arithmeticErrors > 0 || metadataErrors > 0 || optionErrors > 0 ? 0.3 : 0), 0, 10), 1),
                rationale: 'Arithmetic truth, metadata truth, and option integrity are the first acceptance gate.',
            },
            {
                role: 'role-analytics-engineer',
                grade: roundTo(clamp(baseGrade - (bandMismatches > 0 || protectedPromptOverlaps > 0 ? 0.4 : 0), 0, 10), 1),
                rationale: 'Difficulty alignment and replay-surface hygiene must stay measurable and trustworthy.',
            },
        ],
    };
}

function simulateBatch(batch: MathBatchSpec, problems: MathProblem[]): BatchReview['simulationReview'] {
    const populatedSteps = Array.from(new Set(problems.map(problem => problem.curriculumStep))).sort((left, right) => left - right);
    const anchorIndexes = Array.from(new Set([
        0,
        Math.floor((populatedSteps.length - 1) / 2),
        populatedSteps.length - 1,
    ])).sort((left, right) => left - right);
    const anchors = anchorIndexes.map((index, anchorIndex) => ({
        index,
        step: populatedSteps[index],
        label: anchorIndex === 0
            ? 'opening'
            : anchorIndex === anchorIndexes.length - 1
                ? 'upper'
                : 'middle',
    }));
    const profiles: Array<Omit<SimulationProfile, 'initialStep'> & { role: BatchReviewRoleGrade['role'] }> = [
        { name: 'steady_child', successRate: 0.9, role: 'role-game-designer' },
        { name: 'struggling_child', successRate: 0.78, role: 'role-qa-engineer' },
        { name: 'strong_child', successRate: 0.96, role: 'Lead Producer' },
    ];

    const byStep = new Map<number, MathProblem[]>();
    for (const problem of problems) {
        if (!byStep.has(problem.curriculumStep)) {
            byStep.set(problem.curriculumStep, []);
        }
        byStep.get(problem.curriculumStep)!.push(problem);
    }

    const exhaustionWarnings: string[] = [];
    const probeGrades: Array<{ profile: string; role: BatchReviewRoleGrade['role']; anchor: string; grade: number; visitedStepCount: number }> = [];

    for (const profile of profiles) {
        for (const anchor of anchors) {
            let currentStepIndex = anchor.index;
            let winsAtStep = 0;
            let recentWrong = 0;
            let localGrade = 10;
            const recentIds: string[] = [];
            const visitedSteps = new Set<number>([populatedSteps[anchor.index]]);

            for (let attempt = 0; attempt < 42; attempt++) {
                const candidateIndexes = [
                    Math.max(0, currentStepIndex - 2),
                    Math.max(0, currentStepIndex - 1),
                    currentStepIndex,
                ];
                const candidateSteps = Array.from(new Set(candidateIndexes.map(index => populatedSteps[index])));
                const available = candidateSteps
                    .flatMap(step => byStep.get(step) ?? [])
                    .filter(problem => !recentIds.includes(problem.id));

                const fallback = candidateSteps.flatMap(step => byStep.get(step) ?? []);
                const pool = available.length > 0 ? available : fallback;

                if (pool.length === 0) {
                    exhaustionWarnings.push(`${profile.name}:${anchor.label}:${attempt}`);
                    localGrade -= 0.8;
                    break;
                }

                const chosen = pool[attempt % pool.length];
                visitedSteps.add(chosen.curriculumStep);
                recentIds.push(chosen.id);
                if (recentIds.length > 8) {
                    recentIds.shift();
                }

                const success = ((attempt * 17) + stableHash(`${batch.id}|${profile.name}|${anchor.label}|${chosen.id}`)) % 100 < profile.successRate * 100;
                if (success) {
                    winsAtStep++;
                    recentWrong = 0;
                    if (winsAtStep >= 5) {
                        currentStepIndex = Math.min(populatedSteps.length - 1, currentStepIndex + 1);
                        winsAtStep = 0;
                    }
                } else {
                    recentWrong++;
                    winsAtStep = 0;
                    if (recentWrong >= 2) {
                        currentStepIndex = Math.max(0, currentStepIndex - 1);
                        recentWrong = 0;
                    }
                }
            }

            const currentStep = populatedSteps[currentStepIndex];
            const currentBandVolume = (byStep.get(currentStep) ?? []).length;
            if (currentBandVolume < 6) {
                localGrade -= 0.4;
            }

            if (anchor.label === 'upper' && populatedSteps.length > 1 && visitedSteps.size < 2) {
                localGrade -= 0.5;
            }

            probeGrades.push({
                profile: profile.name,
                role: profile.role,
                anchor: anchor.label,
                grade: clamp(localGrade, 0, 10),
                visitedStepCount: visitedSteps.size,
            });
        }
    }

    const profileGrades = profiles.map(profile => {
        const matching = probeGrades.filter(entry => entry.profile === profile.name);
        return roundTo(matching.reduce((sum, entry) => sum + entry.grade, 0) / matching.length, 1);
    });
    const average = roundTo(probeGrades.reduce((sum, entry) => sum + entry.grade, 0) / probeGrades.length, 1);
    const devilAdvocatePassed = exhaustionWarnings.length === 0;

    return {
        category: {
            grade: average,
            summary: `Selection-proxy simulation stayed stable across ${probeGrades.length} profile-anchor probes${exhaustionWarnings.length > 0 ? ` with ${exhaustionWarnings.length} exhaustion warnings` : ''}.`,
            metrics: {
                steadyChildGrade: roundTo(profileGrades[0], 1),
                strugglingChildGrade: roundTo(profileGrades[1], 1),
                strongChildGrade: roundTo(profileGrades[2], 1),
                openingProbeStep: anchors[0]?.step ?? 0,
                middleProbeStep: anchors[Math.floor((anchors.length - 1) / 2)]?.step ?? 0,
                upperProbeStep: anchors[anchors.length - 1]?.step ?? 0,
                uniqueStartAnchors: anchors.length,
                probeCount: probeGrades.length,
                exhaustionWarnings: exhaustionWarnings.length,
            },
        },
        roleGrades: [
            {
                role: 'Lead Producer',
                grade: roundTo(profileGrades[2], 1),
                rationale: 'The strong-child upper-band probe checks that the batch stays trustworthy beyond the opening slice.',
            },
            {
                role: 'role-game-designer',
                grade: roundTo(profileGrades[0], 1),
                rationale: 'Steady-child probes cover opening, middle, and upper entry points so pacing is not judged only from the first step.',
            },
            {
                role: 'role-qa-engineer',
                grade: roundTo(profileGrades[1], 1),
                rationale: 'The struggling-child probes check for exhaustion and cliffs across opening, middle, and upper populated steps.',
            },
        ],
        devilAdvocate: {
            passed: devilAdvocatePassed,
            note: devilAdvocatePassed
                ? 'Devils Advocate: the selection proxy stayed inside the populated batch slice across opening, middle, and upper entry anchors without exhausting or skipping upper-band coverage.'
                : 'Devils Advocate: at least one profile-anchor probe still runs out of safe variety too quickly.',
        },
    };
}

function buildBatchReview(
    batch: MathBatchSpec,
    problems: MathProblem[],
    bandLookup: Map<string, MathBand>,
    protectedPromptKeys: Set<string>,
): BatchReview {
    const templateReview = reviewTemplateBatch(batch, problems);
    const concreteReview = reviewConcreteBatch(batch, problems, bandLookup, protectedPromptKeys);
    const simulationReview = simulateBatch(batch, problems);
    const roleGrades = [
        ...templateReview.roleGrades,
        ...concreteReview.roleGrades,
        ...simulationReview.roleGrades,
    ].map(entry => entry.grade);
    const averageGrade = roundTo(roleGrades.reduce((sum, grade) => sum + grade, 0) / roleGrades.length, 1);

    const criticalIssues: string[] = [];
    if (concreteReview.category.metrics.arithmeticErrors !== 0) criticalIssues.push('arithmetic');
    if (concreteReview.category.metrics.metadataErrors !== 0) criticalIssues.push('metadata');
    if (concreteReview.category.metrics.optionErrors !== 0) criticalIssues.push('options');
    if (concreteReview.category.metrics.promptDuplicates !== 0) criticalIssues.push('prompt_duplicates');
    if (concreteReview.category.metrics.protectedPromptOverlaps !== 0) criticalIssues.push('seed_overlap');
    if (concreteReview.category.metrics.bandMismatches !== 0) criticalIssues.push('band_alignment');
    if (!simulationReview.devilAdvocate.passed) criticalIssues.push('simulation_exhaustion');

    const accepted = averageGrade >= 9.0
        && templateReview.roleGrades.every(entry => entry.grade >= 8.5)
        && concreteReview.roleGrades.every(entry => entry.grade >= 8.5)
        && simulationReview.roleGrades.every(entry => entry.grade >= 8.5)
        && criticalIssues.length === 0;

    return {
        batchId: batch.id,
        title: batch.title,
        accepted,
        averageGrade,
        criticalIssues,
        templateReview,
        concreteReview,
        simulationReview,
        samplePrompts: problems.slice(0, 5).map(problem => problem.prompt.text),
    };
}

type RuntimeSmokeProfile = {
    name: string;
    successRate: number;
};

function loadRuntimeProblemPools(materialized: MaterializationResult): Array<{ key: string; pool: MathProblemPool }> {
    const pools: Array<{ key: string; pool: MathProblemPool }> = [];

    for (const file of readdirSync(DATA_DIR).filter(entry => entry.endsWith('.json') && entry !== 'problems_curriculum.json').sort()) {
        const pool = readJson<MathProblemPool>(join(DATA_DIR, file));
        pools.push({
            key: file.replace(/\.json$/i, ''),
            pool,
        });
    }

    pools.push({
        key: 'problems_curriculum',
        pool: materialized.curriculumPool,
    });

    return pools;
}

function buildOwlSurfaceSummary(materialized: MaterializationResult): ReviewSummary['owlSurface'] {
    const owlConfig = loadLiveOwlMathConfig();
    const runtimeProblems = loadRuntimeProblemPools(materialized)
        .flatMap(entry => entry.pool.problems);
    const owlEligible = runtimeProblems.filter(problem => isProblemWithinOwlRails(problem, owlConfig));
    const uniquePrompts = new Set(owlEligible.map(problem => buildPromptUniquenessKey(problem.prompt.text)));
    const uniqueFacts = new Set(owlEligible.map(problem => buildProblemReplayKey(problem)));
    const domainCounts = owlConfig.domains.reduce<Record<string, number>>((counts, domain) => {
        counts[domain] = owlEligible.filter(problem => problem.domain === domain).length;
        return counts;
    }, {});

    ELOManager.getInstance().initialize(undefined);
    LearnerStateManager.getInstance().initialize(
        { childId: 'owl-surface-child', familyId: 'owl-surface-family' },
        undefined,
        ELOManager.getInstance().getStats(),
    );
    const openingUnlockedDomains = owlConfig.domains.filter(domain =>
        LearnerStateManager.getInstance().isDomainUnlocked(domain),
    );
    const openingUnlockedInventoryProblems = owlEligible.filter(problem =>
        openingUnlockedDomains.includes(problem.domain),
    );
    const openingCurrentSteps = new Map(
        openingUnlockedDomains.map(domain => [
            domain,
            LearnerStateManager.getInstance().getCurrentStep(domain),
        ]),
    );
    const freshReachableProblems = openingUnlockedInventoryProblems.filter(problem =>
        problem.curriculumStep <= (openingCurrentSteps.get(problem.domain) ?? 0),
    );
    const freshReachableDomainCounts = freshReachableProblems.reduce<Record<string, number>>((counts, problem) => {
        counts[problem.domain] = (counts[problem.domain] ?? 0) + 1;
        return counts;
    }, {});
    const freshReachableAdditionProblems = freshReachableProblems.filter(problem => problem.domain === 'addition');
    const freshReachableCountingProblems = freshReachableProblems.filter(problem => problem.domain === 'counting');

    const owlAdditionByStep = [0, 1, 2, 3, 4, 5].map(step => {
        const problems = owlEligible.filter(problem => problem.domain === 'addition' && problem.curriculumStep === step);
        return {
            step,
            rowCount: problems.length,
            uniquePromptCount: new Set(problems.map(problem => buildPromptUniquenessKey(problem.prompt.text))).size,
            uniqueFactCount: new Set(problems.map(problem => buildProblemReplayKey(problem))).size,
        };
    });

    return {
        domains: [...owlConfig.domains],
        openingUnlockedDomains,
        owlEligibleProblemCount: owlEligible.length,
        owlEligibleUniquePromptCount: uniquePrompts.size,
        owlEligibleUniqueFactCount: uniqueFacts.size,
        domainCounts,
        openingUnlockedInventoryProblemCount: openingUnlockedInventoryProblems.length,
        openingUnlockedInventoryUniquePromptCount: new Set(openingUnlockedInventoryProblems.map(problem => buildPromptUniquenessKey(problem.prompt.text))).size,
        openingUnlockedInventoryUniqueFactCount: new Set(openingUnlockedInventoryProblems.map(problem => buildProblemReplayKey(problem))).size,
        freshReachableProblemCount: freshReachableProblems.length,
        freshReachableUniquePromptCount: new Set(freshReachableProblems.map(problem => buildPromptUniquenessKey(problem.prompt.text))).size,
        freshReachableUniqueFactCount: new Set(freshReachableProblems.map(problem => buildProblemReplayKey(problem))).size,
        freshReachableDomainCounts,
        freshReachableAdditionFactCount: new Set(freshReachableAdditionProblems.map(problem => buildProblemReplayKey(problem))).size,
        freshReachableCountingFactCount: new Set(freshReachableCountingProblems.map(problem => buildProblemReplayKey(problem))).size,
        currentInteractionProblemCount: owlConfig.problemCount,
        owlAdditionByStep,
    };
}

function buildSmokeAttempt(
    childId: string,
    familyId: string,
    problem: MathProblem,
    problemELO: number,
    selectionLane: SelectionLane,
    reviewItemId: string | null,
    correct: boolean,
    answeredAt: number,
): LearnerAttemptSubmission {
    return {
        attemptId: `smoke-${childId}-${problem.id}-${answeredAt}`,
        childId,
        familyId,
        problemId: problem.id,
        domain: problem.domain,
        skills: [...problem.skills],
        correct,
        firstAttempt: true,
        hintsUsed: 0,
        responseMs: correct ? 4200 : 6900,
        answeredAt,
        problemELO,
        curriculumStep: problem.curriculumStep,
        selectionLane,
        reviewItemId,
    };
}

function verifyConstraintPreservingFallbacks(
    manager: MathProblemManager,
    owlConfig: LiveOwlMathConfig,
): {
    recentWindowFallbackPreserved: boolean;
    uninitializedFallbackPreserved: boolean;
    currentStepFallbackPreserved: boolean;
} {
    const impossibleOptions = {
        difficultyRange: [0, 0] as [number, number],
        maxCurriculumStep: 0,
        maxOperand: 0,
    };

    ELOManager.getInstance().initialize(undefined);
    LearnerStateManager.getInstance().initialize(
        { childId: 'fallback-probe-child', familyId: 'fallback-probe-family' },
        undefined,
        ELOManager.getInstance().getStats(),
    );

    manager.resetAnswered();
    manager.getNextProblem({
        domains: ['addition'],
        difficultyRange: owlConfig.difficultyRange,
        maxCurriculumStep: LearnerStateManager.getInstance().getCurrentStep('addition'),
        maxOperand: owlConfig.maxOperand,
    });

    const recentWindowResult = manager.getNextProblemELOAware('addition', impossibleOptions);
    const recentWindowFallbackPreserved = recentWindowResult === null;

    // Deliberate private-field poke: this simulation has to prove the owl
    // selector keeps its safety rails even when the ELO strategy is missing.
    // `Manager & { eloStrategy }` collapses to never because the real member is
    // private, so route through unknown.
    const managerWithPrivate = manager as unknown as { eloStrategy: unknown };
    const originalEloStrategy = managerWithPrivate.eloStrategy;
    managerWithPrivate.eloStrategy = null;
    manager.resetAnswered();
    const currentStepFallbackResult = selectOwlProblem(manager, owlConfig, null);
    manager.resetAnswered();
    const uninitializedFallbackResult = manager.getNextProblemELOAware('addition', impossibleOptions);
    managerWithPrivate.eloStrategy = originalEloStrategy;

    return {
        recentWindowFallbackPreserved,
        uninitializedFallbackPreserved: uninitializedFallbackResult === null,
        currentStepFallbackPreserved:
            currentStepFallbackResult !== null &&
            currentStepFallbackResult.curriculumStep <=
                LearnerStateManager.getInstance().getCurrentStep(currentStepFallbackResult.domain),
    };
}

function reviewRuntimeSelectorSmoke(materialized: MaterializationResult): ReviewSummary['runtimeSelectorSmoke'] {
    return withSeededRandom(stableHash('runtime-selector-smoke'), () => {
        const originalLog = console.log;
        const originalWarn = console.warn;
        console.log = (...args: unknown[]) => {
            const [firstArg] = args;
            if (typeof firstArg === 'string' && (
                firstArg.startsWith('[ELOAwareStrategy]') ||
                firstArg.startsWith('[MathProblemManager]') ||
                firstArg.startsWith('[ProblemPool]') ||
                firstArg.startsWith('[ELO]')
            )) {
                return;
            }
            originalLog(...args);
        };
        console.warn = (...args: unknown[]) => {
            const [firstArg] = args;
            if (typeof firstArg === 'string' && (
                firstArg.startsWith('[ELOAwareStrategy] No problems') ||
                firstArg.startsWith('[MathProblemManager]') ||
                firstArg.startsWith('[ProblemPool]')
            )) {
                return;
            }
            originalWarn(...args);
        };

        try {
        const profiles: Array<RuntimeSmokeProfile & { attempts: number; role: BatchReviewRoleGrade['role']; purpose: string; requireUnlockByEnd?: boolean }> = [
            {
                name: 'steady_child',
                successRate: 0.9,
                attempts: 50,
                role: 'role-game-designer',
                purpose: 'opening-path pacing',
                requireUnlockByEnd: false,
            },
            {
                name: 'struggling_child',
                successRate: 0.78,
                attempts: 50,
                role: 'role-qa-engineer',
                purpose: 'opening-path cliff detection',
                requireUnlockByEnd: false,
            },
            {
                name: 'depth_probe',
                successRate: 0.98,
                attempts: 160,
                role: 'Lead Producer',
                purpose: 'deeper local-safe coverage and unlock timing',
                requireUnlockByEnd: true,
            },
        ];
        const manager = MathProblemManager.getInstance();
        const pools = loadRuntimeProblemPools(materialized);
        const owlConfig = loadLiveOwlMathConfig();
        const owlSurface = buildOwlSurfaceSummary(materialized);
        const roleGrades: BatchReviewRoleGrade[] = [];
        const caveats = [
            'This smoke review exercises the shared owl-selection helper plus live learner-state and owl-config rails. It is runtime-aligned selector evidence, not the literal MathChallengeScene input and retry flow.',
            'It is not telemetry-backed pedagogical proof and it does not independently calibrate the fixed ELO bands to real child success rates.',
            `The 3000 headline is total shipped runtime inventory; the current owl rails expose ${owlSurface.owlEligibleProblemCount} local-safe rows overall, while a fresh profile currently reaches ${owlSurface.freshReachableProblemCount} step-capped rows across ${owlSurface.openingUnlockedDomains.join(', ')} and ${owlSurface.currentInteractionProblemCount} problems per owl interaction.`,
        ];
        let capBreaches = 0;
        let selectorCapBreaches = 0;
        let exhaustionCount = 0;
        let earlySubtractionUnlocks = 0;
        let maxOperandSeen = 0;
        let maxCurriculumStepSeen = 0;
        let depthUnlockMisses = 0;
        let followUpSelections = 0;
        let alternateFollowUpSelections = 0;
        const unlockMetrics: Record<string, number> = {};
        const subtractionSelectionMetrics: Record<string, number> = {};
        for (const runtimePool of pools) {
            manager.addPool(runtimePool.key, runtimePool.pool);
        }
        const fallbackSafety = verifyConstraintPreservingFallbacks(manager, owlConfig);
        manager.resetAnswered();

        for (const profile of profiles) {
            for (const runtimePool of pools) {
                manager.addPool(runtimePool.key, runtimePool.pool);
            }

            manager.resetAnswered();
            ELOManager.getInstance().initialize(undefined);
            const childId = `smoke-${profile.name}`;
            const familyId = 'smoke-family';
            LearnerStateManager.getInstance().initialize(
                { childId, familyId },
                undefined,
                ELOManager.getInstance().getStats(),
            );

            let profileGrade = 10;
            let firstSubtractionUnlockAttempt = -1;
            let firstSubtractionSelectionAttempt = -1;
            let localMaxOperand = 0;
            let localMaxCurriculumStep = 0;
            let encounterProblemIndex = 0;
            let previousEncounterDomain: MathDomain | null = null;
            let profileFollowUpSelections = 0;
            let profileAlternateFollowUps = 0;

            for (let attempt = 0; attempt < profile.attempts; attempt++) {
                if (firstSubtractionUnlockAttempt === -1 && LearnerStateManager.getInstance().isDomainUnlocked('subtraction')) {
                    firstSubtractionUnlockAttempt = attempt;
                }

                const currentDomainStep = LearnerStateManager.getInstance().getCurrentStep('addition');
                const previousProblemDomain: MathDomain | null = encounterProblemIndex > 0 ? previousEncounterDomain : null;
            const problem = selectOwlProblem(manager, owlConfig, previousProblemDomain);

                if (!problem) {
                    exhaustionCount++;
                    profileGrade -= 1.5;
                    break;
                }

                if (previousProblemDomain) {
                    followUpSelections++;
                    profileFollowUpSelections++;
                    if (problem.domain !== previousProblemDomain) {
                        alternateFollowUpSelections++;
                        profileAlternateFollowUps++;
                    }
                }

                const verifiedTraits = deriveVerifiedDifficultyTraits(problem);
                const visibleMaxOperand = verifiedTraits?.maxOperand ?? problem.difficultyTraits?.maxOperand ?? 0;
                maxOperandSeen = Math.max(maxOperandSeen, visibleMaxOperand);
                maxCurriculumStepSeen = Math.max(maxCurriculumStepSeen, problem.curriculumStep);
                localMaxOperand = Math.max(localMaxOperand, visibleMaxOperand);
                localMaxCurriculumStep = Math.max(localMaxCurriculumStep, problem.curriculumStep);

                if (visibleMaxOperand > (owlConfig.maxOperand ?? Number.POSITIVE_INFINITY)) {
                    capBreaches++;
                    profileGrade -= 2;
                }

                // The live selector may serve one step above current via the
                // gated stretch lane, so the rail is currentStep + 1.
                const allowedStep = LearnerStateManager.getInstance().getCurrentStep(problem.domain) + 1;
                if (problem.curriculumStep > allowedStep || problem.curriculumStep > owlConfig.maxCurriculumStep) {
                    selectorCapBreaches++;
                    profileGrade -= 1.5;
                }

                if (
                    problem.difficulty < owlConfig.difficultyRange[0] ||
                    problem.difficulty > owlConfig.difficultyRange[1]
                ) {
                    selectorCapBreaches++;
                    profileGrade -= 1.5;
                }

                if (problem.domain === 'subtraction' && firstSubtractionSelectionAttempt === -1) {
                    firstSubtractionSelectionAttempt = attempt + 1;
                }

                const meta = manager.consumeSelectionMeta(problem.id) ?? { lane: 'comfort', reviewItemId: null };
                const problemELO = manager.getPoolManager()?.getProblemELO(problem.id) ?? computeInitialProblemELO(problem.difficulty);
                const success = ((attempt * 17) + stableHash(`${profile.name}|${problem.id}|${currentDomainStep}`)) % 100 < profile.successRate * 100;
                ELOManager.getInstance().updateRating(problem.domain, problemELO, success ? 1 : 0);
                LearnerStateManager.getInstance().recordAttempt(
                    buildSmokeAttempt(childId, familyId, problem, problemELO, meta.lane, meta.reviewItemId, success, Date.now() + attempt),
                );

                if (success && encounterProblemIndex + 1 < owlConfig.problemCount) {
                    encounterProblemIndex++;
                    previousEncounterDomain = problem.domain;
                } else {
                    encounterProblemIndex = 0;
                    previousEncounterDomain = null;
                }

                if (firstSubtractionUnlockAttempt === -1 && LearnerStateManager.getInstance().isDomainUnlocked('subtraction')) {
                    firstSubtractionUnlockAttempt = attempt + 1;
                }
            }

            unlockMetrics[profile.name] = firstSubtractionUnlockAttempt;
            subtractionSelectionMetrics[profile.name] = firstSubtractionSelectionAttempt;

            if (profile.name !== 'depth_probe' && firstSubtractionUnlockAttempt !== -1 && firstSubtractionUnlockAttempt < 20) {
                earlySubtractionUnlocks++;
                profileGrade -= 0.75;
            }

            if (profile.requireUnlockByEnd && firstSubtractionUnlockAttempt === -1) {
                depthUnlockMisses++;
                profileGrade -= 1;
            }

            // One problem per owl encounter is the deliberate baseline (a
            // future gated NPC may raise problemCount), so interaction length
            // is no longer graded.

            if ((owlSurface.owlAdditionByStep[0]?.uniqueFactCount ?? 0) < 3) {
                profileGrade -= profile.name === 'depth_probe' ? 0.5 : 0.3;
            }

            if (owlSurface.freshReachableAdditionFactCount < 3) {
                profileGrade -= profile.name === 'depth_probe' ? 0.6 : 0.4;
            }

            if (owlSurface.freshReachableUniqueFactCount < 6) {
                profileGrade -= profile.name === 'depth_probe' ? 0.6 : 0.4;
            }

            if (owlSurface.freshReachableCountingFactCount < 2) {
                profileGrade -= profile.role === 'role-game-designer' ? 0.4 : 0.2;
            }

            if (profileFollowUpSelections >= 4) {
                const followUpAlternateRate = profileAlternateFollowUps / profileFollowUpSelections;
                if (followUpAlternateRate < 0.45) {
                    profileGrade -= profile.role === 'role-game-designer' ? 0.6 : 0.3;
                }
            }

            if (profile.name === 'depth_probe') {
                if (localMaxCurriculumStep < 6) {
                    profileGrade -= 0.4;
                }
                if (localMaxOperand < 10) {
                    profileGrade -= 0.3;
                }
            }

            roleGrades.push({
                role: profile.role,
                grade: roundTo(clamp(profileGrade, 0, 10), 1),
                rationale: profile.role === 'role-game-designer'
                    ? 'Steady child checks the opening owl path for gentle pacing without early cliffs.'
                    : profile.role === 'role-qa-engineer'
                        ? 'Struggling child verifies the shipped local-safe rails stay soft under misses and review pressure.'
                        : 'Depth probe checks actual unlock timing and deeper local-safe selector coverage, not just the opening few facts.',
            });
        }

        const averageGrade = roundTo(roleGrades.reduce((sum, entry) => sum + entry.grade, 0) / roleGrades.length, 1);
        const devilAdvocatePassed = capBreaches === 0
            && selectorCapBreaches === 0
            && earlySubtractionUnlocks === 0
            && exhaustionCount === 0
            && depthUnlockMisses === 0
            && fallbackSafety.recentWindowFallbackPreserved
            && fallbackSafety.uninitializedFallbackPreserved
            && fallbackSafety.currentStepFallbackPreserved;

        return {
            accepted: averageGrade >= 9.0 && roleGrades.every(entry => entry.grade >= 8.5) && devilAdvocatePassed,
            averageGrade,
            summary: `Runtime-aligned owl selector smoke covered the opening path plus a deeper progression probe, with ${capBreaches} operand-cap breaches, ${selectorCapBreaches} selector-cap breaches, ${earlySubtractionUnlocks} early subtraction unlocks, ${depthUnlockMisses} missed depth unlocks, and ${exhaustionCount} exhaustion events.`,
            metrics: {
                capBreaches,
                selectorCapBreaches,
                earlySubtractionUnlocks,
                depthUnlockMisses,
                exhaustionCount,
                recentWindowFallbackPreserved: fallbackSafety.recentWindowFallbackPreserved,
                uninitializedFallbackPreserved: fallbackSafety.uninitializedFallbackPreserved,
                currentStepFallbackPreserved: fallbackSafety.currentStepFallbackPreserved,
                maxOperandSeen,
                maxCurriculumStepSeen,
                followUpSelections,
                alternateFollowUpSelections,
                followUpAlternateRate: followUpSelections > 0
                    ? roundTo(alternateFollowUpSelections / followUpSelections, 2)
                    : 1,
                steadyFirstSubtractionUnlockAttempt: unlockMetrics.steady_child,
                strugglingFirstSubtractionUnlockAttempt: unlockMetrics.struggling_child,
                depthProbeFirstSubtractionUnlockAttempt: unlockMetrics.depth_probe,
                steadyFirstSubtractionSelectionAttempt: subtractionSelectionMetrics.steady_child,
                strugglingFirstSubtractionSelectionAttempt: subtractionSelectionMetrics.struggling_child,
                depthProbeFirstSubtractionSelectionAttempt: subtractionSelectionMetrics.depth_probe,
                owlEligibleProblemCount: owlSurface.owlEligibleProblemCount,
                owlEligibleUniquePromptCount: owlSurface.owlEligibleUniquePromptCount,
                owlEligibleUniqueFactCount: owlSurface.owlEligibleUniqueFactCount,
                openingUnlockedInventoryProblemCount: owlSurface.openingUnlockedInventoryProblemCount,
                openingUnlockedInventoryUniquePromptCount: owlSurface.openingUnlockedInventoryUniquePromptCount,
                openingUnlockedInventoryUniqueFactCount: owlSurface.openingUnlockedInventoryUniqueFactCount,
                freshReachableProblemCount: owlSurface.freshReachableProblemCount,
                freshReachableUniquePromptCount: owlSurface.freshReachableUniquePromptCount,
                freshReachableUniqueFactCount: owlSurface.freshReachableUniqueFactCount,
                freshReachableAdditionFactCount: owlSurface.freshReachableAdditionFactCount,
                freshReachableCountingFactCount: owlSurface.freshReachableCountingFactCount,
                openingAdditionStep0Facts: owlSurface.owlAdditionByStep[0]?.uniqueFactCount ?? 0,
                openingAdditionStep1Facts: owlSurface.owlAdditionByStep[1]?.uniqueFactCount ?? 0,
                openingAdditionStep2Facts: owlSurface.owlAdditionByStep[2]?.uniqueFactCount ?? 0,
                interactionProblemCount: owlSurface.currentInteractionProblemCount,
                owlDomains: owlConfig.domains.join(','),
                openingUnlockedDomains: owlSurface.openingUnlockedDomains.join(','),
            },
            roleGrades,
            devilAdvocate: {
                passed: devilAdvocatePassed,
                note: devilAdvocatePassed
                    ? 'Devils Advocate: the runtime-aligned owl selector path stayed inside its local-safe rails, preserved fallback constraints, and the deeper probe unlocked subtraction without breaching caps.'
                    : 'Devils Advocate: the runtime-aligned owl selector path still has a rail breach, dropped a fallback constraint, overstates fresh-profile reachability, missed deeper unlock, or exhausted too early.',
            },
            caveats,
        };
        } finally {
            console.log = originalLog;
            console.warn = originalWarn;
        }
    });
}

export function reviewMaterializedMathBatches(result?: MaterializationResult): ReviewSummary {
    const materialized = result ?? materializeMathBatches();
    const bands = loadBandTable();
    const bandLookup = new Map(bands.bands.map(band => [band.id, band]));
    const protectedPromptKeys = new Set(
        [...loadProtectedRuntimeProblems(), ...materialized.seedProblems].map(problem => buildPromptUniquenessKey(problem.prompt.text)),
    );
    const batchReviews = materialized.materializedBatches.map(batch =>
        buildBatchReview(batch.batch, batch.problems, bandLookup, protectedPromptKeys),
    );
    const acceptedReviews = batchReviews.filter(review => review.accepted);
    const domainTotals: Record<string, number> = {};
    const runtimePools = loadRuntimeProblemPools(materialized);

    for (const runtimePool of runtimePools) {
        for (const problem of runtimePool.pool.problems) {
            domainTotals[problem.domain] = (domainTotals[problem.domain] ?? 0) + 1;
        }
    }

    const runtimeSelectorSmoke = reviewRuntimeSelectorSmoke(materialized);
    const owlSurface = buildOwlSurfaceSummary(materialized);

    return {
        reviewMethod: {
            kind: 'computed_rubric',
            independentReview: false,
            note: 'This is a deterministic repository-side review stack. It proves mechanical consistency and local-safe runtime rail coverage, not telemetry-backed pedagogy or independent ELO calibration.',
        },
        generatedProblemCount: materialized.generatedProblems.length,
        acceptedBatchCount: acceptedReviews.length,
        averageAcceptedGrade: acceptedReviews.length > 0
            ? roundTo(acceptedReviews.reduce((sum, review) => sum + review.averageGrade, 0) / acceptedReviews.length, 2)
            : 0,
        domainTotals,
        owlSurface,
        batchReviews,
        runtimeSelectorSmoke,
    };
}

export function writeMathAuthoringOutputs(): { materialization: MaterializationResult; review: ReviewSummary } {
    const materialization = materializeMathBatches();
    const review = reviewMaterializedMathBatches(materialization);

    if (!existsSync(REPORTS_DIR)) {
        mkdirSync(REPORTS_DIR, { recursive: true });
    }

    writeJson(join(DATA_DIR, 'problems_curriculum.json'), materialization.curriculumPool);
    writeJson(join(REPORTS_DIR, 'review-summary.json'), review);
    writeJson(join(REPORTS_DIR, 'runtime-selector-smoke.json'), review.runtimeSelectorSmoke);
    writeJson(join(REPORTS_DIR, 'owl-surface-summary.json'), review.owlSurface);

    for (const batchReview of review.batchReviews) {
        writeJson(join(REPORTS_DIR, 'batches', `${batchReview.batchId}.json`), batchReview);
    }

    return { materialization, review };
}
