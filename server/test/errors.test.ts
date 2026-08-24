/**
 * Tests for the error pipeline.
 *
 * These need a real Postgres because the two things most worth proving are SQL
 * behaviour, not TypeScript behaviour: the hourly raw-storage throttle (one
 * statement doing a lazy window reset) and partition-drop retention. Mocking the
 * database here would test the mock.
 *
 * Run:  DATABASE_URL=postgres://... npm test        (in server/)
 * Skips cleanly when DATABASE_URL is unset, so it never fails a machine that has
 * no database — but CI sets one, so it does not silently stop covering anything.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fingerprint, normalizeMessage } from '../src/lib/fingerprint.ts';
import { clampString, coarsenIp, normalizeEvent, resolveOccurredAt, sanitizeContext } from '../src/lib/errorEvents.ts';

const HAS_DB = Boolean(process.env['DATABASE_URL']);

describe('fingerprint normalization', () => {
    it('groups the same bug across differing ids and numbers', () => {
        const a = 'Failed to load problem attempt-1717171717-a1b2c3 for child-1717-xyz at step 4';
        const b = 'Failed to load problem attempt-1818181818-z9y8x7 for child-9999-abc at step 17';
        assert.equal(normalizeMessage(a), normalizeMessage(b));
        assert.equal(fingerprint({ message: a }), fingerprint({ message: b }));
    });

    it('keeps genuinely different bugs apart', () => {
        assert.notEqual(
            fingerprint({ message: 'pck failed to load' }),
            fingerprint({ message: 'wasm compile failed' }),
        );
    });

    it('treats a different release as a different group', () => {
        // A fix should show as the old group going quiet, not as a silent merge.
        assert.notEqual(
            fingerprint({ message: 'same bug', release: 'abc1234' }),
            fingerprint({ message: 'same bug', release: 'def5678' }),
        );
    });

    it('normalizes quoted payloads, urls and res:// paths', () => {
        assert.equal(
            normalizeMessage('cannot open "level_03_meadow.json" from res://data/levels/x.json'),
            normalizeMessage('cannot open "level_01_forest.json" from res://data/levels/y.json'),
        );
    });

    it('does not collapse two unrelated messages just because both have numbers', () => {
        assert.notEqual(
            normalizeMessage('coins 42'),
            normalizeMessage('lives 42'),
        );
    });
});

describe('event sanitization', () => {
    it('drops an event with no usable message', () => {
        assert.equal(normalizeEvent({ message: '   ' }, new Date()), null);
    });

    it('rejects an unknown level rather than storing it', () => {
        const e = normalizeEvent({ message: 'x', level: 'catastrophe' }, new Date());
        assert.equal(e?.level, 'error');
    });

    it('keeps only scalar, well-named context keys', () => {
        const ctx = sanitizeContext({
            platform: 'iPad',
            viewportW: 1180,
            reduced: true,
            'bad key!': 'x',
            nested: { child: 'Emma' },
            arr: [1, 2, 3],
        });
        assert.deepEqual(ctx, { platform: 'iPad', viewportW: 1180, reduced: true });
    });

    it('refuses a future client clock, which would land in the wrong partition', () => {
        const now = new Date('2026-08-23T12:00:00Z');
        const far = new Date('2027-01-01T00:00:00Z').toISOString();
        assert.equal(resolveOccurredAt(far, now).getTime(), now.getTime());
        // Small skew is normal and preserved.
        const near = new Date('2026-08-23T11:59:00Z').toISOString();
        assert.equal(resolveOccurredAt(near, now).toISOString(), near);
    });

    it('coarsens addresses so they identify a network, not a family', () => {
        assert.equal(coarsenIp('203.0.113.47'), '203.0.113.0/24');
        assert.equal(coarsenIp('::ffff:203.0.113.47'), '203.0.113.0/24');
        assert.equal(coarsenIp('2001:db8:1234:5678::1'), '2001:db8:1234::/48');
        assert.equal(coarsenIp(undefined), null);
    });

    it('clamps oversized strings instead of rejecting the event', () => {
        assert.equal(clampString('x'.repeat(5000), 10)?.length, 10);
    });
});

describe('database-backed ingestion', { skip: HAS_DB ? false : 'DATABASE_URL not set' }, () => {
    let pool: typeof import('../src/db.ts').pool;
    let recordEvent: typeof import('../src/lib/errorEvents.ts').recordEvent;
    let runMaintenance: typeof import('../src/maintenance.ts').runMaintenance;
    let migrate: typeof import('../src/migrate.ts').migrate;

    before(async () => {
        ({ pool } = await import('../src/db.ts'));
        ({ recordEvent } = await import('../src/lib/errorEvents.ts'));
        ({ runMaintenance } = await import('../src/maintenance.ts'));
        ({ migrate } = await import('../src/migrate.ts'));
        await migrate();
        await runMaintenance();
        await pool.query('delete from error_events');
        await pool.query('delete from error_groups');
    });

    it('stores raw bodies up to the hourly cap, then counts only', async () => {
        const client = await pool.connect();
        try {
            await client.query('begin');
            const message = 'throttle probe: the same bug over and over';
            let stored = 0;
            let throttled = 0;
            for (let i = 0; i < 15; i += 1) {
                const event = normalizeEvent({ message, release: 'test' }, new Date());
                assert.ok(event);
                const result = await recordEvent(client, event, { userAgent: null, ipPrefix: null });
                if (result.rawStored) stored += 1; else throttled += 1;
            }
            // Cap is 10/hour/group by default: every event counted, only 10 kept.
            assert.equal(stored, 10, 'raw rows stored should stop at the cap');
            assert.equal(throttled, 5, 'the rest should be counted, not stored');

            const group = await client.query<{ event_count: string; raw_in_window: number }>(
                'select event_count::text, raw_in_window from error_groups where message = $1', [message]);
            assert.equal(Number(group.rows[0]?.event_count), 15, 'the counter must see every event');

            const raw = await client.query<{ n: string }>(
                'select count(*)::text as n from error_events where message = $1', [message]);
            assert.equal(Number(raw.rows[0]?.n), 10);
            await client.query('rollback');
        } finally {
            client.release();
        }
    });

    it('is idempotent on group upsert: one group, many events', async () => {
        const client = await pool.connect();
        try {
            await client.query('begin');
            for (let i = 0; i < 3; i += 1) {
                const event = normalizeEvent({ message: 'single group probe', release: 'test' }, new Date());
                await recordEvent(client, event!, { userAgent: null, ipPrefix: null });
            }
            const groups = await client.query<{ n: string }>(
                `select count(*)::text as n from error_groups where message = 'single group probe'`);
            assert.equal(Number(groups.rows[0]?.n), 1);
            await client.query('rollback');
        } finally {
            client.release();
        }
    });

    it('drops whole day partitions past retention rather than deleting rows', async () => {
        // Build a partition well outside the window, put a row in it, and prove
        // the partition itself disappears — DELETE would leave dead tuples.
        const old = '2020-01-01';
        // DDL cannot take bind parameters in Postgres, so these bounds are
        // inlined literals rather than $1/$2.
        await pool.query(
            `create table if not exists error_events_20200101
             partition of error_events for values from ('2020-01-01') to ('2020-01-02')`);
        await pool.query(
            `insert into error_groups (fingerprint, message) values ('retention-probe', 'old bug')
             on conflict (fingerprint) do nothing`);
        await pool.query(
            `insert into error_events (occurred_at, fingerprint, message)
             values ($1, 'retention-probe', 'old bug')`, [`${old}T00:00:00Z`]);

        const before = await pool.query<{ n: string }>(
            `select count(*)::text as n from pg_class where relname = 'error_events_20200101'`);
        assert.equal(Number(before.rows[0]?.n), 1, 'the old partition should exist before maintenance');

        const result = await runMaintenance();
        assert.ok(
            result.dropped.includes('error_events_20200101'),
            `expected the old partition to be dropped, got ${JSON.stringify(result.dropped)}`,
        );

        const after = await pool.query<{ n: string }>(
            `select count(*)::text as n from pg_class where relname = 'error_events_20200101'`);
        assert.equal(Number(after.rows[0]?.n), 0, 'the partition itself must be gone');

        // The aggregate survives: that is the point of two retentions.
        const group = await pool.query<{ n: string }>(
            `select count(*)::text as n from error_groups where fingerprint = 'retention-probe'`);
        assert.equal(Number(group.rows[0]?.n), 1, 'aggregates are kept forever');
    });

    it('creates upcoming partitions idempotently', async () => {
        const first = await runMaintenance();
        assert.equal(first.created, 0, 'a second run should create nothing new');
    });
});

describe('the endpoint', { skip: HAS_DB ? false : 'DATABASE_URL not set' }, () => {
    it('accepts a batch, rejects a malformed one, and never echoes input', async () => {
        const { buildApp } = await import('../src/app.ts');
        const app = await buildApp();

        const ok = await app.inject({
            method: 'POST',
            url: '/api/v1/errors',
            payload: {
                release: 'testrel',
                events: [{ message: 'boot failed: wasm compile error', kind: 'js', level: 'fatal' }],
            },
        });
        assert.equal(ok.statusCode, 202);
        assert.equal(ok.json().accepted, 1);

        // A player-controlled string must not come back out of the API.
        assert.ok(!ok.body.includes('wasm compile error'));

        const bad = await app.inject({
            method: 'POST', url: '/api/v1/errors', payload: { events: [{ notAMessage: 1 }] },
        });
        assert.equal(bad.statusCode, 400);

        const empty = await app.inject({
            method: 'POST', url: '/api/v1/errors', payload: { events: [] },
        });
        assert.equal(empty.statusCode, 400, 'an empty batch is a client bug, not a silent success');

        await app.close();
    });
});

// The pg Pool is a module singleton, so it is closed once for the whole file,
// never per-suite: a suite that ends the shared pool breaks every suite after it.
after(async () => {
    if (!HAS_DB) return;
    const { pool } = await import('../src/db.ts');
    await pool.end();
});
