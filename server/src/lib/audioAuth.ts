import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

/**
 * The gate on /audio. One password, typed into a form, set in Railway.
 *
 * DELIBERATELY NOT the admin bearer token, and the difference is who holds it.
 * `CROW_ADMIN_TOKEN` guards aggregated data about real children; this guards a
 * page that plays the game's own sound effects. Sharing one secret between them
 * would mean handing the analytics surface to anyone the owner wants to play a
 * sound to. Two secrets, two blast radii.
 *
 * Three choices worth stating:
 *
 *  - With CROW_AUDIO_PASSWORD unset, everything here answers 404, exactly like a
 *    route that does not exist. Off, not open, and unprobeable -- the same
 *    posture requireAdmin takes.
 *  - The password is exchanged ONCE for a cookie. `<audio src>` cannot carry an
 *    Authorization header, so a bearer scheme would force every sample through a
 *    fetch-and-blob dance; a cookie makes the page ordinary HTML.
 *  - The cookie is a stateless HMAC over its own expiry, so there is no session
 *    table, a restart does not log anyone out, and the thing stored in the
 *    browser is not the password.
 */

const COOKIE = 'crow_audio';
const TTL_SECONDS = 7 * 24 * 60 * 60;

function sign(expiresAt: number): string {
    return createHmac('sha256', config.audio.password)
        .update(`crow-audio-v1.${expiresAt}`)
        .digest('base64url');
}

export function issueCookie(reply: FastifyReply): void {
    const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    reply.setCookie(COOKIE, `${expiresAt}.${sign(expiresAt)}`, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.auth.cookieSecure,
        maxAge: TTL_SECONDS,
    });
}

export function clearCookie(reply: FastifyReply): void {
    reply.clearCookie(COOKIE, { path: '/' });
}

/** Constant-time compare of two strings of any length. */
export function sameSecret(presented: string, expected: string): boolean {
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    // Length is not secret here (the owner chose it), but a length mismatch must
    // not short-circuit into a different code path that leaks timing elsewhere.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

export function hasValidCookie(request: FastifyRequest): boolean {
    if (config.audio.password === '') return false;
    const raw = request.cookies?.[COOKIE] ?? '';
    const dot = raw.indexOf('.');
    if (dot <= 0) return false;
    const expiresAt = Number(raw.slice(0, dot));
    if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
    return sameSecret(raw.slice(dot + 1), sign(expiresAt));
}

/**
 * Guard for everything behind the gate.
 *
 * 404 when the feature is off, 401 when it is on and the caller has no cookie —
 * so "is there an audio page here" is only answerable by someone who already
 * knows there is.
 */
export async function requireAudioSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (config.audio.password === '') {
        return reply.code(404).send({ error: 'not found' });
    }
    if (!hasValidCookie(request)) {
        return reply.code(401).send({ error: 'unauthorized' });
    }
}
