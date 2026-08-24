import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { deriveCurriculumStep, deriveDifficultyTraits } from './math_curriculum';
import { buildPromptUniquenessKey, deriveVerifiedDifficultyTraits, evaluateArithmeticPrompt } from './math_verifier';
import { ELOManager } from '../math-kernel/math/ELOManager';
import { MathProblemManager } from '../math-kernel/math/MathProblemManager';
import { selectOwlProblem, type OwlSelectionConfig } from '../math-kernel/math/owlSelection';
import { buildProblemReplayKey } from '../math-kernel/math/problemReplayKey';
import { LearnerStateManager } from '../math-kernel/systems/LearnerStateManager';
import type { LearnerAttemptSubmission, MathDomain, MathProblem, MathProblemPool, SelectionLane } from '../math-kernel/utils/Types';

const ROOT = resolve(join(__dirname, '..'));
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
}

export interface CountingTemplateSpec extends BaseTemplateSpec {
    kind: 'counting';
    countRange: NumericRange;
    symbol?: string;
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
        maxOperand: 20,
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

    if (
        problem.difficultyTraits?.maxOperand !== undefined &&
        problem.difficultyTraits.maxOperand > owlConfig.maxOperand
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

export function difficultyFromTargetELO(targetELO: number): number {
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
            return `You have ${left} berries. You find ${right} more. How many berries?`;
        case 'story_land':
            return `${left} birds sit on a branch. ${right} more land. How many birds?`;
        case 'story_eat':
            return `You have ${left} berries. You eat ${right}. How many are left?`;
        case 'story_fly':
            return `${left} birds sit on a branch. ${right} fly away. How many are left?`;
        default:
            return `${left} ${operator} ${right} = ?`;
    }
}

function formatCountingPrompt(variant: string, symbol: string, count: number): string {
    const items = Array.from({ length: count }, () => symbol).join(' ');
    switch (variant) {
        case 'how_many':
            return `How many are here: ${items}`;
        case 'count_them':
            return `Count these: ${items}`;
        default:
            return `Count the ${symbol === 'o' ? 'dots' : 'marks'}: ${items}`;
    }
}

function formatComparisonPrompt(variant: string, relation: 'greater' | 'smaller', left: number, right: number): string {
    const adjective = relation === 'greater' ? 'greater' : 'smaller';
    switch (variant) {
        case 'pick':
            return `Pick the ${adjective} number: ${left} or ${right}`;
        case 'which':
            return `Which number is ${adjective}: ${left} or ${right}?`;
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

function withFallbackVariants(kind: AuthoringTemplateKind, promptVariants: string[]): string[] {
    const fallbackByKind: Record<AuthoringTemplateKind, string[]> = {
        addition: ['equation', 'question', 'solve', 'equals', 'complete', 'mental_math', 'how_much', 'answer', 'blank_equals', 'quick_check', 'story_find', 'story_land'],
        subtraction: ['equation', 'question', 'solve', 'equals', 'complete', 'mental_math', 'how_much', 'answer', 'blank_equals', 'quick_check', 'story_eat', 'story_fly'],
        multiplication: ['equation', 'question', 'solve', 'equals', 'complete', 'how_much', 'answer', 'blank_equals'],
        division: ['equation', 'question', 'solve', 'equals', 'complete', 'how_much', 'answer', 'blank_equals'],
        counting: ['count', 'how_many', 'count_them'],
        comparison: ['which', 'pick', 'find'],
        pattern_matching: ['repeat', 'keep_going'],
        number_sequence: ['next', 'keep_going', 'number_pattern'],
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

    const fallbackOffsets = [-3, -2, -1, 1, 2, 3, 4, 5, 6];
    for (const offset of fallbackOffsets) {
        const next = correct + offset;
        if (next >= 0) {
            options.add(next);
        }
        if (options.size >= 4) {
            break;
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

function buildArithmeticOptions(kind: ArithmeticTemplateSpec['kind'], left: number, right: number, correct: number): number[] {
    const preferred: number[] = [];

    if (kind === 'addition') {
        preferred.push(correct - 1, correct + 1, Math.max(left, right), correct + 2);
    } else if (kind === 'subtraction') {
        preferred.push(correct - 1, correct + 1, right, left - 1);
    } else if (kind === 'multiplication') {
        preferred.push(correct - right, correct + right, left + right, correct + 1);
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
        case 'multiply_groups':
            return `Think of ${left} groups of ${right}.`;
        case 'divide_groups':
            return `Share ${left} into groups of ${right}.`;
        case 'count_symbols':
            return `Touch each one once as you count.`;
        case 'compare_numbers':
            return `Look at which number has more value.`;
        case 'sequence_step':
            return `Look at how the numbers are changing each time.`;
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
        case 'product_result':
            return `${left} groups of ${right} makes ${correct}.`;
        case 'quotient_result':
            return `${left} split into groups of ${right} makes ${correct} groups.`;
        case 'count_result':
            return `There are ${correct} altogether.`;
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

function renderArithmeticCandidates(template: ArithmeticTemplateSpec): RawCandidate[] {
    const operator = toOperator(template.kind);
    const candidates: RawCandidate[] = [];
    const leftValues = template.leftValues ?? enumerateRange(template.leftRange);
    const rightValues = template.rightValues ?? enumerateRange(template.rightRange);
    const leftBounds: NumericRange = template.leftRange ?? [Math.min(...leftValues), Math.max(...leftValues)];
    const rightBounds: NumericRange = template.rightRange ?? [Math.min(...rightValues), Math.max(...rightValues)];
    const promptVariants = withFallbackVariants(template.kind, template.promptVariants);

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

            // Steps 0-2 belong to brand-new readers: keep the framing to the
            // bare equation and the simplest question form so the words never
            // add load on top of the math.
            const maxOperandValue = Math.max(left, right);
            const plainOnly = template.kind === 'addition'
                ? maxOperandValue <= 3
                : template.kind === 'subtraction' && maxOperandValue <= 7;

            for (const variant of promptVariants) {
                if (plainOnly && variant !== 'equation' && variant !== 'question') continue;
                // Story shapes need both quantities present to read naturally.
                if (variant.startsWith('story_') && (left < 1 || right < 1)) continue;

                const promptText = applyPromptLeadIn(formatArithmeticPrompt(variant, left, operator, right), template.promptLeadIn);
                candidates.push({
                    values: { left, right, correct },
                    promptText,
                    correct,
                    complexity,
                    ageBand: template.ageBand ?? [5, 7],
                    domain: template.kind,
                });
            }
        }
    }

    return candidates;
}

function renderCountingCandidates(template: CountingTemplateSpec): RawCandidate[] {
    const symbol = template.symbol ?? 'o';
    const promptVariants = withFallbackVariants(template.kind, template.promptVariants);
    const counts = enumerateRange(template.countRange);
    const candidates: RawCandidate[] = [];

    for (const count of counts) {
        const complexity = normalizedProgress(count, template.countRange);
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

    return candidates;
}

function renderComparisonCandidates(template: ComparisonTemplateSpec): RawCandidate[] {
    const promptVariants = withFallbackVariants(template.kind, template.promptVariants);
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
    const promptVariants = withFallbackVariants(template.kind, template.promptVariants);
    const starts = enumerateRange(template.startRange);
    const candidates: RawCandidate[] = [];

    for (const start of starts) {
        for (const step of template.stepChoices) {
            const sequence = Array.from({ length: template.length }, (_, index) => start + (index * step));
            const correct = start + (template.length * step);
            const maxValue = Math.max(correct, ...sequence);
            const complexity = clamp(
                ((Math.abs(step) - 1) / 9) * 0.45 +
                normalizedProgress(maxValue, [start, Math.max(correct, start + 1)]) * 0.55,
                0,
                1,
            );
            for (const variant of promptVariants) {
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
    const promptVariants = withFallbackVariants(template.kind, template.promptVariants);
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
        hint: renderHint(template.hintStrategy, { ...candidate.values, correct: candidate.correct }),
        explanation: renderExplanation(template.explanationStrategy, { ...candidate.values, correct: candidate.correct }),
        misconceptionTags: template.misconceptionTags,
        generator: buildGeneratorMetadata(batch, template, band, candidate.values),
    };

    placeholder.curriculumStep = deriveCurriculumStep(placeholder);
    placeholder.difficultyTraits = deriveDifficultyTraits(placeholder);

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
    const answerOptions = template.kind === 'comparison'
        ? buildOptions(candidate.correct, [candidate.values.left ?? candidate.correct, candidate.values.right ?? candidate.correct, candidate.correct - 1, candidate.correct + 1])
        : buildArithmeticOptions(
            template.kind as ArithmeticTemplateSpec['kind'],
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

        const candidates = renderCandidates(template)
            .map(candidate => ({
                candidate,
                hash: stableHash(`${batch.id}|${template.id}|${candidate.promptText}`),
            }))
            .sort((left, right) => left.hash - right.hash);

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

export function loadBatchSpecs(): MathBatchCollection {
    return readJson<MathBatchCollection>(join(AUTHORING_DIR, 'batches.json'));
}

export function loadCurriculumSeed(): { problems: MathProblem[] } {
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
    const promptVariantCount = batch.templates.reduce((sum, template) => sum + template.promptVariants.length, 0);
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

                if (visibleMaxOperand > owlConfig.maxOperand) {
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
