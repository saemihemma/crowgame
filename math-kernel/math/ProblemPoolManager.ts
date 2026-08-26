/**
 * ProblemPoolManager
 *
 * Organizes math problems by ELO difficulty bands for efficient selection.
 * Assigns initial ELO ratings from static difficulty and tracks per-problem
 * attempt and success telemetry during runtime.
 *
 * Curriculum-aware ELO mapping (tuned for 1st-2nd grade):
 * - Difficulty 1.0: ELO 100 (simplest: 1+1)
 * - Difficulty 1.5: ELO 225 (easy addition)
 * - Difficulty 2.0: ELO 350 (harder addition / simple subtraction)
 * - Difficulty 3.0: ELO 600 (mixed operations)
 * - Difficulty 5.0: ELO 1100 (advanced)
 */

import { AdaptiveProblemSelectionOptions, MathProblem, MathDomain, ProblemELORating } from '../utils/Types';
import { buildProblemReplayKey } from './problemReplayKey';

/**
 * Does this problem ask the child to count things one at a time?
 *
 * Identified by the glyph row its prompt interpolates -- `phrasing.prompt.params.glyphs`
 * -- and deliberately not by its domain. The REPRESENTATION is what
 * maxUngroupedCount is about: all 123 of these happen to sit in `counting`
 * today, but a worded problem that drew a row of berries would be the same ask
 * and has to be caught by the same rule.
 */
function isUngroupedCountRow(problem: MathProblem): boolean {
    return problem.phrasing?.prompt?.params?.glyphs !== undefined;
}

export class ProblemPoolManager {
    private problemsByDomain: Map<MathDomain, MathProblem[]>;
    private problemELORatings: Map<string, ProblemELORating>;

    constructor() {
        this.problemsByDomain = new Map();
        this.problemELORatings = new Map();
    }

    /**
     * Initialize with all available problems from MathProblemManager
     */
    public initialize(allProblems: MathProblem[]): void {
        console.log(`[ProblemPool] Initializing with ${allProblems.length} problems`);

        this.problemsByDomain.clear();
        this.problemELORatings.clear();

        for (const problem of allProblems) {
            if (!this.problemsByDomain.has(problem.domain)) {
                this.problemsByDomain.set(problem.domain, []);
            }
            this.problemsByDomain.get(problem.domain)!.push(problem);

            const elo = this.assignInitialELO(problem);
            this.problemELORatings.set(problem.id, {
                problemId: problem.id,
                eloRating: elo,
                attempts: 0,
                successRate: 0.0
            });
        }

        this.logDistribution();
    }

    /**
     * Assign initial ELO rating based on static difficulty.
     * Uses a curriculum-aware mapping: starts lower, grows slower.
     * Maps difficulty 1-5 → ELO 100-1100
     */
    private assignInitialELO(problem: MathProblem): number {
        const minELO = 100;
        const maxELO = 1100;
        const minDifficulty = 1;
        const maxDifficulty = 5;

        const clampedDifficulty = Math.max(minDifficulty, Math.min(maxDifficulty, problem.difficulty));
        const normalized = (clampedDifficulty - minDifficulty) / (maxDifficulty - minDifficulty);
        const elo = Math.round(minELO + normalized * (maxELO - minELO));

        return elo;
    }

    /**
     * Get problems within an ELO range for a specific domain
     */
    public getProblemsInRange(
        domain: MathDomain,
        minELO: number,
        maxELO: number,
        excludeIds: string[],
        constraints?: AdaptiveProblemSelectionOptions,
    ): MathProblem[] {
        return this.getAllProblemsForDomain(domain).filter(problem => {
            if (!this.passesCommonConstraints(problem, excludeIds, constraints)) return false;

            const rating = this.problemELORatings.get(problem.id);
            if (!rating) return false;

            return rating.eloRating >= minELO && rating.eloRating <= maxELO;
        });
    }

    public getProblemsBySkillsInRange(
        domain: MathDomain,
        skills: string[],
        minELO: number,
        maxELO: number,
        excludeIds: string[],
        constraints?: AdaptiveProblemSelectionOptions,
    ): MathProblem[] {
        if (skills.length === 0) {
            return this.getProblemsInRange(domain, minELO, maxELO, excludeIds, constraints);
        }

        const wanted = new Set(skills);
        return this.getProblemsInRange(domain, minELO, maxELO, excludeIds, constraints)
            .filter(problem => problem.skills.some(skill => wanted.has(skill)));
    }

    public getProblemsInCurriculumStepRange(
        domain: MathDomain,
        minStep: number,
        maxStep: number,
        excludeIds: string[],
        constraints?: AdaptiveProblemSelectionOptions,
    ): MathProblem[] {
        return this.getAllProblemsForDomain(domain).filter(problem =>
            this.passesCommonConstraints(problem, excludeIds, constraints) &&
            problem.curriculumStep >= minStep &&
            problem.curriculumStep <= maxStep,
        );
    }

    public getProblemsBySkillsInCurriculumStepRange(
        domain: MathDomain,
        skills: string[],
        minStep: number,
        maxStep: number,
        excludeIds: string[],
        constraints?: AdaptiveProblemSelectionOptions,
    ): MathProblem[] {
        if (skills.length === 0) {
            return this.getProblemsInCurriculumStepRange(domain, minStep, maxStep, excludeIds, constraints);
        }

        const wanted = new Set(skills);
        return this.getProblemsInCurriculumStepRange(domain, minStep, maxStep, excludeIds, constraints)
            .filter(problem => problem.skills.some(skill => wanted.has(skill)));
    }

    public getProblemCurriculumStep(problemId: string): number {
        for (const problems of this.problemsByDomain.values()) {
            const found = problems.find(problem => problem.id === problemId);
            if (found) {
                return found.curriculumStep;
            }
        }
        return 0;
    }

    public getProblemELO(problemId: string): number {
        const rating = this.problemELORatings.get(problemId);
        return rating ? rating.eloRating : 150;
    }

    /**
     * Record what happened on a problem. Attempts and success rate only.
     *
     * NOT a difficulty update, which is what this was called
     * (`updateProblemRating`) for as long as it has existed while never touching
     * `eloRating`. Renamed rather than made true, because making it true here is
     * the wrong place: the ratings map is rebuilt by initialize() on every boot
     * and never saved, and a child answers perhaps fifty problems out of 3,736 in
     * a session -- so nearly every entry would calibrate from zero or one
     * observation, which is not calibration.
     *
     * Item difficulty has to be calibrated across children, and the attempts
     * already go somewhere that can: every one is submitted to the API with its
     * problem id and outcome.
     */
    public recordProblemOutcome(problemId: string, success: boolean): void {
        const rating = this.problemELORatings.get(problemId);
        if (!rating) return;

        rating.attempts++;

        const totalSuccesses = rating.successRate * (rating.attempts - 1);
        const newSuccesses = success ? totalSuccesses + 1 : totalSuccesses;
        rating.successRate = newSuccesses / rating.attempts;
    }

    public getAllProblemsForDomain(domain: MathDomain): MathProblem[] {
        return this.problemsByDomain.get(domain) || [];
    }

    public getTotalProblems(): number {
        let total = 0;
        for (const problems of this.problemsByDomain.values()) {
            total += problems.length;
        }
        return total;
    }

    private logDistribution(): void {
        console.log('[ProblemPool] Distribution by domain and ELO:');

        for (const [domain, problems] of this.problemsByDomain.entries()) {
            const eloGroups: Record<number, number> = {};

            for (const problem of problems) {
                const elo = this.getProblemELO(problem.id);
                eloGroups[elo] = (eloGroups[elo] || 0) + 1;
            }

            const eloSummary = Object.entries(eloGroups)
                .map(([elo, count]) => `ELO ${elo}: ${count}`)
                .join(', ');

            console.log(`  ${domain}: ${problems.length} problems (${eloSummary})`);
        }
    }

    private passesCommonConstraints(
        problem: MathProblem,
        excludeIds: string[],
        constraints?: AdaptiveProblemSelectionOptions,
    ): boolean {
        if (excludeIds.includes(problem.id)) return false;

        if (constraints?.difficultyRange) {
            const [minDifficulty, maxDifficulty] = constraints.difficultyRange;
            if (problem.difficulty < minDifficulty || problem.difficulty > maxDifficulty) {
                return false;
            }
        }

        if (constraints?.maxCurriculumStep !== undefined && problem.curriculumStep > constraints.maxCurriculumStep) {
            return false;
        }

        if (
            constraints?.maxOperand !== undefined &&
            problem.difficultyTraits?.maxOperand !== undefined &&
            problem.difficultyTraits.maxOperand > constraints.maxOperand
        ) {
            return false;
        }

        if (constraints?.maxUngroupedCount !== undefined && isUngroupedCountRow(problem)) {
            const answer = Number(problem.answer?.correct);
            if (Number.isFinite(answer) && answer > constraints.maxUngroupedCount) {
                return false;
            }
        }

        if (constraints?.excludedReplayKeys?.includes(buildProblemReplayKey(problem))) {
            return false;
        }

        return true;
    }
}
