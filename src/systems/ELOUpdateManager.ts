import { EventBus, GameEvents } from '../utils/EventBus';
import { ELOManager } from '../math/ELOManager';
import { MathProblemManager } from '../math/MathProblemManager';
import type { LearnerAttemptSubmission, MathDomain, MathProblem, SelectionLane } from '../utils/Types';
import { SaveManager } from './SaveManager';
import { LearnerStateManager } from './LearnerStateManager';
import { LearnerSyncService } from './LearnerSyncService';
import { ProfileManager } from './ProfileManager';

/**
 * ELOUpdateManager
 *
 * Bridges completed math challenges into the full learner model:
 * mastery ELO, fast confidence shifts, review scheduling, persistence,
 * and optional hosted sync.
 */
export class ELOUpdateManager {
    private static instance: ELOUpdateManager;
    private currentProblemId: string | null = null;
    private currentDomain: MathDomain | null = null;
    private currentProblemELO: number | null = null;
    private currentCurriculumStep = 0;
    private currentSkills: string[] = [];
    private currentSelectionLane: SelectionLane = 'comfort';
    private currentReviewItemId: string | null = null;

    private constructor() {}

    static getInstance(): ELOUpdateManager {
        if (!ELOUpdateManager.instance) {
            ELOUpdateManager.instance = new ELOUpdateManager();
        }
        return ELOUpdateManager.instance;
    }

    init(): void {
        EventBus.on(GameEvents.MATH_PROBLEM_PRESENTED, this.onProblemPresented, this);
        EventBus.on(GameEvents.MATH_CHALLENGE_COMPLETE, this.onChallengeComplete, this);

        // Let the curriculum ladder see which steps actually have problems,
        // so promotion can skip authored holes in the step data. A rung needs
        // at least 3 problems to be practicable — promotion requires 3 fresh
        // at-level wins, so a 1-2 problem step would stall the ladder.
        LearnerStateManager.getInstance().setStepContentProvider((domain, step) => {
            const poolManager = MathProblemManager.getInstance().getPoolManager();
            if (!poolManager) return true;
            return poolManager.getProblemsInCurriculumStepRange(domain, step, step, []).length >= 3;
        });

        console.log('[ELOUpdateManager] Initialized');
    }

    private onProblemPresented = (problem: MathProblem): void => {
        this.currentProblemId = problem.id;
        this.currentDomain = problem.domain;
        this.currentSkills = [...problem.skills];

        const selectionMeta = MathProblemManager.getInstance().consumeSelectionMeta(problem.id);
        this.currentSelectionLane = selectionMeta?.lane ?? 'comfort';
        this.currentReviewItemId = selectionMeta?.reviewItemId ?? null;

        const poolManager = MathProblemManager.getInstance().getPoolManager();
        if (poolManager) {
            this.currentProblemELO = poolManager.getProblemELO(problem.id);
            this.currentCurriculumStep = poolManager.getProblemCurriculumStep(problem.id);
        }

        console.log(
            `[ELOUpdateManager] Problem presented: ${problem.id} ` +
            `(${problem.domain}, ELO ${this.currentProblemELO}, lane ${this.currentSelectionLane})`
        );
    };

    private onChallengeComplete = (data: {
        problemId: string;
        correct: boolean;
        firstAttempt: boolean;
        hintsUsed?: number;
        responseMs?: number;
        freebie?: boolean;
        golden?: boolean;
    }): void => {
        if (!this.currentDomain || this.currentProblemELO === null) {
            console.warn('[ELOUpdateManager] Missing problem context, skipping learner update');
            return;
        }

        // The freebie is the first-ever try at a newly taught skill: a win
        // counts normally, a miss is never held against the learner.
        if (data.freebie === true && !data.correct) {
            console.log('[ELOUpdateManager] Freebie miss: nothing recorded');
            this.clearContext();
            return;
        }

        const actualScore = data.correct
            ? (data.firstAttempt ? 1.0 : 0.5)
            : 0.0;

        const eloManager = ELOManager.getInstance();
        const result = eloManager.updateRating(
            this.currentDomain,
            this.currentProblemELO,
            actualScore,
        );

        console.log(
            `[ELOUpdateManager] ${this.currentDomain} | ` +
            `ELO: ${result.newGlobalELO.toFixed(0)} ` +
            `(${result.change > 0 ? '+' : ''}${result.change.toFixed(1)})`
        );

        const poolManager = MathProblemManager.getInstance().getPoolManager();
        if (poolManager) {
            poolManager.updateProblemRating(data.problemId, data.correct);
        }

        const attempt = this.buildAttempt(data);

        const learnerState = LearnerStateManager.getInstance();
        const stepBefore = learnerState.getCurrentStep(attempt.domain);
        // Comeback: this attempt answers a review item born from a miss. If
        // the child gets it right now, the miss becomes a redemption story —
        // celebrated harder than an ordinary win.
        const isComeback = attempt.correct &&
            attempt.reviewItemId !== null &&
            learnerState.getSnapshot().reviewItems.some(item =>
                item.id === attempt.reviewItemId && item.lastOutcome === 'wrong');
        learnerState.recordAttempt(attempt);
        const stepAfter = learnerState.getCurrentStep(attempt.domain);
        if (isComeback) {
            EventBus.emit(GameEvents.MATH_COMEBACK, {
                domain: attempt.domain,
                skills: attempt.skills,
            });
        }
        if (stepAfter > stepBefore) {
            EventBus.emit(GameEvents.CURRICULUM_STEP_UP, {
                domain: attempt.domain,
                step: stepAfter,
            });
        }
        SaveManager.getInstance().recordMathAttempt({
            skills: attempt.skills,
            correct: attempt.correct,
            hintsUsed: attempt.hintsUsed,
            timeMs: attempt.responseMs,
            problemId: attempt.problemId,
        });
        SaveManager.getInstance().save();

        void LearnerSyncService.getInstance().submitAttempt(attempt);

        this.clearContext();
    };

    private buildAttempt(data: {
        problemId: string;
        correct: boolean;
        firstAttempt: boolean;
        hintsUsed?: number;
        responseMs?: number;
        golden?: boolean;
    }): LearnerAttemptSubmission {
        const profile = ProfileManager.getInstance().getActiveProfile();

        return {
            attemptId: this.generateAttemptId(),
            childId: profile?.childId ?? 'local-child',
            familyId: profile?.familyId ?? 'local-family',
            problemId: data.problemId,
            domain: this.currentDomain!,
            skills: [...this.currentSkills],
            correct: data.correct,
            firstAttempt: data.firstAttempt,
            hintsUsed: data.hintsUsed ?? 0,
            responseMs: data.responseMs ?? 0,
            answeredAt: Date.now(),
            problemELO: this.currentProblemELO!,
            curriculumStep: this.currentCurriculumStep,
            selectionLane: this.currentSelectionLane,
            reviewItemId: this.currentReviewItemId,
            golden: data.golden === true,
        };
    }

    private clearContext(): void {
        this.currentProblemId = null;
        this.currentDomain = null;
        this.currentProblemELO = null;
        this.currentCurriculumStep = 0;
        this.currentSkills = [];
        this.currentSelectionLane = 'comfort';
        this.currentReviewItemId = null;
    }

    private generateAttemptId(): string {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return `attempt-${crypto.randomUUID()}`;
        }
        return `attempt-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    }
}
