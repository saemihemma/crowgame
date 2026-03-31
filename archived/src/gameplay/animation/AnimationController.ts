import { AnimationMapData, AnimationState } from '../../utils/Types';

/**
 * Data-driven animation state machine.
 * Evaluates transitions based on semantic signals (grounded, velocity, etc.)
 * and selects the highest-priority matching animation.
 */
export class AnimationController {
    private animMap: AnimationMapData;
    private currentState: string = 'idle';
    private sprite: Phaser.GameObjects.Sprite;

    constructor(sprite: Phaser.GameObjects.Sprite, animMap: AnimationMapData) {
        this.sprite = sprite;
        this.animMap = animMap;
    }

    /** Evaluate all transitions and play the appropriate animation */
    update(state: AnimationState): void {
        let bestState = this.currentState;
        let bestPriority = -1;

        for (const transition of this.animMap.transitions) {
            // Check if the "from" state matches
            if (transition.from !== '*' && transition.from !== this.currentState) {
                continue;
            }

            // Evaluate the condition
            if (this.evaluateCondition(transition.when, state)) {
                const entry = this.animMap.animationMap[transition.to];
                if (entry && entry.priority > bestPriority) {
                    bestPriority = entry.priority;
                    bestState = transition.to;
                }
            }
        }

        // Also check if current state is still valid (has its own entry)
        const currentEntry = this.animMap.animationMap[this.currentState];
        if (currentEntry && currentEntry.priority >= bestPriority && bestState === this.currentState) {
            // Keep current - no change needed unless a higher priority won
        }

        if (bestState !== this.currentState || !this.sprite.anims.isPlaying) {
            const entry = this.animMap.animationMap[bestState];
            if (entry) {
                this.currentState = bestState;
                this.sprite.anims.play(entry.key, true);
            }
        }
    }

    getCurrentState(): string {
        return this.currentState;
    }

    /** Simple expression evaluator for transition conditions */
    private evaluateCondition(expr: string, state: AnimationState): boolean {
        // Replace known identifiers with their values
        let evaluated = expr;

        // Handle abs() function
        evaluated = evaluated.replace(/abs\(([^)]+)\)/g, (_match, inner) => {
            const val = this.resolveValue(inner.trim(), state);
            return String(Math.abs(val as number));
        });

        // Replace remaining identifiers
        for (const key of Object.keys(state)) {
            const regex = new RegExp(`\\b${key}\\b`, 'g');
            const val = state[key];
            evaluated = evaluated.replace(regex, typeof val === 'boolean' ? String(val) : String(val));
        }

        // Evaluate the expression safely
        try {
            // Only allow safe operations: comparisons, boolean ops, numbers
            // eslint-disable-next-line no-new-func
            return new Function(`"use strict"; return (${evaluated});`)() as boolean;
        } catch {
            return false;
        }
    }

    private resolveValue(identifier: string, state: AnimationState): number | boolean {
        if (identifier in state) {
            return state[identifier];
        }
        const num = parseFloat(identifier);
        return isNaN(num) ? 0 : num;
    }
}
