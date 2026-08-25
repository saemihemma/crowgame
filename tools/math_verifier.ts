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
    shape: 'missing_right' | 'missing_left' | 'total_first' | 'both_sides';
    /** The operator the equation is written with. */
    operator: '+' | '-';
    /** The addend or minuend the child can see. */
    known: number;
    /** The whole: the number both sides have to agree on. */
    total: number;
    unknown: number;
    /**
     * Every number in play, for trait derivation. A two-sided form has five --
     * including the total nobody writes down -- and `known`/`total` cannot
     * describe all of them.
     */
    operands: number[];
    /**
     * The plain arithmetic underneath, as `[left, right]` where
     * `left <operator> right` gives the third number. "? - 3 = 5" is the fact
     * `8 - 3`, and the ORDER matters: subtraction's minuend has to come first,
     * for the borrow rule and for the step derivation alike.
     */
    fact: [number, number];
};

type RelationalPattern = {
    shape: ParsedRelationalPrompt['shape'];
    re: RegExp;
    /** Turn the captured digits into the fact underneath the writing. */
    read: (n: number[], op: '+' | '-') => {
        known: number; total: number; unknown: number; operands: number[]; fact: [number, number];
    };
};

/**
 * ANCHORED patterns, deliberately. The generic arithmetic regex is a first-match
 * scan, and on a relational prompt it finds the wrong thing with total
 * confidence: "4 + 3 = ? + 5" reads as {4,+,3} and reports 7 when the answer is
 * 2. Anchoring means a prompt is relational only if it is EXACTLY one of these
 * shapes, so nothing can be half-recognised.
 *
 * Each pattern carries its own reader rather than sharing one formula, because
 * the same three numbers rearrange per shape and per operator: "5 - ? = 2" and
 * "? - 3 = 5" are not the same question and must not be verified as though they
 * were.
 *
 * The pools keep canonical English in `prompt.text` (localisation is the
 * `phrasing` overlay), and every form here is wordless, so it is the same string
 * in every locale.
 */
const RELATIONAL_PATTERNS: RelationalPattern[] = [
    {
        // a ? b = c, unknown in the second operand slot.
        shape: 'missing_right',
        re: /^(\d+) ([+-]) \? = (\d+)$/,
        read: ([a, c], op) => {
            const unknown = op === '+' ? c - a : a - c;
            return { known: a, total: c, unknown, operands: [a, c, unknown], fact: [a, unknown] };
        },
    },
    {
        // ? ? b = c, unknown in the first operand slot.
        shape: 'missing_left',
        re: /^\? ([+-]) (\d+) = (\d+)$/,
        read: ([b, c], op) => {
            const unknown = op === '+' ? c - b : c + b;
            return { known: b, total: c, unknown, operands: [b, c, unknown], fact: [unknown, b] };
        },
    },
    {
        // c = a ? b, the whole written first.
        shape: 'total_first',
        re: /^(\d+) = (\d+) ([+-]) \?$/,
        read: ([c, a], op) => {
            const unknown = op === '+' ? c - a : a - c;
            return { known: a, total: c, unknown, operands: [a, c, unknown], fact: [a, unknown] };
        },
    },
    {
        // a + b = ? + d -- an operation on BOTH sides. The form Falkner, Levi
        // and Carpenter tested, and the one that separates "=" as a relation
        // from "=" as an instruction: a child reading it as "compute" answers
        // a + b.
        shape: 'both_sides',
        re: /^(\d+) \+ (\d+) = \? \+ (\d+)$/,
        read: ([a, b, d]) => {
            const total = a + b;
            // `total` is in the list on purpose: "8 + 7 = ? + 6" makes a child
            // work inside fifteen, and no 15 appears in the prompt. Leaving it
            // out under-reports the difficulty and smuggles the problem past the
            // owl's cap. carryPair is (a, b) -- the side that is actually added.
            return {
                known: d, total, unknown: total - d,
                operands: [a, b, d, total, total - d], fact: [a, b],
            };
        },
    },
];

/**
 * An equation this file does not understand, and must not guess at.
 *
 * validate-content skips both its answer check and its trait check when a parse
 * comes back null, so an unrecognised shape would ship with neither ever
 * independently re-derived. This names the condition -- an equation with its
 * unknown somewhere other than alone at the end -- so it can be refused instead.
 *
 * Deliberately narrow: an ordinary prompt has one "?" and it is the last
 * character. Verified against every authored problem, which produces zero hits.
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
    for (const { shape, re, read } of RELATIONAL_PATTERNS) {
        const match = trimmed.match(re);
        if (!match) {
            continue;
        }
        const captured = match.slice(1);
        const operator = (captured.find(c => c === '+' || c === '-') ?? '+') as '+' | '-';
        const numbers = captured.filter(c => c !== '+' && c !== '-').map(Number);
        const fact = read(numbers, operator);
        // A relational prompt whose answer is negative is not a hard problem, it
        // is a broken one: nothing in this age band has an answer below zero.
        if (!Number.isFinite(fact.unknown) || fact.unknown < 0) {
            return null;
        }
        return { shape, operator, ...fact };
    }
    return null;
}

/**
 * The traits of the fact underneath a relational prompt.
 *
 * `maxOperand` is the largest number the child has to hold, whichever slot it
 * sits in -- including one nobody wrote down: "8 + 7 = ? + 6" asks a child to
 * work inside fifteen even though no 15 appears in the prompt. The owl's cap is
 * the age band, so under-reporting here would smuggle a problem past the gate.
 */
export function relationalTraits(parsed: ParsedRelationalPrompt): ProblemDifficultyTraits {
    const maxOperand = Math.max(...parsed.operands);
    if (parsed.operator === '-') {
        const [minuend, subtrahend] = parsed.fact;
        return {
            maxOperand,
            requiresBorrow: minuend >= 10 && (minuend % 10) < (subtrahend % 10),
        };
    }
    const [x, y] = parsed.fact;
    return {
        maxOperand,
        requiresCarry: x > 0 && y > 0 && ((x % 10) + (y % 10)) >= 10,
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
        // Divisor and quotient, NOT the dividend.
        //
        // The dividend is the largest number in a division but the least
        // demanding: in 24 / 3 = 8 the child reasons with the 3 and produces the
        // 8, and the 24 is just the product they already have. Counting it made
        // 24 / 3 read as a twenty-four, so the owl's cap of 20 dropped it --
        // while the multiplication fact 3 x 8 that answers it sailed through at
        // maxOperand 8. Same fact, two verdicts.
        //
        // deriveCurriculumStep has always agreed with this: it calls
        // deriveDivisionStep(divisor, quotient) and never looks at the dividend.
        // The traits were the odd one out, and 275 of 383 division problems were
        // unreachable because of it.
        return {
            maxOperand: Math.max(parsed.right, evaluated ?? 0),
        };
    }

    return {
        maxOperand: Math.max(parsed.left, parsed.right),
    };
}
