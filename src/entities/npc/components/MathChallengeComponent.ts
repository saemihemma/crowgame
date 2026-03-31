import type { BaseNPC, NPCComponent } from '../BaseNPC';
import type { NPCComponentConfig, MathDomain } from '../../../utils/Types';
import { SCENES } from '../../../utils/Constants';
import { EventBus, GameEvents } from '../../../utils/EventBus';
import { MathProblemManager } from '../../../math/MathProblemManager';
import { selectOwlProblem, type OwlSelectionConfig } from '../../../math/owlSelection';
import { TextManager } from '../../../systems/TextManager';
import { LearnerStateManager } from '../../../systems/LearnerStateManager';

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

    constructor(config: MathChallengeComponentConfig) {
        this.config = config;
    }

    init(npc: BaseNPC): void {
        this.npc = npc;
        EventBus.on(GameEvents.MATH_CHALLENGE_COMPLETE, this.onMathComplete, this);
    }

    update(_delta: number): void {
        // No-op
    }

    onInteract(): void {
        this.problemsCompleted = 0;
        this.lastProblemDomain = null;
        this.launchMathChallenge();
    }

    private launchMathChallenge(): void {
        if (this.npc.scene.scene.isActive(SCENES.MATH_CHALLENGE)) return;

        const manager = MathProblemManager.getInstance();
        const domains = this.getAllowedDomains();
        const selectionOptions = this.getSelectionOptions(domains);
        const problem = selectOwlProblem(
            manager,
            selectionOptions,
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

        const tt = TextManager.getInstance();
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
            npcGreeting: greeting,
            currentProblemIndex: this.problemsCompleted + 1,
            problemCount: this.config.problemCount,
        });
    }

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
    }

    private getAllowedDomains(): MathDomain[] {
        const configuredDomains = this.config.problemTypes as MathDomain[];
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
        return {
            domains,
            difficultyRange: this.config.difficultyRange,
            maxCurriculumStep: Math.max(0, Math.round(this.config.difficultyRange[1] * 10)),
            maxOperand: 20,
            primaryDomain: domains[0],
        };
    }
}
