import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { fingerprint } from './fingerprint.js';

/**
 * Ingestion for one error event.
 *
 * The shape here is deliberately narrow. This endpoint is unauthenticated —
 * it has to be, because the errors most worth seeing ("the game didn't load")
 * happen before a device is ever enrolled — so it is the main abuse surface in
 * the whole system. Nothing free-text from a player is stored, nothing is
 * reflected back, and every field is bounded.
 */

export interface IncomingErrorEvent {
    readonly kind?: string;
    readonly level?: string;
    readonly message: string;
    readonly source?: string;
    readonly stack?: string;
    readonly release?: string;
    readonly context?: Record<string, unknown>;
    readonly occurredAt?: string;
}

export interface StoredResult {
    readonly fingerprint: string;
    /** false when the group was over its hourly cap and only the counter moved. */
    readonly rawStored: boolean;
}

const LEVELS = new Set(['error', 'warning', 'fatal', 'info']);
const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;
const MAX_SOURCE = 500;
const MAX_CONTEXT_KEYS = 20;
const MAX_CONTEXT_VALUE = 200;

export function clampString(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed.slice(0, max);
}

/**
 * Context is coarse by design: engine, platform, viewport, locale, build. Never
 * a child id, a display name, or anything a player typed. Deep structures are
 * flattened away rather than stored, so this can't become a data smuggling path.
 */
export function sanitizeContext(raw: unknown): Record<string, string | number | boolean> | null {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out: Record<string, string | number | boolean> = {};
    let count = 0;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (count >= MAX_CONTEXT_KEYS) break;
        if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) continue;
        if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
        else if (typeof value === 'boolean') out[key] = value;
        else if (typeof value === 'string') out[key] = value.slice(0, MAX_CONTEXT_VALUE);
        else continue;
        count += 1;
    }
    return count === 0 ? null : out;
}

/**
 * A client clock is not trusted. An `occurredAt` in the future (or absurdly old)
 * would land in the wrong day partition, which is also the retention unit, so a
 * bad clock could park a row somewhere that never gets dropped.
 */
export function resolveOccurredAt(raw: unknown, now: Date): Date {
    const claimed = typeof raw === 'string' ? new Date(raw) : null;
    if (!claimed || Number.isNaN(claimed.getTime())) return now;
    const skewMs = claimed.getTime() - now.getTime();
    const oneHour = 3_600_000;
    const sevenDays = 7 * 24 * oneHour;
    if (skewMs > oneHour || skewMs < -sevenDays) return now;
    return claimed;
}

export function normalizeEvent(input: IncomingErrorEvent, now: Date) {
    const message = clampString(input.message, MAX_MESSAGE);
    if (message === null) return null;
    const level = typeof input.level === 'string' && LEVELS.has(input.level) ? input.level : 'error';
    return {
        message,
        level,
        kind: clampString(input.kind, 80),
        source: clampString(input.source, MAX_SOURCE),
        stack: clampString(input.stack, MAX_STACK),
        release: clampString(input.release, 80),
        context: sanitizeContext(input.context),
        occurredAt: resolveOccurredAt(input.occurredAt, now),
    };
}

export type NormalizedEvent = NonNullable<ReturnType<typeof normalizeEvent>>;

/**
 * Upsert the group, then store the raw body only if the group is under its
 * hourly raw cap.
 *
 * The cap window is reset lazily inside the same statement that increments it,
 * so there is no background job keeping it honest and no race where two workers
 * both think they are first in a new hour. `raw_in_window` is returned post-
 * increment, which is what decides whether the body is worth keeping.
 */
export async function recordEvent(
    client: PoolClient,
    event: NormalizedEvent,
    meta: { userAgent: string | null; ipPrefix: string | null },
): Promise<StoredResult> {
    const fp = fingerprint({
        release: event.release ?? undefined,
        kind: event.kind ?? undefined,
        message: event.message,
        source: event.source ?? undefined,
    });

    const groupResult = await client.query<{ raw_in_window: number }>(
        `insert into error_groups (
             fingerprint, message, kind, level, source, release,
             event_count, raw_window_started, raw_in_window, sample_event
         )
         values ($1, $2, $3, $4, $5, $6, 1, now(), 1, $7)
         on conflict (fingerprint) do update set
             last_seen_at = now(),
             event_count  = error_groups.event_count + 1,
             -- roll the window if the stored one is older than an hour
             raw_window_started = case
                 when error_groups.raw_window_started < now() - interval '1 hour'
                 then now() else error_groups.raw_window_started end,
             raw_in_window = case
                 when error_groups.raw_window_started < now() - interval '1 hour'
                 then 1 else error_groups.raw_in_window + 1 end
         returning raw_in_window`,
        [
            fp,
            event.message,
            event.kind,
            event.level,
            event.source,
            event.release,
            event.context ? JSON.stringify({ context: event.context, stack: event.stack }) : null,
        ],
    );

    const rawInWindow = groupResult.rows[0]?.raw_in_window ?? 1;
    if (rawInWindow > config.errors.rawPerGroupPerHour) {
        return { fingerprint: fp, rawStored: false };
    }

    await client.query(
        `insert into error_events (
             occurred_at, fingerprint, release, level, kind, message,
             source, stack, context, user_agent, ip_prefix
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
            event.occurredAt,
            fp,
            event.release,
            event.level,
            event.kind,
            event.message,
            event.source,
            event.stack,
            event.context ? JSON.stringify(event.context) : null,
            meta.userAgent,
            meta.ipPrefix,
        ],
    );

    return { fingerprint: fp, rawStored: true };
}

/**
 * Store a coarse network origin for abuse triage, never a full address.
 * IPv4 -> /24, IPv6 -> /48. Enough to spot one source flooding the endpoint,
 * not enough to track a family.
 */
export function coarsenIp(ip: string | undefined): string | null {
    if (!ip) return null;
    const plain = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    if (plain.includes('.')) {
        const octets = plain.split('.');
        if (octets.length !== 4) return null;
        return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
    }
    if (plain.includes(':')) {
        const groups = plain.split(':').filter(g => g !== '');
        if (groups.length < 3) return null;
        return `${groups[0]}:${groups[1]}:${groups[2]}::/48`;
    }
    return null;
}
