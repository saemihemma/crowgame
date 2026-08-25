/**
 * Grade derivation and verdict semantics — pure functions, no database.
 *
 * The dates here pin the Icelandic school-start rule (lög um grunnskóla
 * 91/2008, 15. gr.): a child born 2019 is in 1. bekkur for the whole
 * 2025-2026 school year — from the August boundary through the following
 * July — and everyone born the same calendar year gets the same grade
 * regardless of birth month, because only the year enters the formula.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expectationFor, schoolGradeFor } from '../src/lib/grade.ts';

describe('schoolGradeFor', () => {
    it('starts grade 1 the autumn of the calendar year the child turns six', () => {
        assert.equal(schoolGradeFor(2019, new Date('2025-09-15T12:00:00Z')), 1);
        // Still grade 1 across New Year and through the summer break...
        assert.equal(schoolGradeFor(2019, new Date('2026-05-01T12:00:00Z')), 1);
        assert.equal(schoolGradeFor(2019, new Date('2026-07-31T12:00:00Z')), 1);
        // ...and grade 2 from the August boundary.
        assert.equal(schoolGradeFor(2019, new Date('2026-08-02T12:00:00Z')), 2);
        // Before school age: leikskóli, never negative.
        assert.equal(schoolGradeFor(2019, new Date('2025-07-31T12:00:00Z')), 0);
        assert.equal(schoolGradeFor(2021, new Date('2026-01-15T12:00:00Z')), 0);
    });
});

describe('expectationFor', () => {
    it('grades addition against the grade-1 and grade-2 milestones', () => {
        // Grade 1, past the end-of-grade-1 step (15): ahead.
        assert.equal(expectationFor(1, 16, 'addition')?.status, 'ahead');
        // Grade 1, early steps: on track for the whole school year (no floor before grade 1).
        assert.equal(expectationFor(1, 3, 'addition')?.status, 'on_track');
        // Grade 2, below the END of grade 1 (step 15): the honest nudge signal.
        assert.equal(expectationFor(2, 10, 'addition')?.status, 'practice');
        assert.equal(expectationFor(2, 20, 'addition')?.status, 'on_track');
        assert.equal(expectationFor(2, 36, 'addition')?.status, 'ahead');
    });

    it('a domain not yet expected at this grade can only be a head start', () => {
        const mult = expectationFor(1, 0, 'multiplication');
        assert.equal(mult?.status, 'not_expected_yet');
        assert.equal(mult?.refGrade, 3);
        assert.equal(expectationFor(1, 12, 'multiplication')?.status, 'ahead');
    });

    it('leikskóli has no floor: exploring or ahead, never practice', () => {
        assert.equal(expectationFor(0, 0, 'addition')?.status, 'not_expected_yet');
        assert.equal(expectationFor(0, 15, 'addition')?.status, 'ahead');
        assert.equal(expectationFor(0, 2, 'counting')?.status, 'not_expected_yet');
    });

    it('grades past the game scope are capped, and say so', () => {
        const g5 = expectationFor(5, 36, 'addition');
        assert.equal(g5?.status, 'ahead');
        assert.equal(g5?.scopeCappedAtGrade, 2);
        assert.equal(g5?.refGrade, 2);
    });

    it('unknown domains have no verdict', () => {
        assert.equal(expectationFor(1, 5, 'quantum_flux'), null);
    });
});
