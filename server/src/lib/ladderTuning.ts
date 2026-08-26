/**
 * Turn a week of real play into one concrete knob change, or into a refusal.
 *
 * The admin overview already tags first-try accuracy against the 70-85% band,
 * which tells an owner that something is off and nothing about what to do. The
 * roadmap's tuning loop -- above 85% raise the at-level and stretch share, below
 * 70% raise comfort, a review lane that keeps coming back wrong means the gap is
 * too short, one knob at a time and one week per change -- lived only in prose.
 * This is that loop, written down where it can be executed.
 *
 * THE REFUSAL MATTERS MORE THAN THE RECOMMENDATION
 * ------------------------------------------------
 * With one family playing, a day of attempts is a handful of answers from one
 * child in one mood. A percentage over that is noise, and a knob change made
 * from noise is worse than no change at all, because it moves a system nobody
 * can then reason about. So the sample gates come first and say what is missing
 * rather than returning a number with a shrug. `sufficient: false` is a normal,
 * expected answer -- today it is the ONLY answer, because nothing has been
 * played yet.
 *
 * ONE KNOB
 * --------
 * Never more than one recommendation. Two simultaneous changes cannot be told
 * apart a week later, which is the entire reason the loop is one-at-a-time. When
 * several signals are out of band the widest deviation wins, because that is the
 * one a child is actually feeling.
 *
 * Pure on purpose: no database, no clock, no config lookup. Everything it needs
 * arrives as arguments, so the decision can be tested exhaustively without a
 * Postgres, and the route stays a query plus a call.
 */

export interface LaneStats {
    lane: string;
    attempts: number;
    /** First-try accuracy in this lane, or null when the lane was never served. */
    firstTryAccuracy: number | null;
}

export interface LadderPlayStats {
    windowDays: number;
    attempts: number;
    children: number;
    daysWithPlay: number;
    firstTryAccuracy: number | null;
    lanes: LaneStats[];
    /** Attempts on an item that came back for review, and how they went. */
    review: { attempts: number; firstTryAccuracy: number | null };
}

export interface LadderThresholds {
    /** The sweet spot. Below `low` is too hard, above `high` is too easy. */
    low: number;
    high: number;
    /** Sample gates. Below any of these there is no recommendation at all. */
    minAttempts: number;
    minChildren: number;
    minDaysWithPlay: number;
    /** A review lane below this is coming back before it has been forgotten. */
    reviewFloor: number;
    /** How far one change may move a lane weight. */
    step: number;
}

export interface LadderRecommendation {
    /** What to change, named as a path a person can actually find. */
    knob: string;
    file: string;
    from: string;
    to: string;
    /** The measurement that produced this, in the owner's words. */
    why: string;
    /** True when the knob is not in a tuning file and needs more than an edit. */
    parityLocked?: boolean;
}

export interface LadderTuningReport extends LadderPlayStats {
    band: { low: number; high: number };
    sufficient: boolean;
    /** Why there is no recommendation, when there is none. Null when there is. */
    blockedBy: string | null;
    recommendation: LadderRecommendation | null;
}

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

/**
 * Why this sample cannot support a recommendation, or null if it can.
 *
 * Reported as one sentence naming the shortfall and its threshold, because "not
 * enough data" without a number is the kind of message that gets ignored until
 * someone reimplements the check.
 */
function insufficient(stats: LadderPlayStats, t: LadderThresholds): string | null {
    if (stats.attempts < t.minAttempts) {
        return `${stats.attempts} answers in the last ${stats.windowDays} days; `
            + `${t.minAttempts} is the minimum before a rate means anything.`;
    }
    if (stats.daysWithPlay < t.minDaysWithPlay) {
        return `play on ${stats.daysWithPlay} of the last ${stats.windowDays} days; `
            + `${t.minDaysWithPlay} is the minimum, because one long session is one mood.`;
    }
    if (stats.children < t.minChildren) {
        return `${stats.children} child(ren) played; ${t.minChildren} is the minimum `
            + 'before a rate describes the ladder rather than one learner.';
    }
    if (stats.firstTryAccuracy === null) {
        return 'no first attempts recorded, so there is no first-try accuracy to read.';
    }
    return null;
}

/** Move `step` of weight from one lane to another, as a readable before/after. */
function shift(lanes: Record<string, number>, from: string, to: string, step: number): { from: string; to: string } {
    const moved = Math.min(step, lanes[from] ?? 0);
    const after = { ...lanes, [from]: (lanes[from] ?? 0) - moved, [to]: (lanes[to] ?? 0) + moved };
    const show = (w: Record<string, number>) =>
        Object.entries(w).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
    return { from: show(lanes), to: show(after) };
}

export function recommendLadderChange(
    stats: LadderPlayStats,
    thresholds: LadderThresholds,
    laneWeights: Record<string, number>,
): LadderTuningReport {
    const base = {
        ...stats,
        band: { low: thresholds.low, high: thresholds.high },
    };

    const blockedBy = insufficient(stats, thresholds);
    if (blockedBy !== null) {
        return { ...base, sufficient: false, blockedBy, recommendation: null };
    }

    const accuracy = stats.firstTryAccuracy as number;
    // How far each signal sits outside its band. The widest wins, so the change
    // addresses what a child is feeling most, and only one thing moves.
    const candidates: Array<{ deviation: number; make: () => LadderRecommendation }> = [];

    if (accuracy > thresholds.high) {
        candidates.push({
            deviation: accuracy - thresholds.high,
            make: () => ({
                knob: 'laneWeights',
                file: 'godot/data/tuning/math_tuning.json',
                ...shift(laneWeights, 'comfort', 'stretch', thresholds.step),
                why: `First-try accuracy is ${pct(accuracy)}, above the ${pct(thresholds.high)} ceiling. `
                    + 'Too much of what a child meets is already known. Move weight from comfort to stretch.',
            }),
        });
    }
    if (accuracy < thresholds.low) {
        candidates.push({
            deviation: thresholds.low - accuracy,
            make: () => ({
                knob: 'laneWeights',
                file: 'godot/data/tuning/math_tuning.json',
                ...shift(laneWeights, 'stretch', 'comfort', thresholds.step),
                why: `First-try accuracy is ${pct(accuracy)}, below the ${pct(thresholds.low)} floor. `
                    + 'A child is being asked for more than they have. Move weight from stretch to comfort.',
            }),
        });
    }

    const review = stats.review;
    const reviewAccuracy = review.firstTryAccuracy;
    if (review.attempts >= thresholds.minAttempts / 4
        && reviewAccuracy !== null
        && reviewAccuracy < thresholds.reviewFloor) {
        candidates.push({
            deviation: thresholds.reviewFloor - reviewAccuracy,
            make: () => ({
                knob: 'IMMEDIATE_REVIEW_MIN_GAP / IMMEDIATE_REVIEW_MAX_GAP',
                file: 'godot/scripts/systems/learner_state_manager.gd',
                from: 'the current gap',
                to: 'a longer gap',
                why: `Review items come back wrong ${pct(1 - reviewAccuracy)} of the time `
                    + `(${review.attempts} attempts), under the ${pct(thresholds.reviewFloor)} floor. `
                    + 'They are returning before they have been forgotten OR long after they were lost; '
                    + 'lengthen the gap and watch whether it recovers.',
                // Not a tuning-file edit: these are Tier-1 constants held in
                // parity with the TypeScript kernel by golden fixtures. Changing
                // one means regenerating those fixtures, so the recommendation
                // says so rather than implying a one-line change.
                parityLocked: true,
            }),
        });
    }

    if (candidates.length === 0) {
        return { ...base, sufficient: true, blockedBy: null, recommendation: null };
    }
    candidates.sort((a, b) => b.deviation - a.deviation);
    return { ...base, sufficient: true, blockedBy: null, recommendation: candidates[0]!.make() };
}
