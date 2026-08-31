import { isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';

/**
 * Who is this request actually from, and why that is not `request.ip` on its own.
 *
 * The API has two proxies in front of it in production, not one: Railway's edge
 * terminates TLS, then the web service (Caddy) reverse-proxies `/api/*` over the
 * private network. `request.ip` with `trustProxy: true` reads the leftmost
 * `X-Forwarded-For` value, and what that value is depends entirely on what the
 * two hops wrote — which is a platform detail, not a fact about the caller.
 *
 * The Caddyfile used to set `X-Forwarded-For` to `{remote_host}`, which is
 * Railway's edge, i.e. the same handful of addresses for every player alive. Every
 * per-IP rate limit in this service was therefore ONE bucket, and a limiter with
 * one bucket does the opposite of its job twice over: one noisy client spends the
 * budget for everybody, and no attacker is ever isolated from anyone else.
 *
 * The fix is to stop inferring the address from the chain and pass it explicitly.
 * Caddy sets `X-Crow-Client-Ip` from `X-Envoy-External-Address`, which Railway's
 * edge derives itself rather than copying from the request. Two properties make
 * that safe to trust here:
 *
 *   - the API has no public domain (see deploy/RAILWAY.md), so the only route to
 *     it is through Caddy, and Caddy *sets* the header rather than appending —
 *     any value a client sent is replaced;
 *   - a value that is missing, empty, or not a single bare IP is ignored rather
 *     than believed, so a hop that stops setting it degrades to `request.ip`
 *     instead of handing everyone a shared key or an attacker a chosen one.
 *
 * Anything that buckets, counts, or coarsens by caller must go through here. A
 * second place that reads `request.ip` directly is a second answer to the same
 * question.
 */

/**
 * `node:net`'s own parser, not a hand-rolled regex: the question "is this one
 * bare address" has exactly one correct answer and the stdlib already knows it.
 * A chain, a port, a hostname, or anything with room for a payload in it fails.
 */
function isBareIp(value: string): boolean {
    return isIP(value) !== 0;
}

/**
 * `request.headers` is optional here, and deliberately so: this is called from a
 * rate-limit `keyGenerator`, which is also called directly by tests with a stub
 * request carrying only the fields the assertion is about. A helper on the
 * limiter's hot path that throws on a shape it did not expect turns a wrong key
 * into a 500, which is a worse failure than the one it was added to fix.
 */
export function clientIp(request: FastifyRequest): string {
    const header = request.headers?.['x-crow-client-ip'];
    const raw = (Array.isArray(header) ? header[0] : header)?.trim() ?? '';
    return raw !== '' && isBareIp(raw) ? raw : request.ip;
}
