/**
 * goldenRoll
 *
 * Decides whether an owl problem arrives golden. Deterministic given
 * (childId, lifetime attempt index): the same save state always rolls the
 * same result, so tests and the Godot port (golden_roll.gd) can replay it
 * exactly — the golden fixtures compare the two implementations bit for bit.
 *
 * Deliberately NOT tied to time, streaks, or anything a child could feel
 * pressure to protect. It is a seeded coin flip at the tuned rate, nothing
 * more — variable-ratio reward with no dark-pattern hooks.
 */

/** FNV-1a 32-bit over the UTF-16 code units of the key (ASCII in practice). */
function fnv1a32(key: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

/**
 * One extra avalanche round so consecutive indices decorrelate: raw FNV of
 * "child:1" vs "child:2" differ mostly in low bits.
 */
function avalanche(hash: number): number {
    let h = hash >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
}

/** Uniform [0,1) draw for this child at this lifetime attempt index. */
export function goldenDraw(childId: string, attemptIndex: number): number {
    const h = avalanche(fnv1a32(`${childId}:${attemptIndex}`));
    return h / 4294967296;
}

export function isGoldenEncounter(childId: string, attemptIndex: number, rate: number): boolean {
    return goldenDraw(childId, attemptIndex) < rate;
}
