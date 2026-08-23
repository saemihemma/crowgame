import type { MathProblem } from '../../utils/Types';

/**
 * Simple weighted-random selection strategy.
 * Picks a random problem from the candidate list.
 * Slightly favors problems that haven't been seen recently.
 */
export class RandomStrategy {
    /**
     * Select a random problem from the candidates array.
     * Returns null if the array is empty.
     */
    select(candidates: MathProblem[]): MathProblem | null {
        if (candidates.length === 0) return null;

        // Simple uniform random selection
        const index = Math.floor(Math.random() * candidates.length);
        return candidates[index];
    }
}
