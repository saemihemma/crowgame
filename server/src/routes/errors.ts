import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { withAppRole } from '../db.js';
import { coarsenIp, normalizeEvent, recordEvent, type IncomingErrorEvent } from '../lib/errorEvents.js';

interface ErrorBatchBody {
    readonly events?: unknown;
    readonly release?: unknown;
}

/**
 * POST /api/v1/errors — the one anonymous write endpoint.
 *
 * Anonymous because the errors most worth having are the ones that happen before
 * a device could possibly be enrolled: the engine failing to boot, the wasm
 * failing to compile, the pck 404ing. Those never reach GDScript at all.
 *
 * Being anonymous makes it the abuse surface, so: per-IP rate limit, hard body
 * cap, bounded fields, no free text, nothing reflected back to the caller.
 */
export async function registerErrorRoutes(app: FastifyInstance): Promise<void> {
    app.post(
        '/api/v1/errors',
        {
            config: { rateLimit: { max: config.errors.ratePerMinutePerIp, timeWindow: '1 minute' } },
            bodyLimit: config.errors.maxBodyBytes,
            schema: {
                body: {
                    type: 'object',
                    required: ['events'],
                    additionalProperties: false,
                    properties: {
                        release: { type: 'string', maxLength: 80 },
                        events: {
                            type: 'array',
                            minItems: 1,
                            maxItems: config.errors.maxEventsPerRequest,
                            items: {
                                type: 'object',
                                required: ['message'],
                                additionalProperties: false,
                                properties: {
                                    message: { type: 'string', minLength: 1, maxLength: 2000 },
                                    kind: { type: 'string', maxLength: 80 },
                                    level: { type: 'string', maxLength: 16 },
                                    source: { type: 'string', maxLength: 500 },
                                    stack: { type: 'string', maxLength: 8000 },
                                    release: { type: 'string', maxLength: 80 },
                                    occurredAt: { type: 'string', maxLength: 40 },
                                    context: { type: 'object' },
                                },
                            },
                        },
                    },
                },
            },
        },
        async (request: FastifyRequest<{ Body: ErrorBatchBody }>, reply) => {
            const body = request.body;
            const incoming = (Array.isArray(body.events) ? body.events : []) as IncomingErrorEvent[];
            const batchRelease = typeof body.release === 'string' ? body.release : undefined;
            const now = new Date();

            const normalized = incoming
                .map(event => normalizeEvent(
                    event.release === undefined && batchRelease !== undefined
                        ? { ...event, release: batchRelease }
                        : event,
                    now,
                ))
                .filter((e): e is NonNullable<typeof e> => e !== null);

            if (normalized.length === 0) {
                // Nothing usable, but this is not the client's problem to solve
                // and it must not retry: answer 202 and drop.
                return reply.code(202).send({ accepted: 0 });
            }

            const meta = {
                userAgent: (request.headers['user-agent'] ?? '').slice(0, 400) || null,
                ipPrefix: coarsenIp(request.ip),
            };

            let stored = 0;
            let throttled = 0;
            await withAppRole(async client => {
                for (const event of normalized) {
                    const result = await recordEvent(client, event, meta);
                    if (result.rawStored) stored += 1; else throttled += 1;
                }
            });

            request.log.info({ stored, throttled, release: batchRelease }, 'error batch ingested');
            return reply.code(202).send({ accepted: normalized.length, stored, throttled });
        },
    );
}
