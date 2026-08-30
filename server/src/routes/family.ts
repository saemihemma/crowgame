import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { withFamily } from '../lib/familyDb.js';
import { deviceOf, requireDevice, rateLimitKeyByDevice } from '../lib/deviceAuth.js';
import {
    extractProblemsAttempted, getSave, logConflict, putSave, syncAttempts,
    type IncomingAttempt,
} from '../lib/saveSync.js';

/**
 * Family, child, save and attempt routes. Every one of them:
 *  - requires a device cookie (requireDevice)
 *  - runs inside withFamily(), which drops to the non-superuser app role and
 *    sets app.family_id so row-level security applies
 *  - also carries an explicit family_id predicate in its SQL
 *
 * childId appears in paths as an object reference only. It never grants access.
 */

/** A birth year a grunnskóli-or-younger child could actually have right now. */
function plausibleBirthYear(year: number): boolean {
    const now = new Date().getUTCFullYear();
    return year >= now - 17 && year <= now;
}

export async function registerFamilyRoutes(app: FastifyInstance): Promise<void> {
    const auth = { preHandler: requireDevice };
    // Keyed by DEVICE, not by IP. An IP bucket would make one household — or one
    // school, or one CGNAT range — share a single write budget, so a sibling
    // playing on the next tablet would rate-limit the first child.
    const writeLimit = {
        preHandler: requireDevice,
        config: {
            rateLimit: {
                max: config.save.writesPerMinutePerDevice,
                timeWindow: '1 minute',
                keyGenerator: rateLimitKeyByDevice,
            },
        },
    };

    // ── children ─────────────────────────────────────────────────────────────

    app.get('/api/v1/family/children', auth, async (request, reply) => {
        const { familyId } = deviceOf(request);
        const children = await withFamily(familyId, async client => {
            const result = await client.query<{ id: string; display_name: string; created_at: Date }>(
                `select id, display_name, created_at
                   from children
                  where family_id = $1 and deleted_at is null
                  order by created_at`,
                [familyId],
            );
            return result.rows.map(row => ({
                remoteChildId: row.id,
                displayName: row.display_name,
                createdAt: row.created_at.toISOString(),
            }));
        });
        return reply.send({ children });
    });

    /**
     * Create a child, or adopt the one this device's local id already maps to.
     *
     * `legacyChildId` is the device-local "child-<ms>-<rand>". Recording the
     * mapping in child_aliases is what stops a second device from creating a
     * duplicate child for the same kid — the single most likely data-shape
     * mistake in this whole feature, because the client mints those ids per
     * device.
     */
    app.post(
        '/api/v1/family/children',
        {
            ...writeLimit,
            schema: {
                body: {
                    type: 'object',
                    required: ['displayName'],
                    additionalProperties: false,
                    properties: {
                        displayName: { type: 'string', minLength: 1, maxLength: 40 },
                        legacyChildId: { type: 'string', maxLength: 120 },
                        birthYear: { type: 'integer', minimum: 1990, maximum: 2100 },
                    },
                },
            },
        },
        async (request: FastifyRequest<{
            Body: { displayName: string; legacyChildId?: string; birthYear?: number };
        }>, reply) => {
            const { familyId } = deviceOf(request);
            const displayName = request.body.displayName.trim();
            const legacyChildId = request.body.legacyChildId?.trim();
            const birthYear = request.body.birthYear ?? null;
            if (birthYear !== null && !plausibleBirthYear(birthYear)) {
                return reply.code(400).send({ error: 'implausible birth year' });
            }

            const result = await withFamily(familyId, async client => {
                if (legacyChildId) {
                    const alias = await client.query<{ child_id: string }>(
                        `select child_id from child_aliases
                          where family_id = $1 and legacy_child_id = $2`,
                        [familyId, legacyChildId],
                    );
                    if (alias.rows[0]) return { remoteChildId: alias.rows[0].child_id, created: false };
                }

                // Same display name inside a family means the same child. This is
                // scoped to the family, so another family's Emma is unaffected.
                // On conflict the birth year only fills a gap — a re-bind from a
                // second device (which sends none) must not erase what a parent set.
                const child = await client.query<{ id: string }>(
                    `insert into children (family_id, display_name, birth_year)
                     values ($1, $2, $3)
                     on conflict (family_id, display_name) do update
                        set display_name = excluded.display_name,
                            birth_year = coalesce(excluded.birth_year, children.birth_year)
                     returning id`,
                    [familyId, displayName, birthYear],
                );
                const remoteChildId = child.rows[0]!.id;

                if (legacyChildId) {
                    await client.query(
                        `insert into child_aliases (family_id, legacy_child_id, child_id)
                         values ($1, $2, $3)
                         on conflict (family_id, legacy_child_id) do nothing`,
                        [familyId, legacyChildId, remoteChildId],
                    );
                }
                return { remoteChildId, created: true };
            });

            return reply.code(result.created ? 201 : 200).send(result);
        },
    );

    /**
     * Set (or correct) a child's birth year after the fact — the backfill path
     * for children created before the field existed, driven from the parent
     * report. Same family scoping as everything else here.
     */
    app.put(
        '/api/v1/family/children/:childId/birth-year',
        {
            ...writeLimit,
            schema: {
                params: {
                    type: 'object',
                    required: ['childId'],
                    properties: { childId: { type: 'string', format: 'uuid' } },
                },
                body: {
                    type: 'object',
                    required: ['birthYear'],
                    additionalProperties: false,
                    properties: { birthYear: { type: 'integer', minimum: 1990, maximum: 2100 } },
                },
            },
        },
        async (request: FastifyRequest<{
            Params: { childId: string }; Body: { birthYear: number };
        }>, reply) => {
            const { familyId } = deviceOf(request);
            const { birthYear } = request.body;
            if (!plausibleBirthYear(birthYear)) {
                return reply.code(400).send({ error: 'implausible birth year' });
            }
            const updated = await withFamily(familyId, async client => {
                const result = await client.query(
                    `update children set birth_year = $1
                      where id = $2 and family_id = $3 and deleted_at is null`,
                    [birthYear, request.params.childId, familyId],
                );
                return result.rowCount === 1;
            });
            if (!updated) return reply.code(404).send({ error: 'unknown child' });
            return reply.send({ ok: true, birthYear });
        },
    );

    // ── save ─────────────────────────────────────────────────────────────────

    app.get(
        '/api/v1/children/:childId/save',
        auth,
        async (request: FastifyRequest<{ Params: { childId: string } }>, reply) => {
            const { familyId } = deviceOf(request);
            const state = await withFamily(familyId, client =>
                getSave(client, familyId, request.params.childId));
            // 404 covers both "no save yet" and "not your child" — deliberately
            // indistinguishable, so this cannot be used to probe for child ids.
            if (!state) return reply.code(404).send({ error: 'no save' });
            return reply.send(state);
        },
    );

    /**
     * Upload a save, and optionally a batch of attempts, in ONE transaction.
     *
     * They must be atomic. Split them and the client either clears its pending
     * queue for attempts that were never durable, or adopts a save that does not
     * contain them.
     */
    app.put(
        '/api/v1/children/:childId/save',
        {
            ...writeLimit,
            bodyLimit: config.save.maxBlobBytes + 256 * 1024,
            schema: {
                body: {
                    type: 'object',
                    required: ['save', 'saveVersion'],
                    additionalProperties: false,
                    properties: {
                        save: { type: 'object' },
                        saveVersion: { type: 'integer', minimum: 1, maximum: 1000 },
                        clientTimestamp: { type: 'integer', minimum: 0 },
                        attempts: {
                            type: 'array',
                            maxItems: config.save.maxAttemptsPerBatch,
                            items: {
                                type: 'object',
                                required: ['attemptId'],
                                additionalProperties: true,
                                properties: { attemptId: { type: 'string', minLength: 1, maxLength: 120 } },
                            },
                        },
                    },
                },
            },
        },
        async (
            request: FastifyRequest<{
                Params: { childId: string };
                Body: {
                    save: Record<string, unknown>;
                    saveVersion: number;
                    clientTimestamp?: number;
                    attempts?: IncomingAttempt[];
                };
            }>,
            reply,
        ) => {
            const { familyId, deviceId } = deviceOf(request);
            const childId = request.params.childId;
            const body = request.body;

            const serialized = JSON.stringify(body.save);
            if (Buffer.byteLength(serialized, 'utf8') > config.save.maxBlobBytes) {
                return reply.code(413).send({ error: 'save too large' });
            }

            const problemsAttempted = extractProblemsAttempted(body.save);

            const result = await withFamily(familyId, async client => {
                // Confirm the child belongs to this family before anything else.
                // RLS would stop a cross-family write anyway, but a clear 404 beats
                // a policy violation surfacing as a 500.
                const owned = await client.query(
                    'select 1 from children where id = $1 and family_id = $2 and deleted_at is null',
                    [childId, familyId],
                );
                if (owned.rowCount === 0) return { notFound: true } as const;

                const before = await getSave(client, familyId, childId);
                const applied = await syncAttempts(
                    client, familyId, childId, deviceId, body.attempts ?? []);

                const put = await putSave(client, familyId, childId, deviceId, {
                    save: body.save,
                    saveVersion: body.saveVersion,
                    problemsAttempted,
                    clientTimestamp: body.clientTimestamp ?? 0,
                });

                // Only interesting when there was something to lose.
                if (before && before.problemsAttempted !== problemsAttempted) {
                    await logConflict(client, familyId, childId, deviceId,
                        problemsAttempted, before.problemsAttempted, put.outcome);
                }

                return { notFound: false, put, applied } as const;
            });

            if (result.notFound) return reply.code(404).send({ error: 'unknown child' });

            return reply.send({
                outcome: result.put.outcome,
                appliedAttemptIds: result.applied,
                // On 'rejected' this is the authoritative save the client should
                // adopt. On 'accepted' it is what the client just sent, echoed
                // with its new server version.
                state: result.put.state,
            });
        },
    );

    // ── attempts only (no save change) ───────────────────────────────────────

    app.post(
        '/api/v1/attempts/sync',
        {
            ...writeLimit,
            schema: {
                body: {
                    type: 'object',
                    required: ['childId', 'attempts'],
                    additionalProperties: false,
                    properties: {
                        childId: { type: 'string', maxLength: 64 },
                        attempts: {
                            type: 'array',
                            minItems: 1,
                            maxItems: config.save.maxAttemptsPerBatch,
                            items: {
                                type: 'object',
                                required: ['attemptId'],
                                additionalProperties: true,
                                properties: { attemptId: { type: 'string', minLength: 1, maxLength: 120 } },
                            },
                        },
                    },
                },
            },
        },
        async (
            request: FastifyRequest<{ Body: { childId: string; attempts: IncomingAttempt[] } }>,
            reply,
        ) => {
            const { familyId, deviceId } = deviceOf(request);
            const applied = await withFamily(familyId, async client => {
                const owned = await client.query(
                    'select 1 from children where id = $1 and family_id = $2 and deleted_at is null',
                    [request.body.childId, familyId],
                );
                if (owned.rowCount === 0) return null;
                return syncAttempts(client, familyId, request.body.childId, deviceId, request.body.attempts);
            });
            if (applied === null) return reply.code(404).send({ error: 'unknown child' });
            return reply.send({ appliedAttemptIds: applied });
        },
    );

    // ── play pings ───────────────────────────────────────────────────────────
    //
    // "This child was playing at this moment." One timestamp, nothing else.
    //
    // It exists because the admin overview derived sessions from ATTEMPT
    // timestamps, so a child who ran and jumped and never opened a maths board
    // was invisible in the one number that claims to say how long they played.
    // The client sends one on level start and every few minutes after, and
    // batches whatever it could not send.
    //
    // The timestamps the client sends are deliberately IGNORED for storage:
    // received_at is our clock, like every other analytics column, because a
    // tablet with a wrong date would otherwise move the owner's dashboard. The
    // count is what carries information -- a batch of six pings is six intervals
    // of play, wherever the device thinks it happened.
    app.post(
        '/api/v1/play/pings',
        {
            ...writeLimit,
            schema: {
                body: {
                    type: 'object',
                    required: ['childId', 'count'],
                    additionalProperties: false,
                    properties: {
                        childId: { type: 'string', maxLength: 64 },
                        count: { type: 'integer', minimum: 1, maximum: config.play.maxPingsPerBatch },
                    },
                },
            },
        },
        async (
            request: FastifyRequest<{ Body: { childId: string; count: number } }>,
            reply,
        ) => {
            const { familyId } = deviceOf(request);
            const accepted = await withFamily(familyId, async client => {
                const owned = await client.query(
                    'select 1 from children where id = $1 and family_id = $2 and deleted_at is null',
                    [request.body.childId, familyId],
                );
                if (owned.rowCount === 0) return null;
                // generate_series rather than a client-side loop: one round trip,
                // and the row count is bounded by the schema above.
                await client.query(
                    `insert into play_pings (child_id, family_id)
                     select $1, $2 from generate_series(1, $3)`,
                    [request.body.childId, familyId, request.body.count],
                );
                return request.body.count;
            });
            if (accepted === null) return reply.code(404).send({ error: 'unknown child' });
            return reply.send({ acceptedPings: accepted });
        },
    );

    // ── data rights ──────────────────────────────────────────────────────────
    //
    // Export and delete exist from the first release that stores anything. They
    // are cheap now and awkward to retrofit, and for children's data a delete
    // path is not optional.

    // PRIVACY.md promises "everything held about your family as one file", and
    // this used to return three tables of the nine a family owns. The omission
    // that mattered most was `parents`: the grown-up email is the only piece of
    // personal information in the system, so a data-portability export that left
    // it out was missing the one row a subject-access request is actually about.
    //
    // Two tables are deliberately excluded and named as such in the response, so
    // "everything" is a claim the reader can check rather than take:
    //   device_tokens — credential material. These are SHA-256 hashes of live
    //     session tokens; handing them to whoever holds the cookie widens the
    //     blast radius of a leaked export for no benefit to the reader.
    //   login_codes  — the same, for in-flight sign-in links and pairing codes.
    // `test/role-isolation.test.ts` derives the family-scoped table set from the
    // catalog and fails if a new one appears in neither the export nor that list.
    app.get('/api/v1/family/export', auth, async (request, reply) => {
        const { familyId } = deviceOf(request);
        const data = await withFamily(familyId, async client => {
            const parents = await client.query(
                'select email, created_at from parents where family_id = $1', [familyId]);
            const children = await client.query(
                'select id, display_name, created_at from children where family_id = $1', [familyId]);
            const childAliases = await client.query(
                `select child_id, legacy_child_id, created_at from child_aliases where family_id = $1`, [familyId]);
            const devices = await client.query(
                `select id, label, user_agent, created_at, last_seen_at
                   from devices where family_id = $1`, [familyId]);
            const saves = await client.query(
                `select child_id, save, save_version, problems_attempted, server_version, updated_at
                   from child_saves where family_id = $1`, [familyId]);
            const attempts = await client.query(
                `select child_id, attempt_id, problem_id, domain, correct, first_attempt,
                        hints_used, response_ms, problem_elo, curriculum_step, selection_lane,
                        answered_at, received_at
                   from attempts where family_id = $1 order by child_id, seq`, [familyId]);
            const saveHistory = await client.query(
                `select child_id, server_version, created_at
                   from child_save_history where family_id = $1 order by child_id, server_version`,
                [familyId]);
            const syncConflicts = await client.query(
                `select child_id, incoming_attempted, stored_attempted, outcome, created_at
                   from sync_conflicts where family_id = $1`,
                [familyId]);
            // Play heartbeats, raw and per row, like attempts above.
            //
            // PRIVACY.md promises a parent "everything held about your family",
            // and this table is held about their child — so it is exported, not
            // summarised. A summary would be a judgement about what a parent is
            // allowed to see, made by us, and the honest form of a heartbeat log
            // is the heartbeats. role-isolation.test.ts is what noticed the
            // omission: the table landed with the sessions feature and the export
            // did not grow with it.
            const playPings = await client.query(
                `select child_id, received_at
                   from play_pings where family_id = $1 order by child_id, received_at`,
                [familyId]);
            // The login accounts, WITHOUT pin_hash. PRIVACY.md promises everything
            // held about a family, and a credential is the one thing an export
            // must not carry: a downloaded file that contains the hash of a
            // 4-digit PIN is ten thousand guesses away from being the PIN.
            const accounts = await client.query(
                `select username, created_at, last_login_at
                   from accounts where family_id = $1 order by username`,
                [familyId]);
            return {
                exportedAt: new Date().toISOString(),
                notIncluded: {
                    device_tokens: 'session credentials (SHA-256 hashes of live tokens)',
                    login_codes: 'in-flight sign-in links and pairing codes',
                    accounts: 'the PIN hash only — the usernames themselves are below',
                },
                accounts: accounts.rows,
                parents: parents.rows,
                children: children.rows,
                childAliases: childAliases.rows,
                devices: devices.rows,
                saves: saves.rows,
                attempts: attempts.rows,
                saveHistory: saveHistory.rows,
                syncConflicts: syncConflicts.rows,
                playPings: playPings.rows,
            };
        });
        return reply
            .header('content-disposition', 'attachment; filename="crow-family-export.json"')
            .send(data);
    });

    app.delete('/api/v1/family', auth, async (request, reply) => {
        const { familyId } = deviceOf(request);
        // Hard delete. Every child-data table cascades from families, so this is
        // one statement.
        //
        // It used to run `pool.query` directly, with a comment claiming it ran as
        // the app role. It did not: the pool connects as the superuser Railway
        // gives us, so on the ONE destructive endpoint in the service both
        // defences the schema provides were off, and the only thing bounding the
        // cascade was the `where id = $1` predicate this comment called belt to
        // its braces. `families` carries no RLS policy — resolving a family
        // cannot depend on one — so the predicate is still what scopes the row;
        // what withFamily adds back is the non-superuser role, which is why a
        // typo here can no longer reach another table or do DDL.
        //
        // crow_app can perform the cascade: it holds DELETE on `families`, and
        // referential-integrity cascades run as the table owner, so they reach
        // `attempts` even though the role cannot DELETE from it directly. (It CAN
        // delete from `child_save_history` — the prune needs that — which an
        // earlier version of this comment got wrong.) Verified against a real
        // cluster in test/role-isolation.test.ts.
        await withFamily(familyId, client =>
            client.query('delete from families where id = $1', [familyId]));
        return reply
            .clearCookie(config.auth.cookieName, { path: '/api' })
            .send({ deleted: true });
    });
}
