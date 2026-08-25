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
        return {
            maxOperand: Math.max(parsed.left, parsed.right, evaluateArithmeticPrompt(problem.prompt.text) ?? 0),
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
        return deriveAdditionStep(relational.known, relational.unknown);
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
        return deriveMultiplicativeStep(problem.difficulty, parsed.left, parsed.right);
    }

    if (parsed.operator === '\u00F7') {
        return deriveMultiplicativeStep(problem.difficulty, parsed.right, Number(problem.answer.correct));
    }

    return deriveNonArithmeticStep(problem.difficulty);
}

function deriveAdditionStep(left: number, right: number): number {
    const maxOperand = Math.max(left, right);
    const requiresCarry = left > 0 && right > 0 && ((left % 10) + (right % 10)) >= 10;

    if (maxOperand <= 20) {
        return clamp((maxOperand - 1) + (requiresCarry ? 1 : 0), 0, 20);
    }

    return 21 + Math.min(20, Math.floor((maxOperand - 21) / 5));
}

function deriveSubtractionStep(left: number, right: number): number {
    const maxOperand = Math.max(left, right);
    const requiresBorrow = left >= 10 && (left % 10) < (right % 10);

    if (maxOperand <= 20) {
        return clamp((maxOperand - 5) + (requiresBorrow ? 1 : 0), 0, 20);
    }

    return 21 + Math.min(20, Math.floor((maxOperand - 21) / 5));
}

function deriveMultiplicativeStep(difficulty: number, left: number, right: number): number {
    const maxOperand = Math.max(left, right);
    const difficultyBand = Math.round((difficulty - 1) * 4);
    return clamp(difficultyBand + Math.max(0, maxOperand - 3), 0, 20);
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
