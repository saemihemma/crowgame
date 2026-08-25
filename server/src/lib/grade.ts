import { GRADE_MILESTONES, SCHOOL_YEAR_BOUNDARY_MONTH } from '../generated/gradeExpectations.js';

/**
 * Icelandic school-grade derivation and grade-vs-skill verdicts.
 *
 * Grade comes from birth YEAR alone: compulsory school starts at the beginning
 * of the school year in the calendar year the child turns six (lög um
 * grunnskóla nr. 91/2008, 15. gr.) — every child born in 2019 enters 1. bekkur
 * in autumn 2025 regardless of birth month. Grade <= 0 means leikskóli.
 *
 * Verdicts are BANDS on purpose (see docs/GRADE_EXPECTATIONS.md): Iceland
 * defines no within-year pacing for grades 1-3, so a child is "on track" for
 * the whole school year they are working through, "ahead" once they have
 * covered what this year works toward, and "practice" only when they have not
 * yet reached the END of the previous grade's material. Leikskóli has no
 * floor at all — Aðalnámskrá leikskóla defines no mathematics criteria.
 */

export const LEIKSKOLI = 0;

/** Grade in the school year containing `now` (UTC). 0 = leikskóli, capped at 10. */
export function schoolGradeFor(birthYear: number, now: Date): number {
    const schoolYearStart = now.getUTCMonth() + 1 >= SCHOOL_YEAR_BOUNDARY_MONTH
        ? now.getUTCFullYear()
        : now.getUTCFullYear() - 1;
    const grade = schoolYearStart - birthYear - 5;
    return Math.min(Math.max(grade, LEIKSKOLI), 10);
}

export type ExpectationStatus = 'not_expected_yet' | 'ahead' | 'on_track' | 'practice';

export interface Expectation {
    status: ExpectationStatus;
    /** The grade whose material the verdict is measured against. */
    refGrade: number;
    /** Set when the child's grade is past the game's last milestone for the domain. */
    scopeCappedAtGrade: number | null;
}

/** Verdict for one domain, or null when the domain has no milestone table. */
export function expectationFor(grade: number, highestStep: number, domain: string): Expectation | null {
    const milestones = GRADE_MILESTONES[domain];
    if (!milestones || milestones.length === 0) return null;

    const first = milestones[0]!;
    const last = milestones[milestones.length - 1]!;

    // The domain has not started yet at this grade (multiplication in grade 1,
    // everything at leikskóli age): nothing can be "behind", play is a head start.
    if (grade < first.endOfGrade) {
        return {
            status: highestStep >= first.step ? 'ahead' : 'not_expected_yet',
            refGrade: first.endOfGrade,
            scopeCappedAtGrade: null,
        };
    }

    const effectiveGrade = Math.min(grade, last.endOfGrade);
    const target = milestones.find(m => m.endOfGrade >= effectiveGrade) ?? last;
    const prior = [...milestones].reverse().find(m => m.endOfGrade < effectiveGrade) ?? null;

    let status: ExpectationStatus;
    if (highestStep >= target.step) status = 'ahead';
    else if (prior === null || highestStep >= prior.step) status = 'on_track';
    else status = 'practice';

    return {
        status,
        refGrade: target.endOfGrade,
        scopeCappedAtGrade: grade > last.endOfGrade ? last.endOfGrade : null,
    };
}
