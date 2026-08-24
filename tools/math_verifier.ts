import type { MathProblem, ProblemDifficultyTraits } from '../src/utils/Types';
import { parseWordedArithmetic } from '../src/math/wordedArithmetic';

type ParsedArithmeticPrompt = {
    left: number;
    operator: '+' | '-' | '\u00D7' | '\u00F7';
    right: number;
};

export function buildPromptUniquenessKey(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function parseArithmeticPromptIndependent(text: string): ParsedArithmeticPrompt | null {
    const match = text.match(/(\d+)\s*([+\-*\/\u00D7\u00F7])\s*(\d+)/);
    if (!match) {
        // Worded prompts carry no operator symbol; the shared pattern table
        // maps each authored story shape back to its underlying fact.
        return parseWordedArithmetic(text);
    }

    const rawOperator = match[2];
    const operator = rawOperator === '*' ? '\u00D7' : rawOperator === '/' ? '\u00F7' : rawOperator;
    if (operator !== '+' && operator !== '-' && operator !== '\u00D7' && operator !== '\u00F7') {
        return null;
    }

    return {
        left: Number(match[1]),
        operator,
        right: Number(match[3]),
    };
}

export function evaluateArithmeticPrompt(text: string): number | null {
    const parsed = parseArithmeticPromptIndependent(text);
    if (!parsed) {
        return null;
    }

    switch (parsed.operator) {
        case '+':
            return parsed.left + parsed.right;
        case '-':
            return parsed.left - parsed.right;
        case '\u00D7':
            return parsed.left * parsed.right;
        case '\u00F7':
            if (parsed.right === 0) {
                return null;
            }
            return parsed.left / parsed.right;
        default:
            return null;
    }
}

export function deriveVerifiedDifficultyTraits(problem: MathProblem): ProblemDifficultyTraits | undefined {
    const parsed = parseArithmeticPromptIndependent(problem.prompt.text);
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
        const evaluated = evaluateArithmeticPrompt(problem.prompt.text);
        return {
            maxOperand: Math.max(parsed.left, parsed.right, evaluated ?? 0),
        };
    }

    return {
        maxOperand: Math.max(parsed.left, parsed.right),
    };
}
