/**
 * ELOManager
 *
 * Core ELO rating system for adaptive math difficulty.
 * Tuned for 1st-2nd grade kids: starts very low, grows slowly.
 *
 * Key Concepts:
 * - Global ELO: Overall math ability (100-1200 range)
 * - Domain Modifiers: Per-domain adjustments (-100 to +100)
 * - Effective ELO = Global ELO + Domain Modifier
 * - K-Factor: Very slow (4 → 3 → 2) for gentle progression with lots of repetition
 * - 70/30 Split: 70% of rating change goes to global, 30% to domain modifier
 * - Delta Cap: +8 / -12 so one answer never swings mastery too far
 */

import { PlayerELOStats, ELOUpdateResult, MathDomain } from '../utils/Types';

export class ELOManager {
    private static instance: ELOManager;
    private playerStats!: PlayerELOStats;

    private constructor() {}

    public static getInstance(): ELOManager {
        if (!ELOManager.instance) {
            ELOManager.instance = new ELOManager();
        }
        return ELOManager.instance;
    }

    /**
     * Initialize ELO stats from save data
     */
    public initialize(saveData: PlayerELOStats | undefined): void {
        if (saveData) {
            this.playerStats = saveData;
            console.log(`[ELO] Loaded existing player: ELO ${saveData.globalELO}, ${saveData.problemsAttempted} problems attempted`);
        } else {
            this.playerStats = ELOManager.createDefaultStats();
            console.log(`[ELO] New player initialized: Starting ELO 150`);
        }
    }

    /**
     * Get default ELO stats for new player.
     * Starts at 150 — maps to absolute easiest problems (1+1 tier).
     */
    public static createDefaultStats(): PlayerELOStats {
        return {
            globalELO: 150,
            domainModifiers: {
                addition: 0,
                subtraction: 0,
                multiplication: 0,
                division: 0,
                counting: 0,
                comparison: 0,
                pattern_matching: 0,
                number_sequence: 0
            },
            problemsAttempted: 0,
            lastUpdated: Date.now()
        };
    }

    /**
     * Calculate expected score (probability of success)
     */
    private calculateExpectedScore(playerELO: number, problemELO: number): number {
        return 1 / (1 + Math.pow(10, (problemELO - playerELO) / 400));
    }

    /**
     * Get K-factor based on player experience.
     * Very slow progression for young kids — lots of repetition before advancing.
     * ~50-80 correct answers to move up one difficulty tier.
     */
    private getKFactor(problemsAttempted: number): number {
        if (problemsAttempted < 50) return 4;    // Gentle calibration
        if (problemsAttempted < 200) return 3;   // Slow adjustment
        return 2;                                 // Very stable
    }

    /**
     * Update player rating after answering a problem
     */
    public updateRating(
        domain: MathDomain,
        problemELO: number,
        actualScore: number
    ): ELOUpdateResult {
        const effectiveELO = this.getEffectiveELO(domain);
        const expected = this.calculateExpectedScore(effectiveELO, problemELO);
        const K = this.getKFactor(this.playerStats.problemsAttempted);
        const rawChange = K * (actualScore - expected);
        const totalChange = Math.max(-12, Math.min(8, rawChange));

        // Split change: 70% global, 30% domain modifier
        const globalChange = totalChange * 0.7;
        const domainChange = totalChange * 0.3;

        // Apply global ELO change (bounded at 100-1200)
        this.playerStats.globalELO = Math.max(100, Math.min(1200,
            this.playerStats.globalELO + globalChange));

        // Apply domain modifier change (bounded at ±100)
        const currentModifier = this.playerStats.domainModifiers[domain];
        this.playerStats.domainModifiers[domain] = Math.max(-100, Math.min(100,
            currentModifier + domainChange));

        this.playerStats.problemsAttempted++;
        this.playerStats.lastUpdated = Date.now();

        console.log(
            `[ELO] ${domain} | ` +
            `Player: ${effectiveELO.toFixed(0)} | ` +
            `Problem: ${problemELO} | ` +
            `Expected: ${expected.toFixed(2)} | ` +
            `Actual: ${actualScore.toFixed(1)} | ` +
            `Change: ${totalChange > 0 ? '+' : ''}${totalChange.toFixed(1)} | ` +
            `New Global: ${this.playerStats.globalELO.toFixed(0)}`
        );

        return {
            newGlobalELO: this.playerStats.globalELO,
            newDomainModifier: this.playerStats.domainModifiers[domain],
            change: totalChange,
            expectedScore: expected
        };
    }

    public getEffectiveELO(domain: MathDomain): number {
        return this.playerStats.globalELO + this.playerStats.domainModifiers[domain];
    }

    public getStats(): PlayerELOStats {
        return this.playerStats;
    }

    public getGlobalELO(): number {
        return this.playerStats.globalELO;
    }

    public getDomainModifier(domain: MathDomain): number {
        return this.playerStats.domainModifiers[domain];
    }

    public getProblemsAttempted(): number {
        return this.playerStats.problemsAttempted;
    }
}
