import { EventBus, GameEvents } from '../utils/EventBus';

/**
 * Consecutive correct answers within the current level.
 *
 * The design rule this exists to enforce, from brand/BRAND_SYSTEM.md §10.2:
 * **the streak only ever adds.** A wrong answer *pauses* it — the flame dims and
 * relights on the next correct answer — and it resets only on leaving a level.
 *
 * A streak that resets on a wrong answer would turn the most confidence-
 * sensitive moment in the game into a punishment, which is the one thing this
 * product cannot afford. A child replaying a level to protect a streak is a
 * child doing more maths, and that is the entire mechanic.
 */
export class StreakManager {
    /** Coin multiplier thresholds. Index = streak needed, value = multiplier. */
    private static readonly TIERS: ReadonlyArray<{ at: number; multiplier: number }> = [
        { at: 5, multiplier: 3 },
        { at: 3, multiplier: 2 },
    ];

    /** Correct-answer chime rises one semitone per step, capped here. */
    private static readonly MAX_PITCH_STEPS = 5;

    private static instance: StreakManager;

    private streak = 0;
    private best = 0;

    static getInstance(): StreakManager {
        if (!StreakManager.instance) {
            StreakManager.instance = new StreakManager();
        }
        return StreakManager.instance;
    }

    /** Current run of correct answers. */
    getStreak(): number { return this.streak; }

    /** Longest run in this level, for the completion screen. */
    getBest(): number { return this.best; }

    /** Coin multiplier the current streak has earned. */
    getMultiplier(): number {
        return StreakManager.TIERS.find(t => this.streak >= t.at)?.multiplier ?? 1;
    }

    /** Semitones to detune the correct-answer chime by. */
    getPitchSteps(): number {
        return Math.min(this.streak, StreakManager.MAX_PITCH_STEPS);
    }

    /** True when this answer just crossed a reward tier. */
    recordCorrect(): { streak: number; crossedTier: number | null } {
        this.streak++;
        this.best = Math.max(this.best, this.streak);
        EventBus.emit(GameEvents.STREAK_CHANGED, this.streak);

        const crossed = StreakManager.TIERS.find(t => t.at === this.streak);
        return { streak: this.streak, crossedTier: crossed ? crossed.multiplier : null };
    }

    /**
     * A wrong answer. Deliberately does not touch the streak — it only tells
     * listeners to dim, so the ring's flame goes to 40% and relights.
     */
    recordWrong(): void {
        EventBus.emit(GameEvents.STREAK_CHANGED, this.streak);
    }

    /** Leaving a level. The only thing that clears a streak. */
    resetForLevel(): void {
        this.streak = 0;
        this.best = 0;
        EventBus.emit(GameEvents.STREAK_CHANGED, 0);
    }
}
