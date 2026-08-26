import { LearnerStateManager } from '../systems/LearnerStateManager';
import type { MathDomain, MathProblem } from '../utils/Types';
import type { ELOSelectionOptions, MathProblemManager } from './MathProblemManager';

export interface OwlSelectionConfig extends Omit<ELOSelectionOptions, 'excludedReplayKeys'> {
    domains: MathDomain[];
    difficultyRange: [number, number];
    maxCurriculumStep: number;
    maxOperand: number;
    primaryDomain: MathDomain;
    /** How often each subject comes due, from math_tuning.json. */
    domainWeights?: Partial<Record<MathDomain, number>>;
}

type OwlDomainPlan = {
    domains: MathDomain[];
    primaryDomain: MathDomain;
};

/**
 * Which domain the owl leans on next: the one the child has practised least
 * recently, weighted so the core subjects come round more often.
 *
 * It used to be `allowedDomains[0]`, which is the first entry of the owl's
 * problemTypes list -- addition, always, for every owl and every child. Since
 * the attempt order puts the preferred domain first 70% of the time, addition
 * took roughly seven of every ten problems for the whole of a journey. Measured
 * over 1200 attempts a thriving child got 868 additions, saw 342 of 4039
 * problems, and was never once served division after earning it.
 *
 * Staleness, not ELO, decides the SUBJECT. ELO decides the RUNG within it, which
 * is the division of labour that makes "answer well and you go deeper" true per
 * domain rather than only in whichever domain happens to dominate. A domain that
 * has never been served is maximally stale, so a newly unlocked one is offered
 * immediately instead of waiting for a coin flip to find it.
 *
 * `domainWeights` in math_tuning.json makes a subject come due faster: weight 3
 * is due three times as often as weight 1. That is where the "how much addition"
 * question belongs -- a designer's dial, not an accident of list order.
 */
export function pickPrimaryDomain(
    allowedDomains: MathDomain[],
    recentDomains: MathDomain[],
    weights: Partial<Record<MathDomain, number>>,
): MathDomain {
    let best = allowedDomains[0];
    let bestDueness = -Infinity;
    for (const domain of allowedDomains) {
        const lastIndex = recentDomains.lastIndexOf(domain);
        const since = lastIndex === -1 ? Number.POSITIVE_INFINITY : recentDomains.length - lastIndex;
        const dueness = since * (weights[domain] ?? 1);
        // Strictly greater, so ties fall to the earlier entry and the order the
        // owl declares still breaks a tie predictably.
        if (dueness > bestDueness) {
            bestDueness = dueness;
            best = domain;
        }
    }
    return best;
}

export function getAllowedOwlDomains(config: OwlSelectionConfig): MathDomain[] {
    let allowedDomains = config.domains.filter(domain =>
        LearnerStateManager.getInstance().isDomainUnlocked(domain),
    );

    if (allowedDomains.length === 0) {
        allowedDomains = config.domains.includes('addition')
            ? ['addition']
            : [config.domains[0]];
    }

    return allowedDomains;
}

export function buildOwlDomainPlans(
    allowedDomains: MathDomain[],
    previousProblemDomain: MathDomain | null,
    primaryDomain: MathDomain,
): OwlDomainPlan[] {
    if (!previousProblemDomain) {
        return [{ domains: allowedDomains, primaryDomain }];
    }

    const alternateDomains = allowedDomains.filter(domain => domain !== previousProblemDomain);
    if (alternateDomains.length === 0) {
        return [{ domains: allowedDomains, primaryDomain }];
    }

    // The caller already chose a primary by staleness; keep it when it is still
    // available and only fall back to the list order when it is not.
    const alternatePrimary = alternateDomains.includes(primaryDomain) ? primaryDomain : alternateDomains[0];
    return [
        { domains: alternateDomains, primaryDomain: alternatePrimary },
        { domains: allowedDomains, primaryDomain: alternatePrimary },
    ];
}

export function selectOwlProblem(
    manager: MathProblemManager,
    config: OwlSelectionConfig,
    previousProblemDomain: MathDomain | null,
): MathProblem | null {
    const allowedDomains = getAllowedOwlDomains(config);
    const learner = LearnerStateManager.getInstance();
    const recentDomains = learner.getSnapshot().recentAttempts.map(a => a.domain);
    const primary = pickPrimaryDomain(allowedDomains, recentDomains, config.domainWeights ?? {})
        ?? config.primaryDomain;
    const domainPlans = buildOwlDomainPlans(allowedDomains, previousProblemDomain, primary);

    for (const plan of domainPlans) {
        const problem = manager.getNextProblemELOAware(plan.domains, {
            difficultyRange: config.difficultyRange,
            maxCurriculumStep: config.maxCurriculumStep,
            maxOperand: config.maxOperand,
            primaryDomain: plan.primaryDomain,
        });
        if (problem) {
            return problem;
        }
    }

    for (const plan of domainPlans) {
        for (const domain of orderFallbackDomains(plan.domains, plan.primaryDomain)) {
            const problem = manager.getNextProblem({
                domains: [domain],
                difficultyRange: config.difficultyRange,
                maxCurriculumStep: Math.min(
                    config.maxCurriculumStep,
                    LearnerStateManager.getInstance().getCurrentStep(domain),
                ),
                maxOperand: config.maxOperand,
            });
            if (problem) {
                return problem;
            }
        }
    }

    return null;
}

function orderFallbackDomains(domains: MathDomain[], primaryDomain: MathDomain): MathDomain[] {
    const uniqueDomains = [...new Set(domains)];
    if (!uniqueDomains.includes(primaryDomain)) {
        return uniqueDomains;
    }

    return [
        primaryDomain,
        ...uniqueDomains.filter(domain => domain !== primaryDomain),
    ];
}
