import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { withAuthTables } from './familyDb.js';
import { hashToken, newToken } from './tokens.js';

/**
 * Device authentication.
 *
 * The credential is an opaque random token in an HttpOnly cookie, resolving to
 * `device -> family`. It is never the child, and `childId` in a URL is only ever
 * an object reference — authorization is always `family_id = <token's family>`.
 *
 * Why a cookie and not a token in the client's own storage, restated because it
 * is the one thing that would be tempting to "simplify" later:
 *  - the Godot web export has no secure storage, so anything in Persistence
 *    lands in IndexedDB where any script on the origin can read it;
 *  - Safari evicts script-writable storage after about seven days of no
 *    interaction, and a server-set cookie survives that.
 */

export interface DeviceIdentity {
    readonly deviceId: string;
    readonly familyId: string;
}

export const COOKIE_NAME = config.auth.cookieName;

export function cookieOptions(): {
    httpOnly: true; secure: boolean; sameSite: 'lax'; path: string; maxAge: number;
} {
    return {
        httpOnly: true,
        secure: config.auth.cookieSecure,
        // Lax, not Strict: the magic link is a cross-site top-level navigation
        // from an email client, and Strict would withhold the cookie on exactly
        // that request.
        sameSite: 'lax',
        path: '/api',
        maxAge: config.auth.deviceTokenDays * 24 * 60 * 60,
    };
}

/** Issue a device + token, returning the raw token to be set as a cookie. */
export async function enrollDevice(
    familyId: string,
    userAgent: string | null,
    label: string | null,
): Promise<{ token: string; deviceId: string }> {
    const token = newToken();
    const deviceId = await withAuthTables(async client => {
        const device = await client.query<{ id: string }>(
            `insert into devices (family_id, label, user_agent, last_seen_at)
             values ($1, $2, $3, now()) returning id`,
            [familyId, label, userAgent?.slice(0, 400) ?? null],
        );
        const id = device.rows[0]!.id;
        await client.query(
            `insert into device_tokens (device_id, token_sha256, expires_at)
             values ($1, $2, now() + ($3 || ' days')::interval)`,
            [id, hashToken(token), String(config.auth.deviceTokenDays)],
        );
        return id;
    });
    return { token, deviceId };
}

/**
 * Resolve the cookie to a device and family, or null.
 *
 * The lookup is by hash, so a stolen database row cannot be replayed as a
 * credential. Revoked and expired tokens are excluded in SQL rather than checked
 * afterwards, so there is no path where an expiry check gets skipped.
 */
export async function resolveDevice(request: FastifyRequest): Promise<DeviceIdentity | null> {
    const raw = request.cookies?.[COOKIE_NAME];
    if (!raw) return null;

    return withAuthTables(async client => {
        const result = await client.query<{ device_id: string; family_id: string }>(
            `update device_tokens t
                set device_id = t.device_id
              from devices d
             where t.token_sha256 = $1
               and t.revoked_at is null
               and t.expires_at > now()
               and d.id = t.device_id
               and d.revoked_at is null
            returning t.device_id as device_id, d.family_id as family_id`,
            [hashToken(raw)],
        );
        const row = result.rows[0];
        if (!row) return null;
        // Best-effort liveness signal for the family's device list.
        await client.query('update devices set last_seen_at = now() where id = $1', [row.device_id]);
        return { deviceId: row.device_id, familyId: row.family_id };
    });
}

/**
 * Fastify preHandler for every authenticated route. Attaches the identity to
 * the request, or answers 401 and stops.
 */
export async function requireDevice(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const identity = await resolveDevice(request);
    if (!identity) {
        await reply.code(401).send({ error: 'not enrolled' });
        return;
    }
    (request as FastifyRequest & { device: DeviceIdentity }).device = identity;
}

export function deviceOf(request: FastifyRequest): DeviceIdentity {
    const identity = (request as FastifyRequest & { device?: DeviceIdentity }).device;
    if (!identity) throw new Error('requireDevice did not run for this route');
    return identity;
}

/**
 * Rate-limit key for authenticated write routes.
 *
 * Uses the device credential, not the IP. An IP-keyed budget would put a whole
 * household (or a school, or everyone behind one CGNAT address) into a single
 * bucket, so one child's play would throttle their sibling's. Hashed, so the
 * limiter's in-memory key space never holds a live credential.
 */
export function rateLimitKeyByDevice(request: FastifyRequest): string {
    const raw = request.cookies?.[COOKIE_NAME];
    return raw ? `d:${hashToken(raw).toString('base64url')}` : `ip:${request.ip}`;
}
