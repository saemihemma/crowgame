import type { MathProblem, ProblemDifficultyTraits } from '../math-kernel/utils/Types';
import { parseWordedArithmetic } from '../math-kernel/math/wordedArithmetic';

type ParsedArithmeticPrompt = {
    left: number;
    operator: '+' | '-' | '\u00D7' | '\u00F7';
    right: number;
};

/**
 * An equation whose unknown is NOT on the right-hand side.
 *
 * `known` is the addend the child can see, `total` is the whole, and `unknown`
 * is the answer. Every shape reduces to the same fact -- `known + unknown =
 * total` -- which is what makes one verifier enough for all of them.
 */
export type ParsedRelationalPrompt = {
    shape: 'missing_right' | 'missing_left' | 'total_first';
    known: number;
    total: number;
    unknown: number;
};

/**
 * ANCHORED patterns, deliberately. The generic arithmetic regex is a first-match
 * scan, and on a relational prompt it finds the wrong thing with total
 * confidence: "4 + 3 = ? + 5" parses as {4,+,3} and reports the answer as 7 when
 * it is 2. Anchoring means a prompt is relational only if it is EXACTLY one of
 * these shapes, so nothing can be half-recognised.
 *
 * The pools keep canonical English in `prompt.text` (localisation is the
 * `phrasing` overlay), and these three forms are wordless, so they are the same
 * string in every locale.
 */
const RELATIONAL_PATTERNS: Array<{ shape: ParsedRelationalPrompt['shape']; re: RegExp }> = [
    { shape: 'missing_right', re: /^(\d+) \+ \? = (\d+)$/ },
    { shape: 'missing_left', re: /^\? \+ (\d+) = (\d+)$/ },
    { shape: 'total_first', re: /^(\d+) = (\d+) \+ \?$/ },
];

/**
 * An equation this file does not understand, and must not guess at.
 *
 * "4 + 3 = ? + 5" is the motivating case: it is not one of the three shapes
 * above, and the generic scan reads it as {4,+,3} and reports 7 when the answer
 * is 2. Rather than leave that landmine for whoever adds two-sided equations
 * next, this names the condition -- an equation with its unknown somewhere other
 * than alone at the end -- so validate-content can refuse it outright instead of
 * verifying it wrongly.
 *
 * Deliberately narrow: an ordinary prompt has one "?" and it is the last
 * character. Verified against all 3150 authored problems, which produce zero
 * hits.
 */
export function isUnrecognisedEquation(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed.includes('=') || !trimmed.includes('?')) {
        return false;
    }
    if (parseRelationalPrompt(trimmed)) {
        return false;
    }
    const marks = (trimmed.match(/\?/g) ?? []).length;
    return marks !== 1 || !trimmed.endsWith('?');
}

export function parseRelationalPrompt(text: string): ParsedRelationalPrompt | null {
    const trimmed = text.trim();
    for (const { shape, re } of RELATIONAL_PATTERNS) {
        const match = trimmed.match(re);
        if (!match) {
            continue;
        }
        // total_first puts the whole first: "8 = 5 + ?".
        const total = shape === 'total_first' ? Number(match[1]) : Number(match[2]);
        const known = shape === 'total_first' ? Number(match[2]) : Number(match[1]);
        const unknown = total - known;
        if (!Number.isFinite(unknown) || unknown < 0) {
            return null;
        }
        return { shape, known, total, unknown };
    }
    return null;
}

/**
 * The traits of the fact underneath a relational prompt.
 *
 * `maxOperand` is the TOTAL, not the visible addend: "3 + ? = 18" asks a child
 * to work inside eighteen, and the owl's operand cap is the age band, so
 * pretending this problem is a three would smuggle it past the gate.
 */
export function relationalTraits(parsed: ParsedRelationalPrompt): ProblemDifficultyTraits {
    const { known, unknown, total } = parsed;
    return {
        maxOperand: total,
        requiresCarry: known > 0 && unknown > 0 && ((known % 10) + (unknown % 10)) >= 10,
    };
}

export function buildPromptUniquenessKey(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function parseArithmeticPromptIndependent(text: string): ParsedArithmeticPrompt | null {
    // A relational prompt is never an arithmetic one. Checked FIRST because the
    // scan below would otherwise succeed on the wrong operands.
    if (parseRelationalPrompt(text)) {
        return null;
    }

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
    const relational = parseRelationalPrompt(text);
    if (relational) {
        return relational.unknown;
    }

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
    const relational = parseRelationalPrompt(problem.prompt.text);
    if (relational) {
        return relationalTraits(relational);
    }

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
