import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Secrets are generated here and only ever stored as SHA-256.
 *
 * SHA-256 rather than a password hash (argon2/bcrypt) is correct for these
 * specific secrets and would be wrong for a password: these are 256 bits of
 * output from a CSPRNG, so there is no dictionary to attack and no need for a
 * slow KDF. What matters is that a leaked database cannot be replayed, and a
 * hash of a high-entropy secret gives that.
 */

export function newToken(): string {
    // base64url, no padding — safe in a cookie and in a URL.
    return randomBytes(32).toString('base64url');
}

/**
 * Pairing codes are typed by a human on a second device, so they trade entropy
 * for typability. 8 chars from a 32-symbol alphabet is ~40 bits, which is fine
 * given they are single-use, expire in 10 minutes, and are attempt-limited.
 * Ambiguous glyphs (0/O, 1/I/L) are excluded because a parent will read this
 * aloud or squint at it.
 */
const PAIRING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newPairingCode(): string {
    const bytes = randomBytes(8);
    let out = '';
    for (const byte of bytes) out += PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length];
    return out;
}

export function hashToken(token: string): Buffer {
    return createHash('sha256').update(token).digest();
}


/** Pairing codes are compared case-insensitively; a parent will type lowercase. */
export function normalizePairingCode(raw: string): string {
    return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
