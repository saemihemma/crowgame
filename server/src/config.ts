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

    auth: {
        /** Magic links are short-lived; a parent clicks them within a minute or two. */
        linkTtlSeconds: int('CROW_LINK_TTL_SECONDS', 15 * 60),
        /** Pairing codes are typed by hand on a second device. */
        pairingTtlSeconds: int('CROW_PAIRING_TTL_SECONDS', 10 * 60),
        /** Device cookies are long-lived on purpose: a family should not have to
         *  re-enroll a child's tablet every month. */
        deviceTokenDays: int('CROW_DEVICE_TOKEN_DAYS', 400),
        cookieName: str('CROW_COOKIE_NAME', 'crow_device'),
        /** Secure cookies over plain HTTP would simply not be stored, which
         *  breaks local development; everything deployed is HTTPS. */
        cookieSecure: str('CROW_COOKIE_SECURE', 'true') !== 'false',
        /** Where /auth/consume sends the browser after setting the cookie. */
        postLoginRedirect: str('CROW_POST_LOGIN_REDIRECT', '/'),
        requestsPerHourPerIp: int('CROW_LINK_RATE_PER_HOUR', 10),
    },

    save: {
        maxBlobBytes: int('CROW_SAVE_MAX_BYTES', 512 * 1024),
        maxAttemptsPerBatch: int('CROW_ATTEMPTS_MAX_BATCH', 100),
        /** Retained versions per child, so a bad merge is recoverable. */
        historyDepth: int('CROW_SAVE_HISTORY_DEPTH', 20),
        writesPerMinutePerDevice: int('CROW_SAVE_WRITES_PER_MIN', 6),
    },

    mail: {
        driver: str('CROW_MAIL_DRIVER', 'log'),
        endpoint: str('CROW_MAIL_ENDPOINT', ''),
        apiKey: str('CROW_MAIL_API_KEY', ''),
        from: str('CROW_MAIL_FROM', 'Hörmann <no-reply@example.invalid>'),
    },

    /** Absolute base used to build the magic link, e.g. https://crow.example.com */
    publicBaseUrl: str('CROW_PUBLIC_BASE_URL', ''),

    admin: {
        /**
         * Bearer token for the owner's analytics surface. Unset means the whole
         * admin surface answers 404 — the feature is off, not open. There is one
         * owner, so a single shared secret beats building accounts nobody needs.
         */
        token: str('CROW_ADMIN_TOKEN', ''),
        /** A session is a burst of attempts with no gap over this many minutes. */
        sessionGapMinutes: int('CROW_SESSION_GAP_MINUTES', 30),
        /** How many days of daily series the overview returns. */
        overviewDays: int('CROW_OVERVIEW_DAYS', 28),
        /**
         * The ladder tuning loop (see lib/ladderTuning.ts). The band is the
         * documented 70-85% sweet spot; the sample gates are what stops a
         * handful of answers from one child on one afternoon turning into a
         * knob change nobody can reason about a week later.
         */
        ladder: {
            windowDays: int('CROW_LADDER_WINDOW_DAYS', 7),
            bandLow: int('CROW_LADDER_BAND_LOW_PCT', 70) / 100,
            bandHigh: int('CROW_LADDER_BAND_HIGH_PCT', 85) / 100,
            minAttempts: int('CROW_LADDER_MIN_ATTEMPTS', 200),
            minChildren: int('CROW_LADDER_MIN_CHILDREN', 1),
            minDaysWithPlay: int('CROW_LADDER_MIN_DAYS', 4),
            reviewFloorPct: int('CROW_LADDER_REVIEW_FLOOR_PCT', 50) / 100,
            /** One change moves a lane weight by this much. Never more. */
            step: int('CROW_LADDER_STEP_PCT', 5) / 100,
        },
    },
} as const;

export function assertDatabaseConfigured(): void {
    if (!config.databaseUrl) {
        throw new Error('DATABASE_URL is not set. The API cannot start without a database.');
    }
}
