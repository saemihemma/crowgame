import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { clientIp } from './lib/clientIp.js';
import { registerErrorRoutes } from './routes/errors.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerFamilyRoutes } from './routes/family.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerReportRoutes } from './routes/report.js';
import { ADMIN_PAGE } from './admin/page.js';

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({
        // Railway terminates TLS and the web service proxies over the private
        // network, so the client IP is only available via the forwarded header.
        // Without this, rate limiting would bucket every player together.
        trustProxy: true,
        // The largest single body is a save blob plus an attempt batch; per-route
        // bodyLimit narrows it back down for everything else.
        bodyLimit: config.save.maxBlobBytes + 256 * 1024,
        logger: {
            level: process.env['LOG_LEVEL'] ?? 'info',
            redact: ['req.headers.cookie', 'req.headers.authorization'],
        },
    });

    // In-memory limiter: correct while the API is a single instance, which it is.
    // Scaling to more than one replica means moving this to Postgres or Redis —
    // noted rather than pre-built (see deploy/RAILWAY.md).
    //
    // `global: true`, and that is the change worth explaining. It used to be
    // false, which means a route got a budget only if its own registration asked
    // for one — and 12 of the 20 did not. Two of those are unauthenticated and
    // touch the database on every call (`/api/v1/health` counts a table,
    // `/api/v1/auth/session` reads the device), and the pool is 8 connections
    // wide. An unauthenticated flood at either one queues every request behind
    // it, including the ones a child is waiting on. The rest are family routes
    // behind a device cookie, which is a credential anyone can mint from
    // `/auth/signup` — `GET /api/v1/family/export` is one query over every
    // attempt a family ever made, and it had no limit at all.
    //
    // So the default is a ceiling, not a business rule: high enough that no real
    // player or classroom can reach it, low enough that a single host cannot
    // saturate the pool. The tight, meaningful budgets stay where they are, per
    // route, and override this.
    //
    // Keyed by IP rather than by device on purpose. The ceiling exists to bound
    // what one *host* can do, and a device cookie is not scarce — key it by
    // device and an attacker mints twenty accounts and gets twenty ceilings.
    // Per-device is right for a business rule (see `rateLimitKeyByDevice`) and
    // wrong for this.
    await app.register(rateLimit, {
        global: true,
        max: config.rateLimit.globalPerMinutePerIp,
        timeWindow: '1 minute',
        // The key space is bounded and evicts LRU. Too small and a broad flood
        // evicts real players' counters, which resets their budget rather than
        // anyone's — it fails open, so it is sized well above the number of
        // distinct addresses a day of real traffic has.
        cache: config.rateLimit.keyCache,
        keyGenerator: request => `ip:${clientIp(request)}`,
    });

    // Device auth is a cookie, so cookie parsing must be registered first.
    await app.register(cookie, {});

    await registerHealthRoutes(app);
    await registerErrorRoutes(app);
    await registerAuthRoutes(app);
    await registerFamilyRoutes(app);
    await registerAdminRoutes(app);
    await registerReportRoutes(app);

    // The dashboard shell. Public bytes with zero data in them — every fetch it
    // makes is behind the admin bearer token — but still 404 when the feature
    // is off, matching requireAdmin's off-not-open posture.
    app.get('/admin', async (_request, reply) => {
        if (config.admin.token === '') return reply.code(404).send({ error: 'not found' });
        return reply.type('text/html; charset=utf-8').send(ADMIN_PAGE);
    });

    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not found' }));

    return app;
}
