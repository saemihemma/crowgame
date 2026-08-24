import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { withAuthTables } from '../lib/familyDb.js';
import { COOKIE_NAME, cookieOptions, deviceOf, enrollDevice, requireDevice } from '../lib/deviceAuth.js';
import { hashToken, newPairingCode, newToken, normalizePairingCode } from '../lib/tokens.js';
import { createMailer } from '../lib/mailer.js';

/**
 * Enrollment. Passwordless, because a 5-to-7-year-old cannot manage credentials
 * and their parent should not have to invent another password to let a child
 * play a maths game.
 *
 * Two ways in, both single-use and short-lived:
 *   1. email magic link  — the first device, and any device with email to hand
 *   2. pairing code      — an already-enrolled device vouches for a new one
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
    const mailer = createMailer();

    // ── 1. request a magic link ──────────────────────────────────────────────
    app.post(
        '/api/v1/auth/request-link',
        {
            config: { rateLimit: { max: config.auth.requestsPerHourPerIp, timeWindow: '1 hour' } },
            schema: {
                body: {
                    type: 'object',
                    required: ['email'],
                    additionalProperties: false,
                    properties: { email: { type: 'string', format: 'email', maxLength: 320 } },
                },
            },
        },
        async (request: FastifyRequest<{ Body: { email: string } }>, reply) => {
            const email = request.body.email.trim().toLowerCase();
            const code = newToken();

            await withAuthTables(async client => {
                // The family is created on CONSUME, not here: otherwise anyone
                // could create unbounded empty families by typing addresses.
                const existing = await client.query<{ family_id: string }>(
                    'select family_id from parents where email = $1', [email]);
                await client.query(
                    `insert into login_codes (purpose, email, family_id, code_sha256, expires_at)
                     values ('email_link', $1, $2, $3, now() + ($4 || ' seconds')::interval)`,
                    [email, existing.rows[0]?.family_id ?? null, hashToken(code),
                     String(config.auth.linkTtlSeconds)],
                );
            });

            const base = config.publicBaseUrl || `https://${request.headers.host ?? ''}`;
            const link = `${base}/api/v1/auth/consume?token=${encodeURIComponent(code)}`;
            try {
                await mailer.sendLoginLink(email, link);
            } catch (error) {
                request.log.error({ err: error }, 'could not send login link');
                // Still 202: whether the mail provider is having a bad day is not
                // something to leak, and the parent can retry.
            }

            // Always the same answer, whether or not the address is known.
            // Anything else turns this endpoint into an account-existence oracle.
            return reply.code(202).send({ sent: true });
        },
    );

    // ── 2. consume the link: TOP-LEVEL NAVIGATION, sets the cookie ───────────
    //
    // This is a GET that mutates, which is normally wrong. It is right here, and
    // deliberately: the cookie must be set by a response to a top-level
    // navigation from the parent's email client. A cookie set on an XHR is
    // exactly what Safari's storage rules are least kind to. Single-use consumption
    // is what keeps the GET safe.
    app.get(
        '/api/v1/auth/consume',
        {
            config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
            schema: {
                querystring: {
                    type: 'object',
                    required: ['token'],
                    properties: { token: { type: 'string', maxLength: 200 } },
                },
            },
        },
        async (request: FastifyRequest<{ Querystring: { token: string } }>, reply) => {
            const familyId = await withAuthTables(async client => {
                // Single-use enforced IN SQL: the UPDATE only matches an unconsumed
                // row, so two simultaneous clicks cannot both win. Doing this check
                // in application code would be a race.
                const consumed = await client.query<{ id: string; email: string; family_id: string | null }>(
                    `update login_codes
                        set consumed_at = now()
                      where code_sha256 = $1
                        and purpose = 'email_link'
                        and consumed_at is null
                        and expires_at > now()
                    returning id, email, family_id`,
                    [hashToken(request.query.token)],
                );
                const row = consumed.rows[0];
                if (!row) return null;
                if (row.family_id) {
                    await client.query(
                        'update parents set last_login_at = now() where email = $1', [row.email]);
                    return row.family_id;
                }
                // First sign-in for this address: create the family and parent.
                const family = await client.query<{ id: string }>(
                    'insert into families default values returning id');
                const newFamilyId = family.rows[0]!.id;
                await client.query(
                    `insert into parents (family_id, email, last_login_at)
                     values ($1, $2, now())
                     on conflict (email) do update set last_login_at = now()`,
                    [newFamilyId, row.email],
                );
                return newFamilyId;
            });

            if (!familyId) {
                return reply.code(400).type('text/html').send(
                    '<!doctype html><meta charset=utf-8><title>Link expired</title>' +
                    '<p>That sign-in link has already been used, or it expired. ' +
                    'Please request a new one from the game.</p>');
            }

            const { token } = await enrollDevice(
                familyId, request.headers['user-agent'] ?? null, 'email link');
            return reply
                .setCookie(COOKIE_NAME, token, cookieOptions())
                .redirect(config.auth.postLoginRedirect, 303);
        },
    );

    // ── 3. an enrolled device issues a pairing code for a new one ────────────
    app.post(
        '/api/v1/auth/pair',
        { preHandler: requireDevice, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
        async (request, reply) => {
            const { familyId } = deviceOf(request);
            const code = newPairingCode();
            await withAuthTables(client => client.query(
                `insert into login_codes (purpose, family_id, code_sha256, expires_at)
                 values ('device_pairing', $1, $2, now() + ($3 || ' seconds')::interval)`,
                [familyId, hashToken(code), String(config.auth.pairingTtlSeconds)],
            ));
            return reply.send({ code, expiresInSeconds: config.auth.pairingTtlSeconds });
        },
    );

    // ── 4. redeem a pairing code on the new device ───────────────────────────
    app.post(
        '/api/v1/auth/redeem',
        {
            // Tighter than the link endpoint: a pairing code is ~40 bits, so
            // guessing has to be made expensive at the edge as well as by the
            // 10-minute expiry and single use.
            config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
            schema: {
                body: {
                    type: 'object',
                    required: ['code'],
                    additionalProperties: false,
                    properties: { code: { type: 'string', maxLength: 32 } },
                },
            },
        },
        async (request: FastifyRequest<{ Body: { code: string } }>, reply) => {
            const normalized = normalizePairingCode(request.body.code);
            if (normalized.length < 6) return reply.code(400).send({ error: 'invalid code' });

            const familyId = await withAuthTables(async client => {
                const consumed = await client.query<{ family_id: string }>(
                    `update login_codes
                        set consumed_at = now()
                      where code_sha256 = $1
                        and purpose = 'device_pairing'
                        and consumed_at is null
                        and expires_at > now()
                    returning family_id`,
                    [hashToken(normalized)],
                );
                return consumed.rows[0]?.family_id ?? null;
            });

            if (!familyId) return reply.code(400).send({ error: 'invalid or expired code' });

            const { token } = await enrollDevice(
                familyId, request.headers['user-agent'] ?? null, 'paired device');
            return reply.setCookie(COOKIE_NAME, token, cookieOptions()).send({ enrolled: true });
        },
    );

    // ── 5. who am I ──────────────────────────────────────────────────────────
    // Lets the client decide whether to show "enable cloud save" without
    // guessing from a failed request.
    app.get('/api/v1/auth/session', async (request, reply) => {
        const { resolveDevice } = await import('../lib/deviceAuth.js');
        const identity = await resolveDevice(request);
        return reply.send(identity ? { enrolled: true } : { enrolled: false });
    });

    // ── 6. sign this device out ──────────────────────────────────────────────
    app.post('/api/v1/auth/signout', { preHandler: requireDevice }, async (request, reply) => {
        const { deviceId } = deviceOf(request);
        await withAuthTables(client => client.query(
            'update device_tokens set revoked_at = now() where device_id = $1 and revoked_at is null',
            [deviceId],
        ));
        return reply
            .clearCookie(COOKIE_NAME, { path: '/api' })
            .send({ signedOut: true });
    });
}
