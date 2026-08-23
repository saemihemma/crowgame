/**
 * Configuration, resolved once at startup from the environment.
 *
 * Anything that differs between staging and prod is an env var, never a build
 * artifact — promotion to prod ships byte-identical files (see
 * deploy/RAILWAY.md), so a compile-time difference would be a lie.
 */

function int(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got ${JSON.stringify(raw)}`);
    return n;
}

function str(name: string, fallback: string): string {
    const raw = process.env[name];
    return raw === undefined || raw === '' ? fallback : raw;
}

export const config = {
    /**
     * Railway routes to the service over its private network, which is IPv6.
     * Binding 0.0.0.0 means private networking cannot reach it — this is the
     * single most common way a Railway service looks healthy and is unreachable.
     */
    host: str('HOST', '::'),
    port: int('PORT', 8080),

    databaseUrl: process.env['DATABASE_URL'] ?? '',
    environment: str('CROW_ENV', 'development'),

    errors: {
        /**
         * Raw event bodies are kept 30 days; the aggregates are kept forever.
         *
         * 30 days is the mainstream default for raw error events (hosted error
         * trackers sit at 30 with 90 at the generous end; log platforms often
         * default lower, around 15). A week — the initial instinct — is below
         * that norm and fails in a predictable way: a bug that only appears on a
         * weekend and gets mentioned the following week is already gone.
         */
        retainDays: int('CROW_ERROR_RETAIN_DAYS', 30),
        /** Daily partitions created ahead of time, so an insert never lands nowhere. */
        partitionsAhead: int('CROW_ERROR_PARTITIONS_AHEAD', 14),
        /** Raw bodies stored per fingerprint per hour. Beyond this, count only. */
        rawPerGroupPerHour: int('CROW_ERROR_RAW_PER_GROUP_HOUR', 10),
        maxEventsPerRequest: int('CROW_ERROR_MAX_EVENTS_PER_REQUEST', 10),
        maxBodyBytes: int('CROW_ERROR_MAX_BODY_BYTES', 64 * 1024),
        /** Per-IP budget for the one anonymous write endpoint. */
        ratePerMinutePerIp: int('CROW_ERROR_RATE_PER_MIN', 20),
    },
} as const;

export function assertDatabaseConfigured(): void {
    if (!config.databaseUrl) {
        throw new Error('DATABASE_URL is not set. The API cannot start without a database.');
    }
}
