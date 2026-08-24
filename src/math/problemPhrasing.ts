import { TextManager } from '../systems/TextManager';
import type { MathProblem, PhrasingRef } from '../utils/Types';

/**
 * Render a problem's question, hint and explanation in the active locale.
 *
 * The pools store their sentences in canonical English at `prompt.text`, `hint`
 * and `explanation`, and those fields must stay English: tools/math_verifier.ts
 * recomputes each answer by parsing operands out of `prompt.text`,
 * src/math/problemReplayKey.ts builds the anti-repeat key from it with literal
 * tests like startsWith('count these:'), and the golden fixtures shared with the
 * Godot parity tests compare it byte for byte.
 *
 * So localisation is an overlay applied at render time. Each problem may carry a
 * `phrasing` sibling naming an i18n key plus its numeric parameters, derived and
 * verified by tools/derive_math_phrasing.mjs. When the key resolves we render it;
 * when it does not -- no phrasing entry, a key missing from the bundle, a
 * derivation that failed verification -- we return the English. A child sees
 * their own language or they see English, never a raw key.
 */

function renderRef(ref: PhrasingRef | undefined, fallback: string): string {
    if (!ref?.key) return fallback;
    return TextManager.getInstance().tp(ref.key, ref.params, ref.plural) ?? fallback;
}

/** The question, localised where possible. */
export function localisedPrompt(problem: MathProblem): string {
    return renderRef(problem.phrasing?.prompt, problem.prompt.text);
}

/** The hint, localised where possible. Undefined when the problem has none. */
export function localisedHint(problem: MathProblem): string | undefined {
    if (!problem.hint) return undefined;
    return renderRef(problem.phrasing?.hint, problem.hint);
}

/**
 * The explanation, localised where possible.
 *
 * Nothing renders explanations yet in either runtime -- 2908 of them sit in the
 * pools unread. This exists so that whatever surface shows them is localised on
 * the day it is built, rather than needing this pass done again.
 */
export function localisedExplanation(problem: MathProblem): string | undefined {
    if (!problem.explanation) return undefined;
    return renderRef(problem.phrasing?.explanation, problem.explanation);
}
