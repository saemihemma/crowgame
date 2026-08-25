import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { config } from './config.js';
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
    // noted rather than pre-built.
    await app.register(rateLimit, {
        global: false,
        max: config.errors.ratePerMinutePerIp,
        timeWindow: '1 minute',
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
