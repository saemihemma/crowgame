import type { PoolClient } from 'pg';
import { config } from '../config.js';

/**
 * Cloud save: one document per child, whole-document last-writer-wins, arbitrated
 * by `problemsAttempted`.
 *
 * The arbiter is not a timestamp because a child's tablet clock is not
 * trustworthy and because "most recently saved" is the wrong question anyway.
 * `eloStats.problemsAttempted` is monotonic and only advances on real play, so
 * the rule reduces to "the device that has seen more of this child's answers
 * wins" — which is both defensible and explainable to a parent.
 */

export interface IncomingSave {
    readonly save: Record<string, unknown>;
    readonly saveVersion: number;
    readonly problemsAttempted: number;
    readonly clientTimestamp: number;
}

export interface SaveState {
    readonly save: Record<string, unknown>;
    readonly saveVersion: number;
    readonly problemsAttempted: number;
    readonly serverVersion: number;
    readonly updatedAt: string;
}

export type PutOutcome =
    | { readonly outcome: 'accepted'; readonly state: SaveState }
    /** The stored save is ahead. The client is handed it and adopts it. */
    | { readonly outcome: 'rejected'; readonly state: SaveState };

export function extractProblemsAttempted(save: Record<string, unknown>): number {
    const elo = save['eloStats'];
    if (elo && typeof elo === 'object') {
        const value = (elo as Record<string, unknown>)['problemsAttempted'];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
            return Math.floor(value);
        }
    }
    return 0;
}

function toState(row: {
    save: Record<string, unknown>;
    save_version: number;
    problems_attempted: number;
    server_version: string | number;
    updated_at: Date | string;
}): SaveState {
    return {
        save: row.save,
        saveVersion: row.save_version,
        problemsAttempted: row.problems_attempted,
        serverVersion: Number(row.server_version),
        updatedAt: typeof row.updated_at === 'string' ? row.updated_at : row.updated_at.toISOString(),
    };
}

export async function getSave(
    client: PoolClient, familyId: string, childId: string,
): Promise<SaveState | null> {
    const result = await client.query(
        `select save, save_version, problems_attempted, server_version, updated_at
           from child_saves where child_id = $1 and family_id = $2`,
        [childId, familyId],
    );
    return result.rows[0] ? toState(result.rows[0]) : null;
}

/**
 * Upsert with compare-and-set.
 *
 * The whole point is that this is ONE statement: a read-then-write would let two
 * devices interleave and lose one of the two saves. The `where` clause on the
 * update is the arbitration, and `returning` tells us which side won without a
 * second query.
 *
 * Tie-break order matches the contract: problems_attempted, then client
 * timestamp, then server receipt order (which is implicit — an equal-on-both
 * later request simply does not displace the stored row).
 */
export async function putSave(
    client: PoolClient,
    familyId: string,
    childId: string,
    deviceId: string,
    incoming: IncomingSave,
): Promise<PutOutcome> {
    const inserted = await client.query(
        `insert into child_saves (
             child_id, family_id, save, save_version, problems_attempted,
             client_timestamp, server_version, updated_by_device, updated_at)
         values ($1, $2, $3, $4, $5, $6, 1, $7, now())
         on conflict (child_id) do update set
             save               = excluded.save,
             save_version       = excluded.save_version,
             problems_attempted = excluded.problems_attempted,
             client_timestamp   = excluded.client_timestamp,
             server_version     = child_saves.server_version + 1,
             updated_by_device  = excluded.updated_by_device,
             updated_at         = now()
         where excluded.problems_attempted > child_saves.problems_attempted
            or (excluded.problems_attempted = child_saves.problems_attempted
                and excluded.client_timestamp > child_saves.client_timestamp)
         returning save, save_version, problems_attempted, server_version, updated_at`,
        [childId, familyId, JSON.stringify(incoming.save), incoming.saveVersion,
         incoming.problemsAttempted, incoming.clientTimestamp, deviceId],
    );

    if (inserted.rows[0]) {
        const state = toState(inserted.rows[0]);
        await recordHistory(client, familyId, childId, state);
        return { outcome: 'accepted', state };
    }

    // The `where` blocked the update, so the stored save is ahead. Hand it back;
    // the client calls replace_snapshot() with it and adopts it. Nothing is lost
    // silently — the losing device's attempts are still in the append-only log.
    const current = await getSave(client, familyId, childId);
    if (!current) {
        // Only reachable if the row vanished between statements, which inside one
        // transaction means the child was deleted concurrently.
        throw new Error('save row disappeared mid-transaction');
    }
    return { outcome: 'rejected', state: current };
}

/**
 * Keep the last N versions so a wrong merge is a support action, not a loss.
 * Pruning happens here rather than in a scheduled job because the trigger is a
 * write, and N is small.
 */
async function recordHistory(
    client: PoolClient, familyId: string, childId: string, state: SaveState,
): Promise<void> {
    await client.query(
        `insert into child_save_history (child_id, family_id, server_version, save)
         values ($1, $2, $3, $4)
         on conflict (child_id, server_version) do nothing`,
        [childId, familyId, state.serverVersion, JSON.stringify(state.save)],
    );
    // The casts are load-bearing: with two untyped parameters Postgres cannot
    // infer a type for `$2 - $3` and fails with "operator is not unique".
    await client.query(
        `delete from child_save_history
          where child_id = $1
            and server_version <= $2::bigint - $3::int`,
        [childId, state.serverVersion, config.save.historyDepth],
    );
}

export async function logConflict(
    client: PoolClient,
    familyId: string,
    childId: string,
    deviceId: string,
    incomingAttempted: number,
    storedAttempted: number,
    outcome: 'accepted' | 'rejected',
): Promise<void> {
    await client.query(
        `insert into sync_conflicts
             (child_id, family_id, device_id, incoming_attempted, stored_attempted, outcome)
         values ($1, $2, $3, $4, $5, $6)`,
        [childId, familyId, deviceId, incomingAttempted, storedAttempted, outcome],
    );
}

export interface IncomingAttempt {
    readonly attemptId: string;
    readonly problemId?: string;
    readonly domain?: string;
    readonly correct?: boolean;
    readonly firstAttempt?: boolean;
    readonly hintsUsed?: number;
    readonly responseMs?: number;
    readonly problemElo?: number;
    readonly curriculumStep?: number;
    readonly selectionLane?: string;
    readonly reviewItemId?: string;
    readonly answeredAt?: string;
}

/**
 * Insert a batch and report which ids are now durable.
 *
 * `ON CONFLICT DO NOTHING` on (child_id, attempt_id) makes this idempotent, which
 * is what lets the client retry a batch forever without creating duplicates —
 * and `appliedAttemptIds` is what lets it clear its pending queue for exactly
 * the rows that landed, and no others.
 *
 * Note that already-present ids are returned as applied too. They are durable;
 * that is the question the client is asking.
 */
export async function syncAttempts(
    client: PoolClient,
    familyId: string,
    childId: string,
    deviceId: string,
    attempts: readonly IncomingAttempt[],
): Promise<string[]> {
    if (attempts.length === 0) return [];

    const ids: string[] = [];
    for (const attempt of attempts) {
        const answeredAt = normalizeAnsweredAt(attempt.answeredAt);
        await client.query(
            `insert into attempts (
                 child_id, family_id, attempt_id, problem_id, domain, correct,
                 first_attempt, hints_used, response_ms, problem_elo,
                 curriculum_step, selection_lane, review_item_id, answered_at, device_id)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             on conflict (child_id, attempt_id) do nothing`,
            [childId, familyId, attempt.attemptId, attempt.problemId ?? null,
             attempt.domain ?? null, attempt.correct ?? null, attempt.firstAttempt ?? null,
             clampInt(attempt.hintsUsed, 0, 100), clampInt(attempt.responseMs, 0, 3_600_000),
             clampInt(attempt.problemElo, 0, 5000), clampInt(attempt.curriculumStep, 0, 500),
             attempt.selectionLane ?? null, attempt.reviewItemId ?? null, answeredAt, deviceId],
        );
        ids.push(attempt.attemptId);
    }
    return ids;
}

function clampInt(value: unknown, min: number, max: number): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * A claimed answer time more than a day in the future is a broken clock, not
 * information. Store null and let `received_at` carry the ordering.
 */
function normalizeAnsweredAt(raw: string | undefined): string | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    const oneDay = 24 * 3_600_000;
    if (parsed.getTime() > Date.now() + oneDay) return null;
    return parsed.toISOString();
}
