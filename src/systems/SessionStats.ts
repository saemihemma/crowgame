import { EventBus, GameEvents } from '../utils/EventBus';

/**
 * SessionStats
 *
 * Counts the good things that happened during a play session (from leaving
 * the menu until coming back) so the main menu can greet the child with a
 * recap that follows the peak-end rule: end on the best moment. Only
 * positive counts are kept — there is deliberately nothing here that could
 * render as a negative stat.
 */
export interface SessionRecap {
    owlsSaved: number;
    problemsSolved: number;
    stepUps: number;
    comebacks: number;
    goldenWins: number;
}

function emptyRecap(): SessionRecap {
    return { owlsSaved: 0, problemsSolved: 0, stepUps: 0, comebacks: 0, goldenWins: 0 };
}

export class SessionStats {
    private static instance: SessionStats;
    private stats: SessionRecap = emptyRecap();
    private wired = false;

    private constructor() {}

    static getInstance(): SessionStats {
        if (!SessionStats.instance) {
            SessionStats.instance = new SessionStats();
        }
        return SessionStats.instance;
    }

    /** Wire the counters to gameplay events. Call once at boot. */
    init(): void {
        if (this.wired) return;
        this.wired = true;
        EventBus.on(GameEvents.OWL_SAVED, () => { this.stats.owlsSaved += 1; });
        EventBus.on(GameEvents.MATH_CHALLENGE_COMPLETE, (data: { correct?: boolean; golden?: boolean }) => {
            if (data?.correct === true) {
                this.stats.problemsSolved += 1;
                if (data.golden === true) {
                    this.stats.goldenWins += 1;
                }
            }
        });
        EventBus.on(GameEvents.CURRICULUM_STEP_UP, () => { this.stats.stepUps += 1; });
        EventBus.on(GameEvents.MATH_COMEBACK, () => { this.stats.comebacks += 1; });
    }

    /**
     * The recap worth showing, or null when the session had nothing to
     * celebrate (never show an empty or shaming screen). Consuming resets
     * the counters, so a recap is shown exactly once.
     */
    consume(): SessionRecap | null {
        const recap = this.stats;
        this.stats = emptyRecap();
        return recap.problemsSolved > 0 || recap.owlsSaved > 0 ? recap : null;
    }

    reset(): void {
        this.stats = emptyRecap();
    }
}
