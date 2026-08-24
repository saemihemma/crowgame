import type { MathProblem } from '../utils/Types';
import { parseWordedArithmetic } from './wordedArithmetic';

type ParsedArithmetic = {
    left: number;
    operator: '+' | '-' | '×' | '÷';
    right: number;
};

function normalizeText(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseArithmetic(text: string): ParsedArithmetic | null {
    const match = normalizeText(text).match(/(\d+)\s*([+\-×÷])\s*(\d+)/);
    if (!match) {
        // Word problems carry no operator symbol; they map to the same
        // underlying fact so wording variants share one replay key.
        return parseWordedArithmetic(text);
    }

    return {
        left: Number(match[1]),
        operator: match[2] as ParsedArithmetic['operator'],
        right: Number(match[3]),
    };
}

function extractNumbers(text: string): number[] {
    return Array.from(normalizeText(text).matchAll(/\d+/g), match => Number(match[0]));
}

function isCountingPrompt(text: string): boolean {
    return text.startsWith('how many are here:') ||
        text.startsWith('count these:') ||
        text.startsWith('count the ');
}

function isComparisonPrompt(text: string): boolean {
    return text.includes('greater') || text.includes('smaller');
}

function buildSequenceLikeKey(problem: Pick<MathProblem, 'domain' | 'prompt' | 'answer'>): string {
    const numbers = extractNumbers(problem.prompt.text);
    const correct = typeof problem.answer.correct === 'number'
        ? problem.answer.correct
        : Number(problem.answer.correct);
    const visible = Number.isFinite(correct) ? [...numbers, correct] : numbers;
    return `${problem.domain}:${visible.join(',')}`;
}

export function buildProblemReplayKey(problem: Pick<MathProblem, 'domain' | 'prompt' | 'answer'>): string {
    const parsed = parseArithmetic(problem.prompt.text);
    if (parsed) {
        const { operator } = parsed;
        if (operator === '+' || operator === '×') {
            const left = Math.min(parsed.left, parsed.right);
            const right = Math.max(parsed.left, parsed.right);
            return `${left} ${operator} ${right}`;
        }

        return `${parsed.left} ${operator} ${parsed.right}`;
    }

    const text = normalizeText(problem.prompt.text);

    if (problem.domain === 'counting' || isCountingPrompt(text)) {
        return `count:${problem.answer.correct}`;
    }

    if (problem.domain === 'comparison' || isComparisonPrompt(text)) {
        const values = extractNumbers(text);
        if (values.length >= 2) {
            const pair = values.slice(0, 2).sort((left, right) => left - right);
            return `compare:${pair[0]}:${pair[1]}:${problem.answer.correct}`;
        }
    }

    if (problem.domain === 'number_sequence' || problem.domain === 'pattern_matching') {
        return buildSequenceLikeKey(problem);
    }

    return text;
}
