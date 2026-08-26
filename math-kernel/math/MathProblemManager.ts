import type {
    AdaptiveProblemSelectionOptions,
    MathProblem,
    MathProblemPool,
    MathDomain,
    SelectionLane,
} from '../utils/Types';
import { RandomStrategy } from './selection/RandomStrategy';
import { ELOManager } from './ELOManager';
import { ProblemPoolManager } from './ProblemPoolManager';
import { ELOAwareStrategy } from './selection/ELOAwareStrategy';
import { LearnerStateManager } from '../systems/LearnerStateManager';
import { buildProblemReplayKey } from './problemReplayKey';

export interface ProblemFilter {
    domains?: string[];
    skills?: string[];
    difficultyRange?: [number, number];
    maxCurriculumStep?: number;
    maxOperand?: number;
    /** See AdaptiveProblemSelectionOptions.maxUngroupedCount. */
    maxUngroupedCount?: number;
}

export interface ELOSelectionOptions extends AdaptiveProblemSelectionOptions {
    primaryDomain?: MathDomain;
}

/**
 * Manages math problem pools, selection, and tracking.
 * Loads problem data from the pool JSON and provides filtered problem retrieval.
 */
export class MathProblemManager {
    private static instance: MathProblemManager;
    private pools: Map<string, MathProblem[]> = new Map();
    private allProblems: MathProblem[] = [];
    private recentProblemIds: string[] = [];
    private recentReplayKeys: string[] = [];
    private selectionStrategy = new RandomStrategy();
    private poolManager!: ProblemPoolManager;
    private eloStrategy: ELOAwareStrategy | null = null;
    private selectionMeta = new Map<string, { lane: SelectionLane; reviewItemId: string | null }>();
    private readonly maxRecentProblemIds = 12;
    private readonly maxRecentReplayKeys = 18;

    private constructor() {}

    static getInstance(): MathProblemManager {
        if (!MathProblemManager.instance) {
            MathProblemManager.instance = new MathProblemManager();
        }
        return MathProblemManager.instance;
    }

    /** Register a problem pool from cached JSON data */
    addPool(key: string, poolData: MathProblemPool): void {
        this.pools.set(key, poolData.problems);
        // Rebuild combined list
        this.allProblems = [];
        for (const problems of this.pools.values()) {
            this.allProblems.push(...problems);
        }

        // Initialize ELO system (only create instances once)
        if (!this.poolManager) {
            this.poolManager = new ProblemPoolManager();

            // Create ELO-aware strategy
            this.eloStrategy = new ELOAwareStrategy(
                ELOManager.getInstance(),
                this.poolManager
            );

            console.log('[MathProblemManager] ELO system initialized');
        }

        // Always re-initialize pool manager with updated problem list
        this.poolManager.initialize(this.allProblems);
        console.log(`[MathProblemManager] Pool manager updated with ${this.allProblems.length} problems`);
    }

    /** Mark a problem as answered (to avoid repeats) */
    markAnswered(problemId: string): void {
        const problem = this.allProblems.find(entry => entry.id === problemId);

        this.recentProblemIds.push(problemId);
        this.recentProblemIds = this.recentProblemIds.slice(-this.maxRecentProblemIds);

        if (!problem) return;

        this.recentReplayKeys.push(buildProblemReplayKey(problem));
        this.recentReplayKeys = this.recentReplayKeys.slice(-this.maxRecentReplayKeys);
    }

    /** Reset answered tracking */
    resetAnswered(): void {
        this.recentProblemIds = [];
        this.recentReplayKeys = [];
    }

    hydrateRecentProblems(problemIds: string[]): void {
        this.recentProblemIds = [...problemIds].slice(-this.maxRecentProblemIds);
        this.recentReplayKeys = this.recentProblemIds
            .map(problemId => this.allProblems.find(problem => problem.id === problemId))
            .filter((problem): problem is MathProblem => Boolean(problem))
            .map(problem => buildProblemReplayKey(problem))
            .slice(-this.maxRecentReplayKeys);
    }

    /** Get the next problem matching the given filter */
    getNextProblem(filter?: ProblemFilter): MathProblem | null {
        let candidates = this.allProblems;

        // Filter out only the most recent problems so repetition can still happen naturally.
        candidates = candidates.filter(p => !this.recentProblemIds.includes(p.id));
        candidates = candidates.filter(problem => !this.recentReplayKeys.includes(buildProblemReplayKey(problem)));

        // Apply domain filter
        if (filter?.domains && filter.domains.length > 0) {
            candidates = candidates.filter(p =>
                filter.domains!.includes(p.domain),
            );
        }

        // Apply skills filter
        if (filter?.skills && filter.skills.length > 0) {
            candidates = candidates.filter(p =>
                p.skills.some(s => filter.skills!.includes(s)),
            );
        }

        // Apply difficulty range filter
        if (filter?.difficultyRange) {
            const [min, max] = filter.difficultyRange;
            candidates = candidates.filter(p =>
                p.difficulty >= min && p.difficulty <= max,
            );
        }

        if (filter?.maxCurriculumStep !== undefined) {
            candidates = candidates.filter(problem => problem.curriculumStep <= filter.maxCurriculumStep!);
        }

        if (filter?.maxOperand !== undefined) {
            candidates = candidates.filter(problem =>
                problem.difficultyTraits?.maxOperand === undefined ||
                problem.difficultyTraits.maxOperand <= filter.maxOperand!,
            );
        }

        // The representation floor. This is the RANDOM path, which the owl only
        // reaches when the ELO-aware lanes come up empty -- but "the lanes found
        // nothing" is no reason to hand a child a row of nineteen marks to count,
        // so the cap has to be applied on both paths or the fallback quietly
        // undoes it.
        if (filter?.maxUngroupedCount !== undefined) {
            candidates = candidates.filter(problem => {
                if (problem.phrasing?.prompt?.params?.glyphs === undefined) return true;
                const answer = Number(problem.answer?.correct);
                return !Number.isFinite(answer) || answer <= filter.maxUngroupedCount!;
            });
        }

        if (candidates.length === 0) {
            if (this.recentProblemIds.length > 0 || this.recentReplayKeys.length > 0) {
                this.resetAnswered();
                return this.getNextProblem(filter);
            }
            return null;
        }

        // Use selection strategy to pick one
        const selected = this.selectionStrategy.select(candidates);
        if (selected) {
            this.markAnswered(selected.id);
        }
        return selected;
    }

    /** Get total problem count */
    getTotalCount(): number {
        return this.allProblems.length;
    }

    /** Get count of answered problems */
    getAnsweredCount(): number {
        return this.recentProblemIds.length;
    }

    /**
     * Get next problem using ELO-aware selection with multiple domains
     * Randomly selects from provided domains, then uses ELO within that domain
     *
     * @param domains Array of math domains to select from
     * @returns Selected problem or null if none available
     */
    getNextProblemELOAware(domains: MathDomain[], options?: ELOSelectionOptions): MathProblem | null;
    /**
     * Get next problem using ELO-aware selection
     * Uses the adaptive lane policy managed by ELOAwareStrategy.
     *
     * @param domain Math domain to select from
     * @returns Selected problem or null if none available
     */
    getNextProblemELOAware(domain: MathDomain, options?: ELOSelectionOptions): MathProblem | null;
    /**
     * Implementation for both overloads
     */
    getNextProblemELOAware(domainOrDomains: MathDomain | MathDomain[], options?: ELOSelectionOptions): MathProblem | null {
        // Handle array of domains
        if (Array.isArray(domainOrDomains)) {
            if (domainOrDomains.length === 0) return null;

            let allowedDomains = domainOrDomains.filter(domain =>
                LearnerStateManager.getInstance().isDomainUnlocked(domain),
            );

            if (allowedDomains.length === 0) {
                allowedDomains = domainOrDomains.includes('addition')
                    ? ['addition']
                    : [domainOrDomains[0]];
            }

            const orderedDomains = this.buildDomainAttemptOrder(
                allowedDomains,
                options?.primaryDomain ?? domainOrDomains[0],
            );

            for (const domain of orderedDomains) {
                const selected = this.getNextProblemELOAware(domain, options);
                if (selected) {
                    return selected;
                }
            }

            return null;
        }

        // Handle single domain
        const domain = domainOrDomains;
        if (!this.eloStrategy) {
            // Fallback to random selection if ELO not initialized
            console.warn('[MathProblemManager] ELO strategy not initialized, using random selection');
            return this.getNextProblem(this.buildDomainFilter(domain, options));
        }

        const excludeIds = [...this.recentProblemIds];
        const problem = this.eloStrategy.select(domain, excludeIds, {
            ...options,
            excludedReplayKeys: [...this.recentReplayKeys, ...(options?.excludedReplayKeys ?? [])],
        });

        if (problem) {
            this.markAnswered(problem.id);
            const meta = this.eloStrategy.consumeLastSelectionMeta();
            this.selectionMeta.set(problem.id, meta ?? { lane: 'comfort', reviewItemId: null });
        } else if (this.recentProblemIds.length > 0 || this.recentReplayKeys.length > 0) {
            console.log('[MathProblemManager] Recent problem window exhausted, resetting tracking');
            this.resetAnswered();
            return this.getNextProblemELOAware(domain, options);
        }

        return problem;
    }

    /**
     * Get the problem pool manager (for direct access if needed)
     */
    getPoolManager(): ProblemPoolManager | null {
        return this.poolManager || null;
    }

    consumeSelectionMeta(problemId: string): { lane: SelectionLane; reviewItemId: string | null } | null {
        const meta = this.selectionMeta.get(problemId) ?? null;
        this.selectionMeta.delete(problemId);
        return meta;
    }

    private buildDomainAttemptOrder(domains: MathDomain[], primaryDomain?: MathDomain): MathDomain[] {
        const ordered = [...domains];
        const preferred = primaryDomain && ordered.includes(primaryDomain)
            ? primaryDomain
            : ordered[0];

        const alternates = ordered.filter(domain => domain !== preferred);
        if (alternates.length === 0) {
            return [preferred];
        }

        const primaryFirst = Math.random() < 0.7;
        if (primaryFirst) {
            return [preferred, ...alternates];
        }

        const shuffledAlternates = [...alternates].sort(() => Math.random() - 0.5);
        return [shuffledAlternates[0], preferred, ...shuffledAlternates.slice(1)];
    }

    private buildDomainFilter(domain: MathDomain, options?: ELOSelectionOptions): ProblemFilter {
        const currentStepCap = LearnerStateManager.getInstance().getCurrentStep(domain);
        const requestedStepCap = options?.maxCurriculumStep;

        return {
            domains: [domain],
            difficultyRange: options?.difficultyRange,
            maxCurriculumStep: requestedStepCap !== undefined
                ? Math.min(requestedStepCap, currentStepCap)
                : currentStepCap,
            maxOperand: options?.maxOperand,
        };
    }
}
