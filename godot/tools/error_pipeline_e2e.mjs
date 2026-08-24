/**
 * End-to-end proof of the client error pipeline.
 *
 * What this is: a real browser loading the real exported build, behind a proxy
 * that mimics the Caddy `/api/*` route, in front of the real Fastify API, writing
 * to a real Postgres. It triggers a genuine uncaught error in the page and then
 * asserts the row landed, grouped, in the database.
 *
 * This is the only test that covers the seam nothing else can: the reporter is
 * plain JavaScript injected into the engine's HTML shell, so neither the GDScript
 * suite (runs from source, no browser) nor the server tests (no browser) can show
 * that the shell actually loads it and that a page error reaches the database.
 *
 * What this is NOT: not real iPad Safari. Chromium with an iPad viewport does not
 * prove WebKit's audio-context rules, memory ceilings, or storage eviction.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node godot/tools/error_pipeline_e2e.mjs
 */
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createProbe } from 'node:net';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_DIR = join(ROOT, 'output/web');
const API_PORT = 8791;
const EDGE_PORT = 8792;

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
    '.pck': 'application/octet-stream', '.png': 'image/png', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};

function log(...args) { console.log(...args); }
function fail(message) { console.error(`FAIL: ${message}`); process.exit(1); }

/** Stand-in for the Caddy config: static files, plus /api/* proxied to the API. */
function startEdge() {
    const server = createServer(async (req, res) => {
        if (req.url.startsWith('/api/')) {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            try {
                const upstream = await fetch(`http://127.0.0.1:${API_PORT}${req.url}`, {
                    method: req.method,
                    headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
                    body: chunks.length ? Buffer.concat(chunks) : undefined,
                });
                const text = await upstream.text();
                res.writeHead(upstream.status, { 'content-type': 'application/json' });
                res.end(text);
            } catch (error) {
                res.writeHead(502).end(JSON.stringify({ error: String(error) }));
            }
            return;
        }
        const path = join(WEB_DIR, req.url === '/' ? 'index.html' : decodeURIComponent(req.url));
        try {
            const body = await readFile(path);
            res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
            res.end(body);
        } catch {
            res.writeHead(404).end('not found');
        }
    });
    return new Promise(resolvePromise => server.listen(EDGE_PORT, '127.0.0.1', () => resolvePromise(server)));
}

async function waitForHealth(deadlineMs = 30_000) {
    const started = Date.now();
    while (Date.now() - started < deadlineMs) {
        try {
            const response = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/health`);
            if (response.ok) return await response.json();
        } catch { /* not up yet */ }
        await new Promise(r => setTimeout(r, 400));
    }
    return null;
}

/**
 * Refuse to run against a port we do not own.
 *
 * Without this the harness silently tests whatever is already listening — which
 * happened during development: a stale API held the port, the spawned one failed
 * with EADDRINUSE, and the run still reported PASS. A test that can pass against
 * code it did not start is not a test.
 */
function assertPortFree(port) {
    return new Promise((resolvePromise, rejectPromise) => {
        const probe = createProbe();
        probe.once('error', err => rejectPromise(
            new Error(`port ${port} is already in use (${err.code}); refusing to test against a process this harness did not start`)));
        probe.once('listening', () => probe.close(() => resolvePromise()));
        probe.listen(port, '127.0.0.1');
    });
}

async function main() {
    if (!process.env.DATABASE_URL) fail('DATABASE_URL is required for the e2e error pipeline test');
    // Payload names carry a content id (index.<id>.wasm), so match the pattern.
    if (!readdirSync(WEB_DIR).some(f => /^index\.[0-9a-f]+\.wasm$/.test(f)))
        fail('no export found; run: bash godot/tools/build_web.sh');
    if (!existsSync(join(WEB_DIR, 'crow-errors.js'))) fail('crow-errors.js missing from the export');

    await assertPortFree(API_PORT);
    await assertPortFree(EDGE_PORT);

    // detached, so the whole process GROUP can be killed on the way out.
    // `npx tsx` spawns a child node process plus an esbuild service; signalling
    // npx alone leaves both alive, and they then hold the port and make the NEXT
    // run refuse to start. That is how this harness leaked a server twice.
    const api = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: join(ROOT, 'server'),
        env: { ...process.env, PORT: String(API_PORT), HOST: '127.0.0.1', LOG_LEVEL: 'warn' },
        stdio: ['ignore', 'ignore', 'inherit'],
        detached: true,
    });

    let apiExited = false;
    api.once('exit', code => {
        apiExited = true;
        if (code !== 0 && code !== null) console.error(`api process exited early with code ${code}`);
    });

    const edge = await startEdge();
    let browser;
    try {
        const health = await waitForHealth();
        if (apiExited) fail('the API process exited before it became healthy');
        if (!health) fail('the API never became healthy');
        log(`api healthy, migrations applied: ${health.migrationsApplied}`);

        // pg is CommonJS, so the namespace import is default-wrapped.
        const pgModule = await import(join(ROOT, 'server/node_modules/pg/lib/index.js'));
        const pg = pgModule.default ?? pgModule;
        const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
        await db.connect();
        const marker = `e2e boot probe ${Date.now()}`;

        // CHROMIUM_PATH lets CI point at whatever browser the runner already has
        // (GitHub runners ship Chrome) instead of downloading one.
        const browserPath = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium']
            .find(candidate => candidate && existsSync(candidate));
        browser = await chromium.launch(browserPath ? { executablePath: browserPath } : {});
        const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
        const page = await context.newPage();
        const apiCalls = [];
        page.on('response', r => { if (r.url().includes('/api/v1/errors')) apiCalls.push(r.status()); });

        await page.goto(`http://127.0.0.1:${EDGE_PORT}/`, { waitUntil: 'load', timeout: 120_000 });

        // Wait for the engine to actually settle before provoking anything.
        // The `load` event fires while the browser is still fetching and
        // compiling ~34 MB of wasm, and that work blocks the main thread — so an
        // error thrown here would sit in a timer queue that cannot run, and a
        // fixed sleep would expire before the reporter ever got a slice of CPU.
        await page.waitForFunction(() => {
            const c = document.querySelector('canvas');
            return c && c.width > 0 && c.height > 0;
        }, { timeout: 180_000 });
        await page.waitForTimeout(6000);

        // Prove the reporter is actually installed by the shell, not just present
        // as a file on disk.
        const installed = await page.evaluate(() => typeof window.crowReportError === 'function');
        if (!installed) fail('crow-errors.js did not install window.crowReportError — check html/head_include');
        log('reporter installed in the shell');

        // A genuine uncaught error, thrown the way a real bug would be, so the
        // window.onerror path is what carries it (not a direct function call).
        await page.evaluate(m => { setTimeout(() => { throw new Error(m); }, 0); }, marker);

        // Poll for the ROW, not for "any 202".
        //
        // The boot funnel beacons also POST to this endpoint and answer 202
        // immediately, so waiting on a status code exits before the thrown error
        // has even been batched — the harness would then assert on an empty table
        // and blame the client. Waiting for the specific marker is the only
        // signal that means what it says.
        const deadline = Date.now() + 40_000;
        let stored = 0;
        while (Date.now() < deadline && stored === 0) {
            const probe = await db.query(
                'select count(*)::int as n from error_events where message = $1', [marker]);
            stored = probe.rows[0].n;
            if (stored === 0) await page.waitForTimeout(500);
        }
        if (stored === 0) {
            fail(`the thrown error never reached the database (ingest statuses: ${JSON.stringify(apiCalls)})`);
        }
        log(`ingest responses: ${JSON.stringify(apiCalls)}`);

        // The boot funnel must actually have fired. Without these two events an
        // empty errors table cannot distinguish "nobody played" from "every
        // launch failed", which is the single most dangerous blind spot for a
        // public launch.
        const funnel = await db.query(
            `select kind, count(*)::int as n from error_events
              where kind in ('boot_start', 'boot_engine_started', 'boot_ready')
              group by kind order by kind`);
        const kinds = funnel.rows.map(r => r.kind);
        log(`boot funnel   : ${JSON.stringify(funnel.rows)}`);
        if (!kinds.includes('boot_start')) fail('no boot_start beacon was recorded');
        if (!kinds.includes('boot_ready')) fail('no boot_ready beacon was recorded — the denominator is missing');

        const events = await db.query(
            'select fingerprint, level, kind, release, context from error_events where message = $1', [marker]);
        if (events.rowCount !== 1) fail(`expected exactly 1 stored event, got ${events.rowCount}`);

        const groups = await db.query(
            'select event_count, message from error_groups where fingerprint = $1',
            [events.rows[0].fingerprint]);
        if (groups.rowCount !== 1) fail('the event was stored without a group');

        const row = events.rows[0];
        log(`stored event : kind=${row.kind} level=${row.level} release=${row.release}`);
        log(`context      : ${JSON.stringify(row.context)}`);
        log(`group count  : ${groups.rows[0].event_count}`);

        // The context must be coarse device facts only — never anything about a child.
        const contextKeys = Object.keys(row.context ?? {});
        const forbidden = contextKeys.filter(k => /child|pin|name|user|save/i.test(k));
        if (forbidden.length > 0) fail(`context carried player-identifying keys: ${forbidden.join(', ')}`);
        if (!contextKeys.includes('viewportW')) fail('context lost the coarse device facts');

        await db.end();
        log('PASS: browser error reached Postgres, grouped, with coarse context only');
    } finally {
        if (browser) await browser.close();
        edge.close();
        try { process.kill(-api.pid, 'SIGKILL'); } catch { /* already gone */ }
    }
}

main().catch(error => { console.error('FAIL:', error); process.exit(1); });
