/**
 * MathTuning
 *
 * The one shared home for every tunable math-experience number: ladder
 * promotion/demotion, the stretch-lane gate, selection lane weights, the
 * teaching-window pacing, and the golden-problem economy. The values live in
 * `data/tuning/math_tuning.json`, which is byte-identical between
 * `public/data` and `godot/data` (enforced by `npm run validate`), so tuning
 * a number is a one-line JSON edit that both ports pick up together.
 *
 * There are deliberately no compiled-in defaults: every entry point must load
 * the JSON (BootScene in the browser, an explicit file read in Node tools).
 * A missing initialize is a loud crash, never a silent drift back to stale
 * numbers.
 */

export interface MathTuningData {
    ladder: {
        promotionWinTarget: number;
        promotionAccuracyTarget: number;
        promotionAccuracyWindow: number;
        demotionWindow: number;
        demotionWrongThreshold: number;
        demotionConfidenceThreshold: number;
        postDemotionConfidenceFloor: number;
        promotionStepScanLimit: number;
    };
    stretchGate: {
        window: number;
        minAccuracy: number;
        minConfidence: number;
    };
    laneWeights: {
        comfort: number;
        review: number;
        at_level: number;
        stretch: number;
    };
    teaching: {
        hintMs: number;
        revealMs: number;
        handoverMs: number;
        closeMs: number;
    };
    golden: {
        rate: number;
        firstTryCoinMultiplier: number;
        retryCoinMultiplier: number;
    };
}

let activeTuning: MathTuningData | null = null;

export const MathTuning = {
    initialize(data: MathTuningData): void {
        activeTuning = data;
    },

    isInitialized(): boolean {
        return activeTuning !== null;
    },
};

/** The live tuning values. Throws until MathTuning.initialize has run. */
export function mathTuning(): MathTuningData {
    if (!activeTuning) {
        throw new Error(
            '[MathTuning] not initialized - load data/tuning/math_tuning.json first ' +
            '(BootScene does this in the browser; Node tools must read the file themselves)',
        );
    }
    return activeTuning;
}
