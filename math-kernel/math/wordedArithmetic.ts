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

// CGI situation types (docs/MATH_AUTHORING_STANDARDS.md §1). Both quantities are
// authored ≥ 2 in every shape, so the plural nouns are correct in both locales
// without per-number inflection.
//
// The additive taxonomy has four situations and this table used to cover two of
// them twice over: join-result (find, land) and separate-result (eat, fly away),
// with COMPARE and PART-PART-WHOLE — the two a child finds hardest, and the two
// §1 names as shipped-in-the-taxonomy-but-not-in-the-pools — absent. The
// multiplicative side had equal-groups and partitive sharing, but neither the
// ARRAY shape nor QUOTATIVE (measurement) division, which is the one that asks
// "how many groups" rather than "how many each".
//
// Ordering matters where two patterns share a prefix: "you have N berries. a
// bird has N more." and "you have N berries. a bird has N berries." are told
// apart by their suffix, so both are anchored through to the full stop.
const WORDED_PATTERNS: Array<{ pattern: RegExp; operator: WordedOperator }> = [
    // Join / separate result: the two the pools have always had.
    { pattern: /^you have (\d+) berries\. you find (\d+) more\./, operator: '+' },
    { pattern: /^(\d+) birds sit on a branch\. (\d+) more land\./, operator: '+' },
    { pattern: /^you have (\d+) berries\. you eat (\d+)\./, operator: '-' },
    { pattern: /^(\d+) birds sit on a branch\. (\d+) fly away\./, operator: '-' },
    // Compare. Quantity unknown ("how many does the OTHER one have") adds;
    // difference unknown ("how many more do you have") subtracts. Same two
    // numbers, opposite operations, and telling them apart is the whole skill.
    { pattern: /^you have (\d+) berries\. a bird has (\d+) more\./, operator: '+' },
    { pattern: /^you have (\d+) berries\. a bird has (\d+) berries\./, operator: '-' },
    // Part-part-whole. Whole unknown joins the two parts; part unknown takes the
    // known part off the whole. Neither is a story about anything HAPPENING,
    // which is what separates it from join and separate.
    { pattern: /^there are (\d+) red berries and (\d+) blue berries\./, operator: '+' },
    { pattern: /^there are (\d+) berries\. (\d+) are red\./, operator: '-' },
    // Equal groups, and the array that says the same product a different way.
    { pattern: /^there are (\d+) nests\. each nest has (\d+) eggs\./, operator: '×' },
    { pattern: /^there are (\d+) rows of (\d+) eggs\./, operator: '×' },
    // Partitive sharing ("how many each") and quotative measurement ("how many
    // groups"). The second is the inverse question and the natural partner of
    // the missing-divisor relational shape.
    { pattern: /^(\d+) berries are shared by (\d+) birds\./, operator: '÷' },
    { pattern: /^you have (\d+) berries\. you put (\d+) in each nest\./, operator: '÷' },
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
