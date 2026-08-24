import type { BaseNPC, NPCComponent } from '../BaseNPC';
import type { NPCComponentConfig, MathDomain } from '../../../utils/Types';
import { SCENES } from '../../../utils/Constants';
import { EventBus, GameEvents } from '../../../utils/EventBus';
import { MathProblemManager } from '../../../math/MathProblemManager';
import { selectOwlProblem, type OwlSelectionConfig } from '../../../math/owlSelection';
import { TextManager } from '../../../systems/TextManager';
import { LearnerStateManager } from '../../../systems/LearnerStateManager';
import { LevelManager } from '../../../systems/LevelManager';

export interface MathChallengeComponentConfig extends NPCComponentConfig {
    type: 'math_challenge';
    problemTypes: string[];
    difficultyRange: [number, number];
    problemCount: number;
}

/**
 * Makes an NPC trigger a math challenge on contact.
 *
 * Streamlined flow:
 *   Walk into NPC -> one or more math overlays -> answer -> done
 */
export class MathChallengeComponent implements NPCComponent {
    readonly type = 'math_challenge';
    private npc!: BaseNPC;
    private config: MathChallengeComponentConfig;
    private problemsCompleted = 0;
    private lastProblemDomain: MathDomain | null = null;
    // Teaching window: which domain the current interact's freebie belongs
    // to, and which domains already got their demo this session (a demo with
    // no follow-through must not replay forever).
    private pendingFreebieDomain: MathDomain | null = null;
    private static demoShownFor = new Set<MathDomain>();

    constructor(config: MathChallengeComponentConfig) {
        this.config = config;
    }

    init(npc: BaseNPC): void {
        this.npc = npc;
        EventBus.on(GameEvents.MATH_CHALLENGE_COMPLETE, this.onMathComplete, this);
        EventBus.on(GameEvents.MATH_DEMO_COMPLETE, this.onDemoComplete, this);
    }

    update(_delta: number): void {
        // No-op
    }

    onInteract(): void {
        this.problemsCompleted = 0;
        this.lastProblemDomain = null;
        this.pendingFreebieDomain = null;
        this.launchMathChallenge();
    }

    private launchMathChallenge(): void {
        if (this.npc.scene.scene.isActive(SCENES.MATH_CHALLENGE)) return;

        const manager = MathProblemManager.getInstance();
        const domains = this.getAllowedDomains();
        const selectionOptions = this.getSelectionOptions(domains);
        const tt = TextManager.getInstance();

        // Teaching window: if this level's gating includes a domain the child
        // has never attempted, the owl demonstrates one worked example first,
        // then hands over a freebie try in the same domain.
        if (this.pendingFreebieDomain === null && this.problemsCompleted === 0) {
            const introDomain = domains.find(domain =>
                LearnerStateManager.getInstance().getTotalAttempts(domain) === 0 &&
                !MathChallengeComponent.demoShownFor.has(domain),
            );
            if (introDomain) {
                MathChallengeComponent.demoShownFor.add(introDomain);
                const demoProblem = selectOwlProblem(
                    manager,
                    { ...selectionOptions, domains: [introDomain], primaryDomain: introDomain },
                    null,
                );
                if (demoProblem) {
                    // Demos are not attempts: discard the selection meta so no
                    // stale lane info leaks into the next real problem.
                    manager.consumeSelectionMeta(demoProblem.id);
                    this.pendingFreebieDomain = introDomain;
                    this.npc.scene.scene.launch(SCENES.MATH_CHALLENGE, {
                        problem: demoProblem,
                        demo: true,
                        npcName: tt.t('npc.professor_hoot'),
                        npcGreeting: tt.t('math.demo_watch'),
                    });
                    return;
                }
            }
        }

        const freebieDomain = this.pendingFreebieDomain;
        this.pendingFreebieDomain = null;

        const problem = selectOwlProblem(
            manager,
            freebieDomain
                ? { ...selectionOptions, domains: [freebieDomain], primaryDomain: freebieDomain }
                : selectionOptions,
            this.problemsCompleted > 0 ? this.lastProblemDomain : null,
        );

        if (!problem) {
            console.warn('[MathChallenge] No problems available');
            this.npc.endInteraction();
            return;
        }

        this.lastProblemDomain = problem.domain;

        const rewardAmount = (this.npc.definition.behaviorConfig?.rewardAmount as number) ?? 1;
        const rewardForThisProblem = this.problemsCompleted + 1 >= this.config.problemCount
            ? rewardAmount
            : 0;

        const greetingKeys = [
            'math.greeting_1',
            'math.greeting_2',
            'math.greeting_3',
            'math.greeting_4',
            'math.greeting_5',
        ];
        const greeting = tt.t(greetingKeys[Math.floor(Math.random() * greetingKeys.length)]);

        this.npc.scene.scene.launch(SCENES.MATH_CHALLENGE, {
            problem,
            coinsReward: rewardForThisProblem,
            npcName: tt.t('npc.professor_hoot'),
            npcGreeting: freebieDomain ? tt.t('math.demo_your_turn') : greeting,
            currentProblemIndex: this.problemsCompleted + 1,
            problemCount: this.config.problemCount,
            freebie: freebieDomain !== null,
        });
    }

    private onDemoComplete = (): void => {
        if (!this.npc.isInteracting() || this.pendingFreebieDomain === null) return;
        this.npc.scene.time.delayedCall(220, () => {
            if (this.npc.isInteracting()) {
                this.launchMathChallenge();
            }
        });
    };

    private onMathComplete = (data: { correct: boolean }): void => {
        if (!this.npc.isInteracting()) return;

        if (data.correct) {
            this.problemsCompleted++;
            if (this.problemsCompleted < this.config.problemCount) {
                this.npc.scene.time.delayedCall(220, () => {
                    if (this.npc.isInteracting()) {
                        this.launchMathChallenge();
                    }
                });
                return;
            }

            EventBus.emit(GameEvents.OWL_SAVED);
        }

        this.npc.endInteraction();
        this.npc.flyAway();
    };

    destroy(): void {
        EventBus.off(GameEvents.MATH_CHALLENGE_COMPLETE, this.onMathComplete, this);
        EventBus.off(GameEvents.MATH_DEMO_COMPLETE, this.onDemoComplete, this);
    }

    /** The current level's math identity, when it declares one. */
    private getLevelGating(): { skills: MathDomain[]; band: [number, number] } | null {
        const gating = LevelManager.getInstance().getCurrentLevel()?.mathGating;
        if (!gating || !Array.isArray(gating.skills) || gating.skills.length === 0) return null;
        return { skills: gating.skills as MathDomain[], band: gating.difficultyBand };
    }

    private getAllowedDomains(): MathDomain[] {
        let configuredDomains = this.config.problemTypes as MathDomain[];

        // The level's gating decides which math this place teaches; the NPC
        // config is the superset it may draw from. An empty intersection
        // falls back to the NPC config so a mis-authored level never bricks.
        const gating = this.getLevelGating();
        if (gating) {
            const gated = configuredDomains.filter(domain => gating.skills.includes(domain));
            if (gated.length > 0) {
                configuredDomains = gated;
            }
        }

        let allowedDomains = configuredDomains.filter(domain =>
            LearnerStateManager.getInstance().isDomainUnlocked(domain),
        );

        if (allowedDomains.length === 0) {
            allowedDomains = configuredDomains.includes('addition')
                ? ['addition']
                : [configuredDomains[0]];
        }

        return allowedDomains;
    }

    private getSelectionOptions(domains: MathDomain[]): OwlSelectionConfig {
        // The effective difficulty band is the intersection of the NPC's band
        // and the level's; the curriculum ladder still owns how hard within it.
        let difficultyRange = this.config.difficultyRange;
        const gating = this.getLevelGating();
        if (gating && Array.isArray(gating.band) && gating.band.length === 2) {
            const lo = Math.max(difficultyRange[0], gating.band[0]);
            const hi = Math.min(difficultyRange[1], gating.band[1]);
            if (lo <= hi) {
                difficultyRange = [lo, hi];
            }
        }

        return {
            domains,
            difficultyRange,
            maxCurriculumStep: Math.max(0, Math.round(difficultyRange[1] * 10)),
            maxOperand: 20,
            primaryDomain: domains[0],
        };
    }
}
