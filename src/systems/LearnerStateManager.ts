import { ELOManager } from '../math/ELOManager';
import type {
    DomainCurriculumProgressMap,
    DomainNumberMap,
    LearnerAttemptSubmission,
    LearnerDomainHistoryMap,
    LearnerDomainSummary,
    LearnerSnapshot,
    LearnerSummary,
    MathDomain,
    PlayerELOStats,
    ReviewItem,
} from '../utils/Types';
import type { UserProfile } from './ProfileManager';

const ALL_MATH_DOMAINS: MathDomain[] = [
    'addition',
    'subtraction',
    'multiplication',
    'division',
    'counting',
    'comparison',
    'pattern_matching',
    'number_sequence',
];

const MAX_RECENT_ATTEMPTS = 40;
const MAX_RECENT_PROBLEMS = 12;
const MAX_BACKLOG_HISTORY = 8;
const MAX_STEP_RESULTS = 10;
const IMMEDIATE_REVIEW_MIN_GAP = 2;
const IMMEDIATE_REVIEW_MAX_GAP = 4;
const PROMOTION_WIN_TARGET = 3;
const PROMOTION_ACCURACY_TARGET = 0.8;
const PROMOTION_ACCURACY_WINDOW = 10;
const DEMOTION_WINDOW = 5;
const DEMOTION_WRONG_THRESHOLD = 2;
const DEMOTION_CONFIDENCE_THRESHOLD = -25;
const POST_DEMOTION_CONFIDENCE_FLOOR = -10;
const PROMOTION_STEP_SCAN_LIMIT = 20;

const DOMAIN_PREREQUISITES: Partial<Record<MathDomain, MathDomain[]>> = {
    addition: [],
    subtraction: ['addition'],
    multiplication: ['addition'],
    division: ['multiplication'],
    counting: [],
    comparison: ['addition'],
    pattern_matching: ['counting'],
    number_sequence: ['addition'],
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function createDomainNumberMap(initialValue = 0): DomainNumberMap {
    return {
        addition: initialValue,
        subtraction: initialValue,
        multiplication: initialValue,
        division: initialValue,
        counting: initialValue,
        comparison: initialValue,
        pattern_matching: initialValue,
        number_sequence: initialValue,
    };
}

function createDomainHistoryMap(): LearnerDomainHistoryMap {
    return {
        addition: { backlogHistory: [] },
        subtraction: { backlogHistory: [] },
        multiplication: { backlogHistory: [] },
        division: { backlogHistory: [] },
        counting: { backlogHistory: [] },
        comparison: { backlogHistory: [] },
        pattern_matching: { backlogHistory: [] },
        number_sequence: { backlogHistory: [] },
    };
}

function createCurriculumProgressMap(): DomainCurriculumProgressMap {
    return {
        addition: { currentStep: 2, winsAtCurrentStep: 0, recentStepResults: [] },
        subtraction: { currentStep: 0, winsAtCurrentStep: 0, recentStepResults: [] },
        multiplication: { currentStep: 0, winsAtCurrentStep: 0, recentStepResults: [] },
        division: { currentStep: 0, winsAtCurrentStep: 0, recentStepResults: [] },
        counting: { currentStep: 2, winsAtCurrentStep: 0, recentStepResults: [] },
        comparison: { currentStep: 0, winsAtCurrentStep: 0, recentStepResults: [] },
        pattern_matching: { currentStep: 0, winsAtCurrentStep: 0, recentStepResults: [] },
        number_sequence: { currentStep: 0, winsAtCurrentStep: 0, recentStepResults: [] },
    };
}

function cloneSnapshot(snapshot: LearnerSnapshot): LearnerSnapshot {
    return JSON.parse(JSON.stringify(snapshot)) as LearnerSnapshot;
}

function generateId(prefix: string): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function getReviewGap(): number {
    return IMMEDIATE_REVIEW_MIN_GAP + Math.floor(Math.random() * (IMMEDIATE_REVIEW_MAX_GAP - IMMEDIATE_REVIEW_MIN_GAP + 1));
}

export class LearnerStateManager {
    private static instance: LearnerStateManager;
    private snapshot!: LearnerSnapshot;
    private initialized = false;
    private stepContentProvider: ((domain: MathDomain, step: number) => boolean) | null = null;

    private constructor() {}

    static getInstance(): LearnerStateManager {
        if (!LearnerStateManager.instance) {
            LearnerStateManager.instance = new LearnerStateManager();
        }
        return LearnerStateManager.instance;
    }

    initialize(
        profile: Pick<UserProfile, 'childId' | 'familyId'> | null,
        savedState?: LearnerSnapshot,
        mastery?: PlayerELOStats,
    ): void {
        const liveMastery = mastery ?? ELOManager.getInstance().getStats();
        const childId = profile?.childId ?? 'local-child';
        const familyId = profile?.familyId ?? 'local-family';
        const base = this.createDefaultSnapshot(childId, familyId, liveMastery);

        const merged: LearnerSnapshot = {
            ...base,
            ...savedState,
            childId,
            familyId,
            mastery: liveMastery,
            confidenceOffsets: {
                ...base.confidenceOffsets,
                ...(savedState?.confidenceOffsets ?? {}),
            },
            curriculumProgress: this.mergeCurriculumProgress(savedState?.curriculumProgress),
            reviewItems: (savedState?.reviewItems ?? []).slice(),
            recentAttempts: (savedState?.recentAttempts ?? []).slice(-MAX_RECENT_ATTEMPTS),
            recentProblemIds: (savedState?.recentProblemIds ?? []).slice(-MAX_RECENT_PROBLEMS),
            domainHistory: this.mergeDomainHistory(savedState?.domainHistory),
            unlockState: {
                ...base.unlockState,
                ...(savedState?.unlockState ?? {}),
            },
            latestSyncCursor: savedState?.latestSyncCursor ?? null,
            lastSyncedAt: savedState?.lastSyncedAt ?? null,
            syncStatus: savedState?.syncStatus ?? 'local-only',
            summary: base.summary,
        };

        this.snapshot = merged;
        this.initialized = true;
        this.reconcileCurriculumFloors();
        this.refreshDerivedState();
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    getSnapshot(): LearnerSnapshot {
        if (!this.initialized) {
            this.initialize(null, undefined, ELOManager.getInstance().getStats());
        }

        this.snapshot.mastery = ELOManager.getInstance().getStats();
        this.refreshDerivedState();
        return cloneSnapshot(this.snapshot);
    }

    replaceSnapshot(snapshot: LearnerSnapshot): void {
        this.snapshot = cloneSnapshot(snapshot);
        this.initialized = true;
        this.refreshDerivedState();
    }

    updateSyncMetadata(status: LearnerSnapshot['syncStatus'], latestSyncCursor: string | null, lastSyncedAt: number | null): void {
        if (!this.initialized) return;
        this.snapshot.syncStatus = status;
        this.snapshot.latestSyncCursor = latestSyncCursor;
        this.snapshot.lastSyncedAt = lastSyncedAt;
        this.refreshDerivedState();
    }

    getConfidenceOffset(domain: MathDomain): number {
        return this.getSnapshot().confidenceOffsets[domain];
    }

    getEffectiveSelectionELO(domain: MathDomain): number {
        const mastery = ELOManager.getInstance().getEffectiveELO(domain);
        return mastery + this.getConfidenceOffset(domain);
    }

    getCurrentStep(domain: MathDomain): number {
        return this.getSnapshot().curriculumProgress[domain].currentStep;
    }

    getWinsAtCurrentStep(domain: MathDomain): number {
        return this.getSnapshot().curriculumProgress[domain].winsAtCurrentStep;
    }

    isDomainUnlocked(domain: MathDomain): boolean {
        return this.getSnapshot().unlockState[domain] ?? false;
    }

    canUseStretchLane(domain: MathDomain): boolean {
        const recent = this.getRecentAttempts(domain, 5);
        if (recent.length < 5) return false;
        const correctRate = recent.filter(attempt => attempt.correct).length / recent.length;
        return correctRate >= 0.8 && this.getConfidenceOffset(domain) >= 0;
    }

    getDueReviewItems(domain?: MathDomain): ReviewItem[] {
        const snapshot = this.getSnapshot();
        const currentAttemptCount = snapshot.mastery.problemsAttempted;
        const now = Date.now();

        return snapshot.reviewItems
            .filter(item => item.stage !== 'graduated')
            .filter(item => !domain || item.domain === domain)
            .filter(item => {
                if (item.dueAfterAttempt !== null) {
                    return currentAttemptCount >= item.dueAfterAttempt;
                }
                if (item.dueAt !== null) {
                    return now >= item.dueAt;
                }
                return false;
            })
            .sort((a, b) => {
                const stageRank = this.getStageRank(a.stage) - this.getStageRank(b.stage);
                if (stageRank !== 0) return stageRank;
                const aDue = a.dueAt ?? a.dueAfterAttempt ?? 0;
                const bDue = b.dueAt ?? b.dueAfterAttempt ?? 0;
                return aDue - bDue;
            });
    }

    recordAttempt(attempt: LearnerAttemptSubmission): LearnerSnapshot {
        if (!this.initialized) {
            this.initialize(null, undefined, ELOManager.getInstance().getStats());
        }

        this.applyConfidenceUpdate(attempt);
        this.applyReviewUpdate(attempt);
        this.applyCurriculumProgress(attempt);

        this.snapshot.recentAttempts.push({
            id: attempt.attemptId,
            problemId: attempt.problemId,
            domain: attempt.domain,
            skills: [...attempt.skills],
            correct: attempt.correct,
            firstAttempt: attempt.firstAttempt,
            hintsUsed: attempt.hintsUsed,
            responseMs: attempt.responseMs,
            answeredAt: attempt.answeredAt,
            problemELO: attempt.problemELO,
            curriculumStep: attempt.curriculumStep,
            selectionLane: attempt.selectionLane,
            reviewItemId: attempt.reviewItemId,
        });
        this.snapshot.recentAttempts = this.snapshot.recentAttempts.slice(-MAX_RECENT_ATTEMPTS);

        this.snapshot.recentProblemIds.push(attempt.problemId);
        this.snapshot.recentProblemIds = this.snapshot.recentProblemIds.slice(-MAX_RECENT_PROBLEMS);

        this.pushBacklogHistory(attempt.domain);
        this.refreshDerivedState();
        return this.getSnapshot();
    }

    private createDefaultSnapshot(childId: string, familyId: string, mastery: PlayerELOStats): LearnerSnapshot {
        const defaultSummary = this.createDefaultSummary();
        return {
            childId,
            familyId,
            mastery,
            confidenceOffsets: createDomainNumberMap(0),
            curriculumProgress: createCurriculumProgressMap(),
            reviewItems: [],
            recentAttempts: [],
            recentProblemIds: [],
            domainHistory: createDomainHistoryMap(),
            unlockState: {
                addition: true,
                subtraction: false,
                multiplication: false,
                division: false,
                counting: true,
                comparison: false,
                pattern_matching: false,
                number_sequence: false,
            },
            latestSyncCursor: null,
            lastSyncedAt: null,
            syncStatus: 'local-only',
            summary: defaultSummary,
        };
    }

    private createDefaultSummary(): LearnerSummary {
        return {
            firstAttemptAccuracy: 0,
            currentMasteryByDomain: createDomainNumberMap(0),
            activeReviewSkills: [],
            frustrationFlags: {
                repeatMisses: false,
                responseTimeSpike: false,
                repeatedHints: false,
                lowConfidence: false,
            },
            domains: [],
        };
    }

    private mergeDomainHistory(history?: LearnerDomainHistoryMap): LearnerDomainHistoryMap {
        const merged = createDomainHistoryMap();
        if (!history) return merged;

        for (const domain of ALL_MATH_DOMAINS) {
            merged[domain].backlogHistory = [...(history[domain]?.backlogHistory ?? [])].slice(-MAX_BACKLOG_HISTORY);
        }
        return merged;
    }

    private mergeCurriculumProgress(progress?: DomainCurriculumProgressMap): DomainCurriculumProgressMap {
        const merged = createCurriculumProgressMap();
        if (!progress) return merged;

        for (const domain of ALL_MATH_DOMAINS) {
            merged[domain] = {
                currentStep: Math.max(0, progress[domain]?.currentStep ?? 0),
                winsAtCurrentStep: Math.max(0, progress[domain]?.winsAtCurrentStep ?? 0),
                recentStepResults: [...(progress[domain]?.recentStepResults ?? [])].slice(-MAX_STEP_RESULTS),
            };
        }

        return merged;
    }

    private applyConfidenceUpdate(attempt: LearnerAttemptSubmission): void {
        const current = this.snapshot.confidenceOffsets[attempt.domain];
        const decayed = current * 0.8;
        const delta = attempt.correct
            ? (attempt.firstAttempt ? 4 : 1)
            : -15;

        this.snapshot.confidenceOffsets[attempt.domain] = clamp(decayed + delta, -50, 20);
    }

    private applyCurriculumProgress(attempt: LearnerAttemptSubmission): void {
        const progress = this.snapshot.curriculumProgress[attempt.domain];
        progress.recentStepResults.push({
            step: attempt.curriculumStep,
            correct: attempt.correct,
            firstAttempt: attempt.firstAttempt,
            answeredAt: attempt.answeredAt,
        });
        progress.recentStepResults = progress.recentStepResults.slice(-MAX_STEP_RESULTS);

        // Stretch-lane fast path: a first-try win above the current step promotes
        // directly to that step. Never triggers on a wrong or retried answer.
        if (attempt.curriculumStep > progress.currentStep && attempt.correct && attempt.firstAttempt) {
            progress.currentStep = attempt.curriculumStep;
            progress.winsAtCurrentStep = 0;
        }

        if (attempt.curriculumStep === progress.currentStep && attempt.correct && attempt.firstAttempt) {
            progress.winsAtCurrentStep += 1;
        }

        // Demotion is only evaluated on the wrong answer itself, so a rough patch
        // costs one step, not one step per attempt while it sits in the window.
        if (!attempt.correct) {
            const recentDomainAttempts = this.getProjectedRecentAttempts(attempt.domain, attempt, DEMOTION_WINDOW);
            const wrongCount = recentDomainAttempts.filter(entry => !entry.correct).length;
            const confidenceOffset = this.snapshot.confidenceOffsets[attempt.domain];
            if (wrongCount >= DEMOTION_WRONG_THRESHOLD || confidenceOffset <= DEMOTION_CONFIDENCE_THRESHOLD) {
                progress.currentStep = Math.max(0, progress.currentStep - 1);
                progress.winsAtCurrentStep = 0;
                this.snapshot.confidenceOffsets[attempt.domain] = Math.max(
                    this.snapshot.confidenceOffsets[attempt.domain],
                    POST_DEMOTION_CONFIDENCE_FLOOR,
                );
            }
            return;
        }

        const promotionWindow = this.getProjectedRecentAttempts(
            attempt.domain,
            attempt,
            PROMOTION_ACCURACY_WINDOW,
        );
        const accuracy = this.computeFirstAttemptAccuracy(promotionWindow);
        if (
            progress.winsAtCurrentStep >= PROMOTION_WIN_TARGET &&
            accuracy >= PROMOTION_ACCURACY_TARGET
        ) {
            const nextStep = this.findNextStepWithContent(attempt.domain, progress.currentStep);
            if (nextStep > progress.currentStep) {
                progress.currentStep = nextStep;
                progress.winsAtCurrentStep = 0;
            }
        }
    }

    /**
     * Curriculum step data has authored holes (steps with zero problems).
     * Promotion skips over empty steps so the ladder never parks a learner
     * on a step where at-level problems can never be served.
     */
    private findNextStepWithContent(domain: MathDomain, currentStep: number): number {
        if (!this.stepContentProvider) {
            return currentStep + 1;
        }

        for (let step = currentStep + 1; step <= currentStep + PROMOTION_STEP_SCAN_LIMIT; step++) {
            if (this.stepContentProvider(domain, step)) {
                return step;
            }
        }

        // No content above: stay put instead of promoting into an empty band.
        return currentStep;
    }

    /**
     * Wire in a pool-backed "does this step have problems" check.
     * Also reconciles domains whose starting step sits below the first
     * authored step (e.g. a domain whose content starts at step 1).
     */
    setStepContentProvider(provider: (domain: MathDomain, step: number) => boolean): void {
        this.stepContentProvider = provider;
        this.reconcileCurriculumFloors();
    }

    reconcileCurriculumFloors(): void {
        if (!this.initialized || !this.stepContentProvider) return;

        for (const domain of ALL_MATH_DOMAINS) {
            const progress = this.snapshot.curriculumProgress[domain];
            let hasReachableContent = false;
            for (let step = 0; step <= progress.currentStep; step++) {
                if (this.stepContentProvider(domain, step)) {
                    hasReachableContent = true;
                    break;
                }
            }
            if (hasReachableContent) continue;

            for (let step = progress.currentStep + 1; step <= progress.currentStep + PROMOTION_STEP_SCAN_LIMIT; step++) {
                if (this.stepContentProvider(domain, step)) {
                    progress.currentStep = step;
                    progress.winsAtCurrentStep = 0;
                    break;
                }
            }
        }
    }

    private applyReviewUpdate(attempt: LearnerAttemptSubmission): void {
        const touchedSkills = new Set(attempt.skills);
        for (const skill of touchedSkills) {
            const existing = this.snapshot.reviewItems.find(item =>
                item.domain === attempt.domain &&
                item.skill === skill &&
                item.stage !== 'graduated',
            );

            if (!attempt.correct) {
                if (existing) {
                    existing.stage = 'immediate';
                    existing.dueAfterAttempt = this.snapshot.mastery.problemsAttempted + getReviewGap();
                    existing.dueAt = null;
                    existing.lastOutcome = 'wrong';
                    existing.updatedAt = attempt.answeredAt;
                } else {
                    this.snapshot.reviewItems.push({
                        id: generateId('review'),
                        skill,
                        domain: attempt.domain,
                        sourceProblemId: attempt.problemId,
                        anchorProblemELO: attempt.problemELO,
                        stage: 'immediate',
                        dueAt: null,
                        dueAfterAttempt: this.snapshot.mastery.problemsAttempted + getReviewGap(),
                        successfulReviews: 0,
                        lastOutcome: 'wrong',
                        updatedAt: attempt.answeredAt,
                    });
                }
                continue;
            }

            if (!existing) {
                continue;
            }

            if (attempt.reviewItemId && attempt.reviewItemId === existing.id) {
                existing.lastOutcome = 'correct';
                existing.updatedAt = attempt.answeredAt;

                switch (existing.stage) {
                    case 'immediate':
                        existing.stage = 'day_1';
                        existing.dueAfterAttempt = null;
                        existing.dueAt = attempt.answeredAt + 24 * 60 * 60 * 1000;
                        break;
                    case 'day_1':
                        existing.stage = 'day_3';
                        existing.successfulReviews = 1;
                        existing.dueAt = attempt.answeredAt + 3 * 24 * 60 * 60 * 1000;
                        break;
                    case 'day_3':
                        existing.stage = 'day_7';
                        existing.successfulReviews = 2;
                        existing.dueAt = attempt.answeredAt + 7 * 24 * 60 * 60 * 1000;
                        break;
                    case 'day_7':
                        existing.stage = 'graduated';
                        existing.successfulReviews = 3;
                        existing.dueAt = null;
                        existing.dueAfterAttempt = null;
                        break;
                    default:
                        break;
                }
            }
        }

        this.snapshot.reviewItems = this.snapshot.reviewItems.filter(item => item.stage !== 'graduated');
    }

    private pushBacklogHistory(domain: MathDomain): void {
        const history = this.snapshot.domainHistory[domain];
        const activeBacklog = this.snapshot.reviewItems.filter(item =>
            item.domain === domain && item.stage !== 'graduated',
        ).length;

        history.backlogHistory.push(activeBacklog);
        history.backlogHistory = history.backlogHistory.slice(-MAX_BACKLOG_HISTORY);
    }

    private refreshDerivedState(): void {
        this.snapshot.mastery = ELOManager.getInstance().getStats();
        this.snapshot.unlockState = this.computeUnlockState();
        this.snapshot.summary = this.buildSummary();
    }

    private computeUnlockState(): Partial<Record<MathDomain, boolean>> {
        const nextState: Partial<Record<MathDomain, boolean>> = {};

        for (const domain of ALL_MATH_DOMAINS) {
            const prerequisites = DOMAIN_PREREQUISITES[domain] ?? [];
            if (prerequisites.length === 0) {
                nextState[domain] = true;
                continue;
            }

            nextState[domain] = prerequisites.every(prereq => {
                const recent = this.getRecentAttempts(prereq, 20);
                if (recent.length < 20) return false;

                const firstAttemptAccuracy = this.computeFirstAttemptAccuracy(recent);
                return firstAttemptAccuracy >= 0.9 && this.getBacklogTrend(prereq) !== 'growing';
            });
        }

        return nextState;
    }

    private buildSummary(): LearnerSummary {
        const domains: LearnerDomainSummary[] = ALL_MATH_DOMAINS.map(domain => {
            const recent = this.getRecentAttempts(domain, 20);
            const masteryELO = ELOManager.getInstance().getEffectiveELO(domain);
            const confidenceOffset = this.snapshot.confidenceOffsets[domain];
            const curriculumProgress = this.snapshot.curriculumProgress[domain];
            const activeReviewCount = this.snapshot.reviewItems.filter(item =>
                item.domain === domain && item.stage !== 'graduated',
            ).length;

            return {
                domain,
                masteryELO,
                confidenceOffset,
                effectiveSelectionELO: masteryELO + confidenceOffset,
                currentStep: curriculumProgress.currentStep,
                winsAtCurrentStep: curriculumProgress.winsAtCurrentStep,
                firstAttemptAccuracy: this.computeFirstAttemptAccuracy(recent),
                recentProblemCount: recent.length,
                activeReviewCount,
                backlogTrend: this.getBacklogTrend(domain),
                unlocked: this.snapshot.unlockState[domain] ?? false,
            };
        });

        const lastFive = this.snapshot.recentAttempts.slice(-5);
        const previousFive = this.snapshot.recentAttempts.slice(-10, -5);
        const repeatedHintCount = lastFive.filter(attempt => attempt.hintsUsed > 0).length;
        const recentResponseAverage = this.averageResponse(lastFive);
        const previousResponseAverage = this.averageResponse(previousFive);
        const recentWrongSkills = new Map<string, number>();

        for (const attempt of lastFive) {
            if (!attempt.correct) {
                for (const skill of attempt.skills) {
                    recentWrongSkills.set(skill, (recentWrongSkills.get(skill) ?? 0) + 1);
                }
            }
        }

        const masteryByDomain = createDomainNumberMap(0);
        for (const domain of ALL_MATH_DOMAINS) {
            masteryByDomain[domain] = ELOManager.getInstance().getEffectiveELO(domain);
        }

        return {
            firstAttemptAccuracy: this.computeFirstAttemptAccuracy(this.snapshot.recentAttempts.slice(-20)),
            currentMasteryByDomain: masteryByDomain,
            activeReviewSkills: Array.from(new Set(
                this.snapshot.reviewItems
                    .filter(item => item.stage !== 'graduated')
                    .map(item => item.skill),
            )),
            frustrationFlags: {
                repeatMisses: Array.from(recentWrongSkills.values()).some(count => count >= 2) ||
                    lastFive.filter(attempt => !attempt.correct).length >= 3,
                responseTimeSpike: previousResponseAverage > 0 &&
                    recentResponseAverage > previousResponseAverage * 1.35 &&
                    recentResponseAverage > 4500,
                repeatedHints: repeatedHintCount >= 3,
                lowConfidence: domains.some(domain => domain.confidenceOffset <= -25),
            },
            domains,
        };
    }

    private getRecentAttempts(domain: MathDomain, count: number): LearnerSnapshot['recentAttempts'] {
        return this.snapshot.recentAttempts
            .filter(attempt => attempt.domain === domain)
            .slice(-count);
    }

    private getProjectedRecentAttempts(
        domain: MathDomain,
        incomingAttempt: LearnerAttemptSubmission,
        count: number,
    ): LearnerSnapshot['recentAttempts'] {
        const recent = this.getRecentAttempts(domain, count - 1);
        return [
            ...recent,
            {
                id: incomingAttempt.attemptId,
                problemId: incomingAttempt.problemId,
                domain: incomingAttempt.domain,
                skills: [...incomingAttempt.skills],
                correct: incomingAttempt.correct,
                firstAttempt: incomingAttempt.firstAttempt,
                hintsUsed: incomingAttempt.hintsUsed,
                responseMs: incomingAttempt.responseMs,
                answeredAt: incomingAttempt.answeredAt,
                problemELO: incomingAttempt.problemELO,
                curriculumStep: incomingAttempt.curriculumStep,
                selectionLane: incomingAttempt.selectionLane,
                reviewItemId: incomingAttempt.reviewItemId,
            },
        ].slice(-count);
    }

    private computeFirstAttemptAccuracy(attempts: LearnerSnapshot['recentAttempts']): number {
        if (attempts.length === 0) return 0;
        const firstAttemptWins = attempts.filter(attempt => attempt.correct && attempt.firstAttempt).length;
        return firstAttemptWins / attempts.length;
    }

    private getBacklogTrend(domain: MathDomain): 'growing' | 'stable' | 'shrinking' {
        const history = this.snapshot.domainHistory[domain].backlogHistory;
        if (history.length < 2) return 'stable';

        const previous = history.slice(0, -1);
        const previousAverage = previous.reduce((sum, value) => sum + value, 0) / previous.length;
        const current = history[history.length - 1];

        if (current > previousAverage + 0.5) return 'growing';
        if (current < previousAverage - 0.5) return 'shrinking';
        return 'stable';
    }

    private getStageRank(stage: ReviewItem['stage']): number {
        switch (stage) {
            case 'immediate':
                return 0;
            case 'day_1':
                return 1;
            case 'day_3':
                return 2;
            case 'day_7':
                return 3;
            case 'graduated':
                return 4;
        }
    }

    private averageResponse(attempts: LearnerSnapshot['recentAttempts']): number {
        if (attempts.length === 0) return 0;
        return attempts.reduce((sum, attempt) => sum + attempt.responseMs, 0) / attempts.length;
    }
}
