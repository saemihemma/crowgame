import { LearnerStateManager } from '../systems/LearnerStateManager';
import type { MathDomain, MathProblem } from '../utils/Types';
import type { ELOSelectionOptions, MathProblemManager } from './MathProblemManager';

export interface OwlSelectionConfig extends Omit<ELOSelectionOptions, 'excludedReplayKeys'> {
    domains: MathDomain[];
    difficultyRange: [number, number];
    maxCurriculumStep: number;
    /**
     * Optional operand rail: applies only when the caller's config carries
     * one. It must never have a default — a blanket rail was the maxOperand:20
     * fossil that froze every player at sums of ~20 (2026-08).
     */
    maxOperand?: number;
    primaryDomain: MathDomain;
}

type OwlDomainPlan = {
    domains: MathDomain[];
    primaryDomain: MathDomain;
};

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

    const alternatePrimary = alternateDomains[0];
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
    const domainPlans = buildOwlDomainPlans(
        allowedDomains,
        previousProblemDomain,
        allowedDomains[0] ?? config.primaryDomain,
    );

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
