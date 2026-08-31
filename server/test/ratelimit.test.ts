import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { FastifyRequest } from 'fastify';

/**
 * The limiter's KEY, and the ceiling under every route.
 *
 * Both of these were broken in a way no test could have noticed, because both
 * failures look like a working system right up to the moment they matter:
 *
 * 1. THE KEY. `deploy/web/Caddyfile` set `X-Forwarded-For` to `{remote_host}`,
 *    which behind Railway's edge is Railway's edge — one address for every
 *    player. So every "per-IP" budget in this service was a single shared
 *    bucket: one noisy client throttled everybody, and no attacker was ever
 *    isolated. A test that hammers one route from one fake client passes
 *    identically either way, which is why the assertions below are about the
 *    mechanism instead: what the Caddyfile forwards, and what `clientIp` will
 *    and will not believe.
 *
 * 2. THE CEILING. `global: false` meant a route had a budget only if its own
 *    registration asked for one, and 12 of 20 did not — including
 *    `/api/v1/health` and `/api/v1/auth/session`, which are unauthenticated and
 *    hit an 8-connection pool on every call.
 *
 * The IP-forgery cases matter beyond rate limiting: `coarsenIp` writes this
 * value into `error_events`, so a header this code believed blindly would let a
 * caller choose what the error log says about them.
 */

const SRC = join(import.meta.dirname, '..', 'src');
const CADDYFILE = join(import.meta.dirname, '..', '..', 'deploy', 'web', 'Caddyfile');

function read(...parts: string[]): string {
    return readFileSync(join(...parts), 'utf8');
}

/** A request is only what `clientIp` reads of one: headers, and the socket address. */
function fakeRequest(header: string | string[] | undefined, socketIp = '203.0.113.9'): FastifyRequest {
    return { headers: { 'x-crow-client-ip': header }, ip: socketIp } as unknown as FastifyRequest;
}

describe('the client address the limiter keys on', () => {
    it('is the edge-supplied header when that header is one bare address', async () => {
        const { clientIp } = await import('../src/lib/clientIp.js');
        assert.equal(clientIp(fakeRequest('198.51.100.7')), '198.51.100.7');
        assert.equal(clientIp(fakeRequest('2001:db8::1')), '2001:db8::1');
    });

    it('falls back to the socket address rather than trusting a blank or a forgery', async () => {
        const { clientIp } = await import('../src/lib/clientIp.js');
        const socket = '203.0.113.9';
        for (const forged of [
            undefined,
            '',
            '   ',
            // A chain: believing the leftmost entry of one a caller can extend is
            // how a per-IP limit becomes a per-request limit.
            '198.51.100.7, 203.0.113.1',
            'not-an-ip',
            'localhost',
            '198.51.100.7:443',
            '198.51.100.7\nX-Injected: 1',
        ]) {
            assert.equal(clientIp(fakeRequest(forged)), socket,
                `expected the socket address for ${JSON.stringify(forged)}`);
        }
    });

    it('is forwarded by the Caddyfile, and NOT overwritten with the proxy hop', () => {
        // Directives only. The comment above the fixed line quotes the broken
        // one verbatim, because the reason it was wrong is the whole point of
        // the comment — so a check that reads comments would fail on the very
        // explanation that stops this from being reintroduced.
        const caddy = read(CADDYFILE)
            .split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
        assert.match(
            caddy,
            /header_up X-Crow-Client-Ip \{http\.request\.header\.X-Envoy-External-Address\}/,
            'Caddy must forward the edge-derived client address to the API');
        assert.doesNotMatch(
            caddy,
            /header_up X-Forwarded-For \{remote_host\}/,
            'overwriting X-Forwarded-For with {remote_host} puts every player in one rate-limit bucket');
    });

    it('is read in exactly one place, so there is one answer to "who is this"', () => {
        const offenders: string[] = [];
        for (const dir of ['routes', 'lib']) {
            for (const file of readdirSync(join(SRC, dir)).filter(f => f.endsWith('.ts'))) {
                if (file === 'clientIp.ts') continue;
                if (/request\.ip\b/.test(read(SRC, dir, file))) offenders.push(`${dir}/${file}`);
            }
        }
        assert.deepEqual(offenders, [],
            'these read request.ip directly; use clientIp() so the proxy chain is decided once');
    });
});

describe('the ceiling under every route', () => {
    it('applies to a route that never asked for a budget of its own', async () => {
        // Set before the config module is imported: config resolves once, at
        // import time, which is also why this suite imports lazily.
        process.env['CROW_GLOBAL_RATE_PER_MIN'] = '3';
        const { buildApp } = await import('../src/app.js');
        const app = await buildApp();

        try {
            // `/admin` with no CROW_ADMIN_TOKEN answers 404 and touches no
            // database, so what this measures is the limiter and nothing else.
            const codes: number[] = [];
            for (let i = 0; i < 4; i += 1) {
                const response = await app.inject({ method: 'GET', url: '/admin' });
                codes.push(response.statusCode);
            }
            assert.deepEqual(codes, [404, 404, 404, 429],
                'the 4th request over a budget of 3 must be refused, not served');
        } finally {
            await app.close();
            delete process.env['CROW_GLOBAL_RATE_PER_MIN'];
        }
    });
});
