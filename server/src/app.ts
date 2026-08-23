import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { registerErrorRoutes } from './routes/errors.js';
import { registerHealthRoutes } from './routes/health.js';

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({
        // Railway terminates TLS and the web service proxies over the private
        // network, so the client IP is only available via the forwarded header.
        // Without this, rate limiting would bucket every player together.
        trustProxy: true,
        bodyLimit: config.errors.maxBodyBytes,
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

    await registerHealthRoutes(app);
    await registerErrorRoutes(app);

    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not found' }));

    return app;
}
