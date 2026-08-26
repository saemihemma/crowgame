/**
 * The ladder tuning rule, tested without a database.
 *
 * The decision is a pure function precisely so it can be pinned here rather than
 * only exercised through a Postgres that this repo's checkout does not always
 * have. What matters most is the REFUSAL: today, and for as long as one family
 * plays, "not enough data" is the correct output, and a rule that quietly
 * recommends something from eleven answers would be worse than no rule.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recommendLadderChange, type LadderPlayStats, type LadderThresholds } from '../src/lib/ladderTuning.ts';

const THRESHOLDS: LadderThresholds = {
    low: 0.7, high: 0.85,
    minAttempts: 200, minChildren: 1, minDaysWithPlay: 4,
    reviewFloor: 0.5, step: 0.05,
};
const WEIGHTS = { comfort: 0.4, review: 0.2, at_level: 0.3, stretch: 0.1 };

const stats = (over: Partial<LadderPlayStats> = {}): LadderPlayStats => ({
    windowDays: 7,
    attempts: 400,
    children: 2,
    daysWithPlay: 5,
    firstTryAccuracy: 0.78,
    lanes: [{ lane: 'comfort', attempts: 200, firstTryAccuracy: 0.9 }],
    review: { attempts: 80, firstTryAccuracy: 0.72 },
    ...over,
});

const run = (over: Partial<LadderPlayStats> = {}) =>
    recommendLadderChange(stats(over), THRESHOLDS, WEIGHTS);

describe('ladder tuning', () => {
    it('refuses to recommend anything from an empty database', () => {
        const report = run({ attempts: 0, children: 0, daysWithPlay: 0, firstTryAccuracy: null,
            lanes: [], review: { attempts: 0, firstTryAccuracy: null } });
        assert.equal(report.sufficient, false);
        assert.equal(report.recommendation, null);
        assert.match(report.blockedBy ?? '', /0 answers/);
        assert.match(report.blockedBy ?? '', /200 is the minimum/);
    });

    it('refuses on one long session even when the answer count is high', () => {
        // The exact shape a single enthusiastic afternoon produces, and the one
        // most likely to look like signal.
        const report = run({ attempts: 900, daysWithPlay: 1, firstTryAccuracy: 0.95 });
        assert.equal(report.sufficient, false);
        assert.equal(report.recommendation, null);
        assert.match(report.blockedBy ?? '', /1 of the last 7 days/);
    });

    it('says nothing when accuracy sits inside the band', () => {
        const report = run();
        assert.equal(report.sufficient, true);
        assert.equal(report.blockedBy, null);
        assert.equal(report.recommendation, null);
    });

    it('moves weight to stretch when the work is too easy', () => {
        const report = run({ firstTryAccuracy: 0.93 });
        const rec = report.recommendation;
        assert.ok(rec, 'a recommendation is expected above the ceiling');
        assert.equal(rec.knob, 'laneWeights');
        assert.match(rec.from, /comfort 0\.40/);
        assert.match(rec.to, /comfort 0\.35/);
        assert.match(rec.to, /stretch 0\.15/);
        assert.match(rec.why, /93\.0%/);
    });

    it('moves weight to comfort when the work is too hard', () => {
        const rec = run({ firstTryAccuracy: 0.52 }).recommendation;
        assert.ok(rec);
        assert.match(rec.to, /comfort 0\.45/);
        assert.match(rec.to, /stretch 0\.05/);
    });

    it('never moves more weight than a lane has', () => {
        // stretch holds 0.10; two consecutive "too hard" weeks must not drive it
        // negative, and the rule must not invent weight that is not there.
        const rec = recommendLadderChange(
            stats({ firstTryAccuracy: 0.3 }), THRESHOLDS,
            { comfort: 0.4, review: 0.2, at_level: 0.38, stretch: 0.02 },
        ).recommendation;
        assert.ok(rec);
        assert.match(rec.to, /stretch 0\.00/);
        assert.match(rec.to, /comfort 0\.42/);
    });

    it('recommends exactly one knob when two signals are out of band', () => {
        // Accuracy is 0.15 below the floor; review is 0.20 below its floor. The
        // wider deviation wins, and only one change is proposed -- two at once
        // could not be told apart a week later.
        const report = run({ firstTryAccuracy: 0.55, review: { attempts: 80, firstTryAccuracy: 0.3 } });
        const rec = report.recommendation;
        assert.ok(rec);
        assert.equal(rec.knob, 'IMMEDIATE_REVIEW_MIN_GAP / IMMEDIATE_REVIEW_MAX_GAP');
        assert.equal(rec.parityLocked, true, 'the review gap is a Tier-1 constant, not a tuning-file edit');
    });

    it('ignores a review lane too small to read', () => {
        // Twelve review attempts at 0% would otherwise shout louder than
        // everything else. Below a quarter of the sample gate it is not evidence.
        const report = run({ firstTryAccuracy: 0.78, review: { attempts: 12, firstTryAccuracy: 0 } });
        assert.equal(report.recommendation, null);
    });

    it('reports the band it judged against, so a reader can check the verdict', () => {
        const report = run();
        assert.deepEqual(report.band, { low: 0.7, high: 0.85 });
        assert.equal(report.windowDays, 7);
    });
});
