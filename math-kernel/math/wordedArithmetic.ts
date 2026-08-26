/**
 * Worded arithmetic prompts.
 *
 * The math pipeline treats prompt text as the source of truth: curriculum
 * steps, difficulty traits, replay keys, and the independent verifier all
 * re-derive the underlying fact by parsing the prompt. Word problems have no
 * operator symbol to parse, so every worded template lives here as an exact
 * pattern that maps back to `left <op> right`.
 *
 * Adding a new worded prompt shape means adding its pattern here — the
 * authoring generator, the runtime replay key, and the verifier all consume
 * this table, so they can never drift apart.
 */

export type WordedOperator = '+' | '-' | '×' | '÷';

export type WordedArithmetic = {
    left: number;
    operator: WordedOperator;
    right: number;
};

// CGI situation types, one shape each (docs/MATH_AUTHORING_STANDARDS.md §1):
// join-result (find), separate-result (eat / fly away), equal groups (nests),
// partitive sharing (shared by birds). Both quantities are authored ≥ 2 in the
// multiplicative shapes so the plural nouns are always correct in both locales.
const WORDED_PATTERNS: Array<{ pattern: RegExp; operator: WordedOperator }> = [
    { pattern: /^you have (\d+) berries\. you find (\d+) more\./, operator: '+' },
    { pattern: /^(\d+) birds sit on a branch\. (\d+) more land\./, operator: '+' },
    { pattern: /^you have (\d+) berries\. you eat (\d+)\./, operator: '-' },
    { pattern: /^(\d+) birds sit on a branch\. (\d+) fly away\./, operator: '-' },
    { pattern: /^there are (\d+) nests\. each nest has (\d+) eggs\./, operator: '×' },
    { pattern: /^(\d+) berries are shared by (\d+) birds\./, operator: '÷' },
];

export function parseWordedArithmetic(text: string): WordedArithmetic | null {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    for (const { pattern, operator } of WORDED_PATTERNS) {
        const match = normalized.match(pattern);
        if (match) {
            return {
                left: Number(match[1]),
                operator,
                right: Number(match[2]),
            };
        }
    }
    return null;
}
