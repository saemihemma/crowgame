// ============================================================
// Level System
// ============================================================

export interface LevelRegistryEntry {
    key: string;
    name: string;
    mapFile: string;
    tilesetImages: Record<string, string>;
    music?: string;
    unlockRequirement: { level: string; minStars: number } | null;
    order: number;
    /** The level's math identity: which domains its owls draw from and the
     *  difficulty band they stay inside. Authored in the level spec and
     *  mirrored into the registry so the runtime can read it. */
    mathGating?: {
        skills: string[];
        difficultyBand: [number, number];
    };
}

export interface LevelRegistry {
    levels: LevelRegistryEntry[];
}

export interface LevelSpecPlatform {
    type: 'ground' | 'platform';
    x: number;
    width: number;
    y: number;
    gap_before?: number;
}

export interface LevelSpecSpawns {
    player: { x: number; y: number };
    npcs: Array<{ npc_id: string; x: number; y: number }>;
    collectibles: Array<{ type: string; x: number; y: number }>;
}

export interface LevelSpec {
    id: string;
    name: string;
    theme: string;
    difficulty: number;
    music?: string;
    criticalPath: {
        length: 'short' | 'medium' | 'long';
        motifs: string[];
    };
    platforms: LevelSpecPlatform[];
    spawns: LevelSpecSpawns;
    hazards?: Array<{ type: string; x: number; y: number; width?: number; height?: number }>;
    enemies?: Array<{ enemy_id: string; x: number; y: number }>;
    exits: Array<{ x: number; y: number; target_level: string }>;
    mathGating?: {
        skills: string[];
        difficultyBand: [number, number];
    };
}

// ============================================================
// NPC System
// ============================================================

export type NPCBehaviorType = 'math_challenger' | 'talker' | 'shopkeeper' | 'quest_giver';

export interface NPCComponentConfig {
    type: string;
    [key: string]: unknown;
}

export interface NPCDefinition {
    id: string;
    name: string;
    spriteKey: string;
    spritesheet: string;
    frameWidth: number;
    frameHeight: number;
    behavior: NPCBehaviorType;
    components: NPCComponentConfig[];
    behaviorConfig: Record<string, unknown>;
}

export interface NPCRegistry {
    npcs: NPCDefinition[];
}

// ============================================================
// Math System
// ============================================================

export type MathDomain =
    | 'addition'
    | 'subtraction'
    | 'multiplication'
    | 'division'
    | 'counting'
    | 'comparison'
    | 'pattern_matching'
    | 'number_sequence';

export type AnswerModeType = 'mcq' | 'numeric_input' | 'sequence' | 'drag_drop';

export interface MCQAnswer {
    mode: 'mcq';
    correct: number;
    options: number[];
    distractors_rationale?: string[];
}

export interface NumericInputAnswer {
    mode: 'numeric_input';
    correct: number;
    tolerance?: number;
}

export interface SequenceAnswer {
    mode: 'sequence';
    correct: number[];
}

export type AnswerSpec = MCQAnswer | NumericInputAnswer | SequenceAnswer;

export interface ProblemPrompt {
    text: string;
    assets?: string | null;
}

export interface ProblemDifficultyTraits {
    maxOperand: number;
    requiresCarry?: boolean;
    requiresBorrow?: boolean;
}

export interface ProblemGenerator {
    template: string;
    params: Record<string, unknown>;
    evaluator: string;
}

/**
 * A reference into the i18n bundles for one localisable sentence.
 *
 * `params` carries no natural language -- numbers, the operator symbol, a glyph
 * run ("o o o"), a comma-joined number list. A `math.prompt.wrap.*` key takes an
 * `inner` that is either a wordless string ("12 - 5 =") or a nested reference,
 * which is how a prefixed prompt ("Borrow and solve: How much is 18 - 9?")
 * composes out of two templates instead of needing one per combination.
 */
export interface PhrasingRef {
    key: string;
    params: Record<string, number | string | PhrasingRef>;
    /**
     * Name of the parameter that drives plural agreement, when the phrasing has
     * one. The category itself is NOT stored: each locale applies its own rule
     * at render time, because they differ -- English inflects at 1, Icelandic at
     * 1, 21, 31 and so on.
     */
    plural?: string;
}

/**
 * Localised phrasing for a problem's three sentences.
 *
 * Additive and optional by design. `prompt.text`, `hint` and `explanation` stay
 * canonical English because tools/math_verifier.ts, src/math/problemReplayKey.ts
 * and the golden fixtures all read them. A renderer prefers the phrasing when its
 * key resolves and falls back to the English text otherwise, so an absent or
 * unresolvable entry degrades to today's behaviour.
 */
export interface ProblemPhrasing {
    prompt?: PhrasingRef;
    hint?: PhrasingRef;
    explanation?: PhrasingRef;
}

export interface MathProblem {
    id: string;
    domain: MathDomain;
    skills: string[];
    difficulty: number;
    curriculumStep: number;
    ageBand?: [number, number];
    difficultyTraits?: ProblemDifficultyTraits;
    prompt: ProblemPrompt;
    answer: AnswerSpec;
    hint?: string;
    explanation?: string;
    misconceptionTags?: string[];
    generator?: ProblemGenerator | null;
    phrasing?: ProblemPhrasing;
}

export interface MathProblemPool {
    problems: MathProblem[];
}

// ============================================================
// ELO Rating System
// ============================================================

export interface PlayerELOStats {
    globalELO: number;                    // Overall math ability (200-1200)
    domainModifiers: {                     // Per-domain adjustments (-100 to +100)
        addition: number;
        subtraction: number;
        multiplication: number;
        division: number;
        counting: number;
        comparison: number;
        pattern_matching: number;
        number_sequence: number;
    };
    problemsAttempted: number;             // Total count for K-factor calculation
    lastUpdated: number;                   // Timestamp
}

export interface ELOUpdateResult {
    newGlobalELO: number;
    newDomainModifier: number;
    change: number;                        // Delta from previous rating
    expectedScore: number;                 // 0.0-1.0 probability
}

export interface ProblemELORating {
    problemId: string;
    eloRating: number;                     // Difficulty rating (200-1200)
    attempts: number;                      // Number of times attempted by all players
    successRate: number;                   // Historical success rate (0.0-1.0)
}

export type DomainNumberMap = Record<MathDomain, number>;
export type SelectionLane = 'comfort' | 'review' | 'at_level' | 'stretch';
export type ReviewStage = 'immediate' | 'day_1' | 'day_3' | 'day_7' | 'graduated';
export type LearnerSyncStatus = 'local-only' | 'pending' | 'synced' | 'error';

export interface AdaptiveProblemSelectionOptions {
    difficultyRange?: [number, number];
    maxCurriculumStep?: number;
    maxOperand?: number;
    excludedReplayKeys?: string[];
}

export interface CurriculumStepResult {
    step: number;
    correct: boolean;
    firstAttempt: boolean;
    answeredAt: number;
}

export interface DomainCurriculumProgress {
    currentStep: number;
    winsAtCurrentStep: number;
    recentStepResults: CurriculumStepResult[];
    /** Lifetime attempts in this domain. Zero means the child has never met
     *  it — the signal that triggers the worked-example teaching window. */
    totalAttempts: number;
}

export type DomainCurriculumProgressMap = Record<MathDomain, DomainCurriculumProgress>;

export interface ReviewItem {
    id: string;
    skill: string;
    domain: MathDomain;
    sourceProblemId: string;
    anchorProblemELO: number;
    stage: ReviewStage;
    dueAt: number | null;
    dueAfterAttempt: number | null;
    successfulReviews: number;
    lastOutcome: 'correct' | 'wrong';
    updatedAt: number;
}

export interface LearnerAttemptRecord {
    id: string;
    problemId: string;
    domain: MathDomain;
    skills: string[];
    correct: boolean;
    firstAttempt: boolean;
    hintsUsed: number;
    responseMs: number;
    answeredAt: number;
    problemELO: number;
    curriculumStep: number;
    selectionLane: SelectionLane;
    reviewItemId: string | null;
}

export interface LearnerDomainHistory {
    backlogHistory: number[];
}

export type LearnerDomainHistoryMap = Record<MathDomain, LearnerDomainHistory>;

export interface LearnerFrustrationFlags {
    repeatMisses: boolean;
    responseTimeSpike: boolean;
    repeatedHints: boolean;
    lowConfidence: boolean;
}

export interface LearnerDomainSummary {
    domain: MathDomain;
    masteryELO: number;
    confidenceOffset: number;
    effectiveSelectionELO: number;
    currentStep: number;
    winsAtCurrentStep: number;
    firstAttemptAccuracy: number;
    recentProblemCount: number;
    activeReviewCount: number;
    backlogTrend: 'growing' | 'stable' | 'shrinking';
    unlocked: boolean;
}

export interface LearnerSummary {
    firstAttemptAccuracy: number;
    currentMasteryByDomain: DomainNumberMap;
    activeReviewSkills: string[];
    frustrationFlags: LearnerFrustrationFlags;
    domains: LearnerDomainSummary[];
}

export interface LearnerSnapshot {
    childId: string;
    familyId: string;
    mastery: PlayerELOStats;
    confidenceOffsets: DomainNumberMap;
    curriculumProgress: DomainCurriculumProgressMap;
    reviewItems: ReviewItem[];
    recentAttempts: LearnerAttemptRecord[];
    recentProblemIds: string[];
    domainHistory: LearnerDomainHistoryMap;
    unlockState: Partial<Record<MathDomain, boolean>>;
    latestSyncCursor: string | null;
    lastSyncedAt: number | null;
    syncStatus: LearnerSyncStatus;
    summary: LearnerSummary;
}

export interface LearnerAttemptSubmission {
    attemptId: string;
    childId: string;
    familyId: string;
    problemId: string;
    domain: MathDomain;
    skills: string[];
    correct: boolean;
    firstAttempt: boolean;
    hintsUsed: number;
    responseMs: number;
    answeredAt: number;
    problemELO: number;
    curriculumStep: number;
    selectionLane: SelectionLane;
    reviewItemId: string | null;
}

export interface LearnerSyncResult {
    snapshot: LearnerSnapshot;
    appliedAttemptIds: string[];
    latestSyncCursor: string | null;
}

// ============================================================
// Player Tuning & Abilities
// ============================================================

export interface PlayerTuningData {
    accel: number;
    drag: number;
    maxSpeed: number;
    jumpVelocity: number;
    coyoteMs: number;
    jumpBufferMs: number;
    gravityScale: number;
    terminalVelocity: number;
}

export interface AbilityDefinition {
    id: string;
    name: string;
    description: string;
    grantedBy: string[];
    persistent: boolean;
}

export interface AbilitiesData {
    abilities: AbilityDefinition[];
}

export interface TuningModifierData {
    id: string;
    property: keyof PlayerTuningData;
    operation: 'add' | 'multiply';
    value: number;
    duration?: number | null;
}

// ============================================================
// Animation
// ============================================================

export interface AnimationEntry {
    key: string;
    priority: number;
}

export interface AnimationTransition {
    from: string;
    to: string;
    when: string;
}

export interface AnimationMapData {
    animationMap: Record<string, AnimationEntry>;
    transitions: AnimationTransition[];
}

export interface AnimationState {
    grounded: boolean;
    vx: number;
    vy: number;
    isJumping: boolean;
    isFalling: boolean;
    isDashing: boolean;
    isHurt: boolean;
    [key: string]: boolean | number;
}

// ============================================================
// Input
// ============================================================

export interface InputState {
    left: boolean;
    right: boolean;
    up: boolean;
    jumpJustPressed: boolean;
    jumpHeld: boolean;
    interact: boolean;
    shoot: boolean;
}

// ============================================================
// Save Data
// ============================================================

export interface SaveData {
    version: number;
    currentLevel: string;
    completedLevels: string[];
    coins: number;
    stars: number;
    owlsSaved: number;
    xp: number;
    playerLevel: number;
    inventory: string[];
    activeAbilities: string[];
    mathStats: {
        totalCorrect: number;
        totalWrong: number;
        bySkill: Record<string, { correct: number; wrong: number; avgTimeMs: number }>;
    };
    eloStats?: PlayerELOStats;  // Optional for backward compatibility
    learnerState?: LearnerSnapshot;
    telemetry: {
        hintUsage: number;
        problemsAttempted: number;
        answeredProblemIds: string[];
    };
    settings: {
        musicVolume: number;
        sfxVolume: number;
    };
    timestamp: number;
}
