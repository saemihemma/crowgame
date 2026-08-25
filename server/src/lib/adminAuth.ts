import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

/**
 * Owner-only surface. One shared bearer token, compared in constant time.
 *
 * Two deliberate choices:
 *  - With CROW_ADMIN_TOKEN unset, everything behind this answers 404, exactly
 *    like a route that does not exist. Off, not open, and unprobeable.
 *  - The token travels only in the Authorization header, never in the URL:
 *    query strings end up in access logs, browser history and Referer headers,
 *    which would turn every log line into a credential.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const expected = config.admin.token;
    if (expected === '') {
        return reply.code(404).send({ error: 'not found' });
    }
    const header = request.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return reply.code(401).send({ error: 'unauthorized' });
    }
}
