/**
 * The two database defences the schema provides, asserted by running them.
 *
 * `migrations/002` enables and FORCEs row-level security on the six child-data
 * tables, and deliberately withholds DELETE on `attempts` and
 * `child_save_history` so the record of what a child did cannot be rewritten.
 * Both defences depend entirely on one statement — `set local role crow_app` —
 * because a superuser bypasses RLS outright and holds every privilege.
 *
 * Nothing tested that statement. Two of the four database entry points did not
 * execute it: `DELETE /api/v1/family`, the only destructive endpoint, and
 * `POST /api/v1/errors`, which is anonymous and unauthenticated. Meanwhile
 * `routes/family.ts` asserted in a header comment that "every one of them runs
 * inside withFamily()", the delete's own comment said "it is run as the app
 * role", and `test/README.md` explained why the role drop matters. Three
 * confident descriptions of a thing that was not happening, and no test.
 *
 * So these tests are deliberately about the MECHANISM rather than about any
 * route's happy path: what current_user is, what a query with no WHERE clause
 * returns, and what the role is refused. A route test proves a route; only this
 * proves the floor under all of them.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const HAS_DB = Boolean(process.env['DATABASE_URL']);
const ROUTES_DIR = join(import.meta.dirname, '..', 'src', 'routes');

/**
 * The static half, which needs no database and is the check that would actually
 * have caught this. `withTransaction` runs as the connecting user — the
 * superuser on Railway — and exists for `migrate.ts`, which does DDL. A route
 * reaching for it opts out of RLS and of the append-only grants silently, with
 * no failing test and no error at runtime.
 */
describe('no route bypasses the app role', () => {
    const routeFiles = readdirSync(ROUTES_DIR).filter(f => f.endsWith('.ts'));

    it('finds the route files at all', () => {
        // Without this, a moved directory turns every assertion below into a
        // vacuous pass over an empty array.
        assert.ok(routeFiles.length >= 4, `expected the route files, found ${routeFiles.length}`);
    });

    for (const file of routeFiles) {
        it(`${file} does not import withTransaction or query the bare pool`, () => {
            const src = readFileSync(join(ROUTES_DIR, file), 'utf8');
            const code = src
                .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
                .replace(/^\s*\/\/.*$/gm, '');             // line comments
            assert.ok(
                !/\bwithTransaction\b/.test(code),
                `${file} imports withTransaction, which runs as the superuser and bypasses RLS. ` +
                'Use withAppRole, or withFamily for family-scoped data.',
            );
            assert.ok(
                !/\bpool\s*\.\s*query\b/.test(code),
                `${file} queries the pool directly, which connects as the superuser. ` +
                'Use withAppRole, or withFamily for family-scoped data.',
            );
        });
    }
});

describe('database-level isolation', { skip: HAS_DB ? false : 'DATABASE_URL not set' }, () => {
    let pool: typeof import('../src/db.ts').pool;
    let withFamily: typeof import('../src/lib/familyDb.ts').withFamily;
    let withAppRole: typeof import('../src/db.ts').withAppRole;
    const families: string[] = [];

    before(async () => {
        ({ pool, withAppRole } = await import('../src/db.ts'));
        ({ withFamily } = await import('../src/lib/familyDb.ts'));

        // Two families, each with one child and one attempt. Distinct display
        // names so a leak is legible in the assertion message rather than a
        // count that happens to be right.
        for (const tag of ['iso-A', 'iso-B']) {
            const { rows } = await pool.query<{ id: string }>(
                'insert into families default values returning id');
            const familyId = rows[0]!.id;
            families.push(familyId);
            await pool.query(
                'insert into children (family_id, display_name) values ($1, $2)',
                [familyId, tag]);
            await pool.query(
                `insert into attempts (family_id, child_id, attempt_id, problem_id, correct)
                 select $1, id, 'iso-1', 'p1', true from children where family_id = $1`,
                [familyId]);
        }
    });

    after(async () => {
        for (const id of families) {
            await pool.query('delete from families where id = $1', [id]);
        }
    });

    it('the pool really does connect as a superuser', async () => {
        // The premise of everything below. If Railway ever hands us a
        // non-superuser, these tests would pass for the wrong reason and the
        // role drop would look unnecessary.
        const { rows } = await pool.query<{ su: boolean }>(
            `select usesuper as su from pg_user where usename = current_user`);
        assert.equal(rows[0]?.su, true,
            'the pool user is not a superuser — re-read whether the role drop is still what protects RLS');
    });

    it('withAppRole drops to crow_app', async () => {
        const who = await withAppRole(c => c.query<{ u: string }>('select current_user as u'));
        assert.equal(who.rows[0]?.u, 'crow_app');
    });

    it('withFamily drops to crow_app', async () => {
        const who = await withFamily(families[0]!, c => c.query<{ u: string }>('select current_user as u'));
        assert.equal(who.rows[0]?.u, 'crow_app');
    });

    it('a query with no family predicate returns only the current family', async () => {
        // The whole point of RLS here: one forgotten WHERE clause in a store of
        // children's data should not be able to return another family's rows.
        const seen = await withFamily(families[0]!, async c =>
            (await c.query<{ display_name: string }>('select display_name from children')).rows
                .map(r => r.display_name));
        assert.deepEqual(seen, ['iso-A']);
    });

    it('the same query on the bare pool sees every family, which is why the role drop matters', async () => {
        const seen = (await pool.query<{ display_name: string }>(
            `select display_name from children where display_name like 'iso-%'`)).rows
            .map(r => r.display_name).sort();
        assert.deepEqual(seen, ['iso-A', 'iso-B']);
    });

    it('crow_app cannot delete an attempt', async () => {
        await assert.rejects(
            withFamily(families[0]!, c => c.query('delete from attempts')),
            /permission denied for table attempts/,
            'attempts is append-only by grant; the app role must not be able to rewrite the record',
        );
    });

    it('crow_app can still cascade a family delete, which is what the erasure endpoint needs', async () => {
        // GDPR erasure runs as crow_app now. The role holds DELETE on families
        // but NOT on attempts — the cascade reaches them anyway, because
        // referential-integrity actions run as the table owner. That is the
        // property that makes routing the endpoint through withFamily viable at
        // all, so it is asserted rather than assumed.
        const target = families.pop()!;
        await withFamily(target, c => c.query('delete from families where id = $1', [target]));
        const { rows } = await pool.query<{ kids: string; attempts: string }>(
            `select (select count(*)::text from children where family_id = $1) as kids,
                    (select count(*)::text from attempts where family_id = $1) as attempts`,
            [target]);
        assert.deepEqual(rows[0], { kids: '0', attempts: '0' });
    });

    it('health can read schema_migrations as crow_app', async () => {
        // Migration 003 exists only for this. Without the grant, routing the
        // liveness probe through the app role turns it into a 503.
        const { rows } = await withAppRole(c => c.query<{ count: string }>(
            'select count(*)::text as count from schema_migrations'));
        assert.ok(Number(rows[0]?.count) > 0);
    });
});
