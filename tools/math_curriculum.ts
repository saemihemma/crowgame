import type { MathProblem, ProblemDifficultyTraits } from '../math-kernel/utils/Types';
import { parseRelationalPrompt, relationalTraits } from './math_verifier';
import { evaluateArithmeticPrompt, parseArithmeticPromptIndependent } from './math_verifier';

type ParsedArithmetic = {
    left: number;
    operator: '+' | '-' | '\u00D7' | '\u00F7';
    right: number;
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function parseArithmeticPrompt(text: string): ParsedArithmetic | null {
    const parsed = parseArithmeticPromptIndependent(text);
    return parsed ? { ...parsed } : null;
}

export function deriveDifficultyTraits(problem: MathProblem): ProblemDifficultyTraits | undefined {
    // An equation with its unknown somewhere other than the right-hand side is
    // still a fact with operands; it just is not the fact the generic scan would
    // read out of it.
    const relational = parseRelationalPrompt(problem.prompt.text);
    if (relational) {
        return relationalTraits(relational);
    }

    const parsed = parseArithmeticPrompt(problem.prompt.text);
    if (!parsed) {
        return undefined;
    }

    if (parsed.operator === '+') {
        return {
            maxOperand: Math.max(parsed.left, parsed.right),
            requiresCarry: parsed.left > 0 && parsed.right > 0 && ((parsed.left % 10) + (parsed.right % 10)) >= 10,
        };
    }

    if (parsed.operator === '-') {
        return {
            maxOperand: Math.max(parsed.left, parsed.right),
            requiresBorrow: parsed.left >= 10 && (parsed.left % 10) < (parsed.right % 10),
        };
    }

    if (parsed.operator === '\u00F7') {
        // Divisor and quotient, not the dividend -- see the long note beside the
        // same rule in tools/math_verifier.ts. These two must agree, because
        // validate-content checks the authored traits against one and the
        // materializer stamps them from the other.
        return {
            maxOperand: Math.max(parsed.right, evaluateArithmeticPrompt(problem.prompt.text) ?? 0),
        };
    }

    return { maxOperand: Math.max(parsed.left, parsed.right) };
}

export function deriveCurriculumStep(problem: MathProblem): number {
    // "5 + ? = 8" is exactly as hard as "5 + 3 = 8" -- the same bond, asked from
    // the other end -- so it earns the same rung. Deriving it from the fact
    // rather than from the authored `difficulty` keeps the step VERIFIED: an
    // author cannot place a relational problem wherever they like.
    const relational = parseRelationalPrompt(problem.prompt.text);
    if (relational) {
        // The rung the plain fact would earn. "5 + ? = 8" is exactly as hard as
        // "5 + 3 = 8" -- the same bond, asked from the other end -- and
        // "? - 3 = 5" is the fact 8 - 3. Deriving from the fact rather than from
        // the authored `difficulty` keeps the step VERIFIED: an author cannot
        // place a relational problem wherever they like.
        const [left, right] = relational.fact;
        return relational.operator === '-'
            ? deriveSubtractionStep(left, right)
            : deriveAdditionStep(left, right);
    }

    const parsed = parseArithmeticPrompt(problem.prompt.text);
    if (!parsed) {
        switch (problem.domain) {
            case 'counting':
                return deriveCountingStep(problem);
            case 'comparison':
                return deriveComparisonStep(problem);
            case 'number_sequence':
                return deriveSequenceStep(problem);
            case 'pattern_matching':
                return derivePatternStep(problem);
            default:
                return deriveNonArithmeticStep(problem.difficulty);
        }
    }

    if (parsed.operator === '+') {
        return deriveAdditionStep(parsed.left, parsed.right);
    }

    if (parsed.operator === '-') {
        return deriveSubtractionStep(parsed.left, parsed.right);
    }

    if (parsed.operator === '\u00D7') {
        return deriveMultiplicationStep(parsed.left, parsed.right);
    }

    if (parsed.operator === '\u00F7') {
        return deriveDivisionStep(parsed.right, Number(problem.answer.correct));
    }

    return deriveNonArithmeticStep(problem.difficulty);
}

/** Ripple carries when adding left + right (e.g. 456 + 567 has 3). */
function countCarries(left: number, right: number): number {
    let a = left;
    let b = right;
    let carry = 0;
    let carries = 0;
    while (a > 0 || b > 0 || carry > 0) {
        const digitSum = (a % 10) + (b % 10) + carry;
        carry = digitSum >= 10 ? 1 : 0;
        if (carry === 1) carries += 1;
        a = Math.floor(a / 10);
        b = Math.floor(b / 10);
    }
    return carries;
}

/** Ripple borrows when subtracting right from left (across zeros counts each). */
function countBorrows(left: number, right: number): number {
    let a = left;
    let b = right;
    let borrow = 0;
    let borrows = 0;
    while (a > 0 || b > 0) {
        const digit = (a % 10) - (b % 10) - borrow;
        borrow = digit < 0 ? 1 : 0;
        if (borrow === 1) borrows += 1;
        a = Math.floor(a / 10);
        b = Math.floor(b / 10);
    }
    return borrows;
}

// Tiers 1-2 (steps 0-40, operands to 120) are FROZEN: children's saves store
// currentStep and the parity fixtures pin this data — see
// docs/MATH_AUTHORING_STANDARDS.md §2.3. Tier 3 (41+) grades by the two factors
// the research separates: digit width, then regrouping load (none / one /
// multiple — subtracting across zeros lands in "multiple" naturally).
function deriveAdditionStep(left: number, right: number): number {
    const maxOperand = Math.max(left, right);
    const requiresCarry = left > 0 && right > 0 && ((left % 10) + (right % 10)) >= 10;

    if (maxOperand <= 20) {
        return clamp((maxOperand - 1) + (requiresCarry ? 1 : 0), 0, 20);
    }
    if (maxOperand <= 120) {
        return 21 + Math.min(20, Math.floor((maxOperand - 21) / 5));
    }

    const fourDigit = maxOperand > 999 || left + right > 999;
    return (fourDigit ? 44 : 41) + Math.min(countCarries(left, right), 2);
}

function deriveSubtractionStep(left: number, right: number): number {
    const maxOperand = Math.max(left, right);
    const requiresBorrow = left >= 10 && (left % 10) < (right % 10);

    if (maxOperand <= 20) {
        return clamp((maxOperand - 5) + (requiresBorrow ? 1 : 0), 0, 20);
    }
    if (maxOperand <= 120) {
        return 21 + Math.min(20, Math.floor((maxOperand - 21) / 5));
    }

    return (maxOperand > 999 ? 44 : 41) + Math.min(countBorrows(left, right), 2);
}

/**
 * The multiplication ladder is the measured table order (easiest tables first,
 * the 6-9 cluster last — docs/MATH_AUTHORING_STANDARDS.md §1/§3), one table per
 * step. A fact belongs to the EARLIEST table containing it: 6×2 is a doubles
 * fact, not a ×6 fact. Squares are their own derived-fact anchor step, and ×0
 * its own step because n×0=n is a distinct misconception. Redesigned 2026-08 —
 * legal only because no owl had ever served multiplication or division.
 */
const TABLE_RANK: Record<number, number> = { 2: 1, 10: 2, 5: 3, 3: 4, 4: 5, 6: 8, 7: 9, 8: 10, 9: 11 };

function deriveMultiplicationStep(left: number, right: number): number {
    if (left === 0 || right === 0) return 6;
    if (left === 1 || right === 1) return 0;
    if (left === right && left >= 3 && left <= 10) return 7;
    if (left <= 10 && right <= 10) {
        const ranks = [TABLE_RANK[left], TABLE_RANK[right]].filter((r): r is number => r !== undefined);
        if (ranks.length > 0) return Math.min(...ranks);
    }

    const big = Math.max(left, right);
    const small = Math.min(left, right);
    if (small <= 9 && big % 10 === 0 && big <= 990) return 12;
    if (small <= 9 && big <= 99) return ((big % 10) * small) < 10 ? 13 : 14;
    return 14;
}

/** A division fact sits one step after the multiplication fact it inverts. */
function deriveDivisionStep(divisor: number, quotient: number): number {
    return clamp(deriveMultiplicationStep(divisor, quotient) + 1, 1, 15);
}

function deriveCountingStep(problem: MathProblem): number {
    const count = typeof problem.answer.correct === 'number'
        ? problem.answer.correct
        : Number(problem.answer.correct);

    if (!Number.isFinite(count)) {
        return deriveNonArithmeticStep(problem.difficulty);
    }

    if (count <= 4) return 0;
    if (count <= 6) return 1;
    if (count <= 8) return 2;
    if (count <= 10) return 3;
    if (count <= 12) return 4;
    if (count <= 15) return 5;
    if (count <= 20) return 6;

    return 7 + Math.min(13, Math.floor((count - 21) / 3));
}

function deriveComparisonStep(problem: MathProblem): number {
    const values = extractPromptNumbers(problem.prompt.text);
    if (values.length < 2) {
        return deriveNonArithmeticStep(problem.difficulty);
    }

    const [left, right] = values;
    const maxOperand = Math.max(left, right);
    const gap = Math.abs(left - right);
    let step = 0;

    if (maxOperand > 5) step += 1;
    if (maxOperand > 8) step += 1;
    if (maxOperand > 10) step += 1;
    if (maxOperand > 12) step += 1;
    if (maxOperand > 15) step += 1;
    if (gap > 3) step += 1;
    // Grade 3-4 tiers. Strictly above the served data (which tops out at 30),
    // so no existing problem's step moves — MATH_AUTHORING_STANDARDS.md §2.3.
    if (maxOperand > 30) step += 1;
    if (maxOperand > 120) step += 1;
    if (maxOperand > 500) step += 1;

    return clamp(step, 0, 20);
}

function deriveSequenceStep(problem: MathProblem): number {
    const values = extractPromptNumbers(problem.prompt.text);
    if (values.length < 2) {
        return deriveNonArithmeticStep(problem.difficulty);
    }

    const correct = typeof problem.answer.correct === 'number'
        ? problem.answer.correct
        : Number(problem.answer.correct);
    const maxVisible = Math.max(...values, Number.isFinite(correct) ? correct : 0);
    const stepDelta = Math.abs(values[1] - values[0]);
    let step = 0;

    if (maxVisible > 5) step += 1;
    if (maxVisible > 10) step += 1;
    if (maxVisible > 15) step += 1;
    if (stepDelta > 1) step += 1;
    if (stepDelta > 2) step += 1;
    if (values.length >= 4) step += 1;
    // Grade 3-4 tiers: skip counting by 25/50/100 into the hundreds. Served
    // data tops out at maxVisible 80 and delta 10, so these thresholds sit
    // strictly above it — no existing step moves (§2.3).
    if (maxVisible > 90) step += 1;
    if (maxVisible > 300) step += 1;
    if (maxVisible > 900) step += 1;
    if (stepDelta > 12) step += 1;

    return clamp(step, 0, 20);
}

function derivePatternStep(problem: MathProblem): number {
    const values = extractPromptNumbers(problem.prompt.text);
    if (values.length < 2) {
        return deriveNonArithmeticStep(problem.difficulty);
    }

    const correct = typeof problem.answer.correct === 'number'
        ? problem.answer.correct
        : Number(problem.answer.correct);
    const visibleValues = Number.isFinite(correct)
        ? [...values, correct]
        : values;
    const maxVisible = Math.max(...visibleValues);
    const uniqueCount = new Set(values).size;
    let step = 0;

    if (uniqueCount >= 3) step += 1;
    if (uniqueCount >= 4) step += 1;
    if (maxVisible > 3) step += 1;
    if (maxVisible > 6) step += 1;
    if (maxVisible > 10) step += 1;
    if (maxVisible > 14) step += 1;
    if (values.length >= 5 && uniqueCount >= 3) step += 1;

    return clamp(step, 0, 20);
}

function extractPromptNumbers(text: string): number[] {
    return Array.from(text.matchAll(/\d+/g), match => Number(match[0]));
}

function deriveNonArithmeticStep(difficulty: number): number {
    return clamp(Math.round((difficulty - 1) * 5), 0, 20);
}
