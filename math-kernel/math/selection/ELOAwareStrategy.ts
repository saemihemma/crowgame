/**
 * ELOAwareStrategy
 *
 * Child-first local selection:
 * - 40% one-step-easier comfort problems
 * - 20% review / two-step-easier problems
 * - 30% current-step problems
 * - 10% one-step-harder stretch problems, only while the learner is hot
 *   (recent accuracy >= 80% and non-negative confidence)
 *
 * ELO still exists as a background mastery signal, but curriculum steps
 * hard-cap local problem selection. Empty lanes redistribute their weight
 * across the remaining non-empty lanes.
 */

import {
    AdaptiveProblemSelectionOptions,
    MathProblem,
    MathDomain,
    ReviewItem,
    SelectionLane,
} from '../../utils/Types';
import { ELOManager } from '../ELOManager';
import { ProblemPoolManager } from '../ProblemPoolManager';
import { LearnerStateManager } from '../../systems/LearnerStateManager';
import { mathTuning } from '../MathTuning';

type Candidate = {
    problem: MathProblem;
    reviewItemId: string | null;
};

export class ELOAwareStrategy {
    private lastSelectionMeta: { lane: SelectionLane; reviewItemId: string | null } | null = null;

    constructor(
        private eloManager: ELOManager,
        private poolManager: ProblemPoolManager
    ) {}

    public select(
        domain: MathDomain,
        excludeIds: string[],
        constraints?: AdaptiveProblemSelectionOptions,
    ): MathProblem | null {
        const learnerState = LearnerStateManager.getInstance();
        const playerELO = learnerState.getEffectiveSelectionELO(domain);
        const dueReviewItems = learnerState.getDueReviewItems(domain);
        const currentStep = learnerState.getCurrentStep(domain);
        const effectiveMaxStep = constraints?.maxCurriculumStep === undefined
            ? currentStep
            : Math.min(currentStep, constraints.maxCurriculumStep);

        const comfortStep = Math.max(0, effectiveMaxStep - 1);
        const reviewMinStep = Math.max(0, effectiveMaxStep - 2);
        const reviewMaxStep = Math.max(0, effectiveMaxStep - 1);

        const laneCandidates: Record<SelectionLane, Candidate[]> = {
            comfort: this.poolManager.getProblemsInCurriculumStepRange(
                domain,
                comfortStep,
                comfortStep,
                excludeIds,
                constraints,
            ).map(problem => ({ problem, reviewItemId: null })),
            review: this.buildReviewCandidates(
                domain,
                reviewMinStep,
                reviewMaxStep,
                dueReviewItems,
                excludeIds,
                constraints,
            ),
            at_level: this.poolManager.getProblemsInCurriculumStepRange(
                domain,
                effectiveMaxStep,
                effectiveMaxStep,
                excludeIds,
                constraints,
            ).map(problem => ({ problem, reviewItemId: null })),
            stretch: learnerState.canUseStretchLane(domain)
                ? this.poolManager.getProblemsInCurriculumStepRange(
                    domain,
                    effectiveMaxStep + 1,
                    effectiveMaxStep + 1,
                    excludeIds,
                    constraints,
                ).map(problem => ({ problem, reviewItemId: null }))
                : [],
        };

        // Empty lanes are dropped in pickLane, which renormalizes the
        // remaining weights, so these are relative shares, not exact odds.
        // The shares live in data/tuning/math_tuning.json, shared with Godot.
        const laneWeights: Record<SelectionLane, number> = { ...mathTuning().laneWeights };

        const availableLanes = (Object.keys(laneCandidates) as SelectionLane[])
            .filter(lane => laneCandidates[lane].length > 0 && laneWeights[lane] > 0);

        if (availableLanes.length === 0) {
            console.warn(`[ELOAwareStrategy] No problems in weighted lanes for ${domain}, stepping down only`);
            const fallback = this.findStepDownFallback(domain, effectiveMaxStep, excludeIds, constraints);
            if (!fallback) {
                console.warn(`[ELOAwareStrategy] No problems available for ${domain}`);
                this.lastSelectionMeta = null;
                return null;
            }

            this.lastSelectionMeta = { lane: 'comfort', reviewItemId: null };
            return fallback;
        }

        const lane = this.pickLane(availableLanes, laneWeights);
        const candidates = laneCandidates[lane];
        const selected = candidates[Math.floor(Math.random() * candidates.length)];

        this.lastSelectionMeta = {
            lane,
            reviewItemId: selected.reviewItemId,
        };

        console.log(
            `[ELOAwareStrategy] Selected ${selected.problem.id} | ` +
            `Domain: ${domain} | ` +
            `Selection ELO: ${playerELO.toFixed(0)} | ` +
            `Curriculum Step: ${selected.problem.curriculumStep}/${effectiveMaxStep} | ` +
            `Problem ELO: ${this.poolManager.getProblemELO(selected.problem.id)} | ` +
            `Lane: ${lane}`
        );

        return selected.problem;
    }

    public getDistribution(domain: MathDomain, excludeIds: string[]): {
        easier: number; atLevel: number; challenge: number;
    } {
        const currentStep = LearnerStateManager.getInstance().getCurrentStep(domain);

        return {
            easier: this.poolManager.getProblemsInCurriculumStepRange(
                domain,
                Math.max(0, currentStep - 1),
                Math.max(0, currentStep - 1),
                excludeIds,
            ).length,
            atLevel: this.poolManager.getProblemsInCurriculumStepRange(
                domain,
                currentStep,
                currentStep,
                excludeIds,
            ).length,
            challenge: 0,
        };
    }

    public consumeLastSelectionMeta(): { lane: SelectionLane; reviewItemId: string | null } | null {
        const meta = this.lastSelectionMeta;
        this.lastSelectionMeta = null;
        return meta;
    }

    private buildReviewCandidates(
        domain: MathDomain,
        minStep: number,
        maxStep: number,
        reviewItems: ReviewItem[],
        excludeIds: string[],
        constraints?: AdaptiveProblemSelectionOptions,
    ): Candidate[] {
        const candidates: Candidate[] = [];

        for (const item of reviewItems) {
            const matchingProblems = this.poolManager.getProblemsBySkillsInCurriculumStepRange(
                domain,
                [item.skill],
                minStep,
                maxStep,
                excludeIds,
                constraints,
            );

            for (const problem of matchingProblems) {
                candidates.push({
                    problem,
                    reviewItemId: item.id,
                });
            }
        }

        return candidates;
    }

    private findStepDownFallback(
        domain: MathDomain,
        maxStep: number,
        excludeIds: string[],
        constraints?: AdaptiveProblemSelectionOptions,
    ): MathProblem | null {
        for (let step = maxStep; step >= 0; step--) {
            const candidates = this.poolManager.getProblemsInCurriculumStepRange(
                domain,
                step,
                step,
                excludeIds,
                constraints,
            );
            if (candidates.length > 0) {
                return candidates[Math.floor(Math.random() * candidates.length)];
            }
        }

        return null;
    }

    private pickLane(lanes: SelectionLane[], weights: Record<SelectionLane, number>): SelectionLane {
        const total = lanes.reduce((sum, lane) => sum + weights[lane], 0);
        const target = Math.random() * total;

        let cumulative = 0;
        for (const lane of lanes) {
            cumulative += weights[lane];
            if (target <= cumulative) {
                return lane;
            }
        }

        return lanes[0];
    }
}
