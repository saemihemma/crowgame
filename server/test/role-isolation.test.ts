/**
 * The two database defences the schema provides, asserted by running them.
 *
 * `migrations/002` enables and FORCEs row-level security on the six child-data
 * tables, and deliberately withholds DELETE on `attempts` so the record of what a
 * child answered cannot be rewritten. Both defences depend entirely on one
 * statement — `set local role crow_app` — because a superuser bypasses RLS
 * outright and holds every privilege.
 *
 * `child_save_history` deliberately DOES get DELETE, because the save prune needs
 * it. That asymmetry is asserted below in both directions, and the reason is a
 * round of review: this file's own header, SECURITY.md, db.ts, family.ts and
 * 002's own comment all claimed both tables withheld DELETE, while 002 granted it
 * 13 lines under the comment denying it. The test asserted only the `attempts`
 * half, so it was shaped around what was true rather than around what was
 * claimed — which is exactly how a doc sentence outlives the code it describes.
 * A grant table is derived from the live catalog at the end of this file so the
 * privileges cannot drift from the sentences describing them.
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

    it('crow_app CAN delete save history, because the prune needs it', async () => {
        // The other half of the asymmetry. Asserting only the refusal let four
        // comments and SECURITY.md claim a defence that is not there — and it
        // matters: what bounds this table is recordHistory's
        // `server_version <= $2 - $3` window, not a privilege, so a bad
        // serverVersion is a bug no grant will stop.
        const familyId = families[0]!;
        const child = await pool.query<{ id: string }>(
            'select id from children where family_id = $1', [familyId]);
        const childId = child.rows[0]!.id;
        await pool.query(
            `insert into child_saves (family_id, child_id, save, save_version, server_version)
             values ($1, $2, '{}'::jsonb, 1, 1)
             on conflict do nothing`, [familyId, childId]);
        await pool.query(
            `insert into child_save_history (family_id, child_id, save, server_version)
             values ($1, $2, '{}'::jsonb, 1)`, [familyId, childId]);
        const deleted = await withFamily(familyId, c =>
            c.query('delete from child_save_history where child_id = $1', [childId]));
        assert.ok((deleted.rowCount ?? 0) > 0,
            'the prune must be able to delete history; if this fails, saveSync is broken');
    });

    it('the grants match the sentences that describe them', async () => {
        // Derived from the live catalog rather than restated, so a migration that
        // widens a privilege fails HERE, next to the comments that would become
        // wrong, instead of silently making four of them lies.
        const { rows } = await pool.query<{ table_name: string; privs: string }>(
            `select table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
               from information_schema.table_privileges
              where grantee = 'crow_app' and table_schema = 'public'
              group by table_name`);
        const got = new Map(rows.map(r => [r.table_name, r.privs]));
        const expected: Record<string, string> = {
            // No DELETE: the record of what a child answered.
            attempts: 'INSERT,SELECT',
            // DELETE on purpose: the save prune. See the header.
            child_save_history: 'DELETE,INSERT,SELECT',
            // Error tables: insert-and-count only. Retention drops partitions as
            // the owner, so the application cannot delete a report either.
            error_events: 'INSERT,SELECT',
            error_groups: 'INSERT,SELECT,UPDATE',
            // Read-only, for the health probe (migration 003).
            schema_migrations: 'SELECT',
        };
        for (const [table, privs] of Object.entries(expected)) {
            assert.equal(got.get(table), privs,
                `crow_app privileges on ${table} changed. Update the docs that describe ` +
                'them in the same commit: SECURITY.md, db.ts, family.ts and migration 002.');
        }
    });

    it('the export covers every family-scoped table, or names why not', async () => {
        // PRIVACY.md promises "everything held about your family as one file".
        // Nothing checked that, and the handler returned 3 of 9 tables — omitting
        // `parents`, which holds the only PII in the system.
        //
        // Derived from the catalog, not restated: every table with a family_id
        // column must appear in the export response or in its `notIncluded` map.
        // A new family-scoped table then fails HERE rather than quietly narrowing
        // a promise made to a parent.
        const { rows } = await pool.query<{ table_name: string }>(
            `select c.table_name
               from information_schema.columns c
               join information_schema.tables t
                 on t.table_schema = c.table_schema and t.table_name = c.table_name
              where c.table_schema = 'public' and c.column_name = 'family_id'
                and t.table_type = 'BASE TABLE'`);
        const familyScoped = new Set(rows.map(r => r.table_name));
        assert.ok(familyScoped.size >= 8,
            `expected the family-scoped tables, found ${familyScoped.size}`);

        const source = readFileSync(join(ROUTES_DIR, 'family.ts'), 'utf8');
        const exportBody = source.slice(source.indexOf("'/api/v1/family/export'"));
        const handler = exportBody.slice(0, exportBody.indexOf('content-disposition'));

        // The exclusion list is read from the notIncluded literal ALONE, not from
        // the whole handler. The first version of this check matched `${table}:`
        // anywhere, which the response object's own `parents: parents.rows` key
        // satisfied — so deleting the parents query left the gate green. Caught by
        // mutation-testing the gate rather than by trusting it, which is the
        // lesson this whole branch keeps relearning.
        const excludedBlock = handler.slice(
            handler.indexOf('notIncluded: {'),
            handler.indexOf('notIncluded: {') === -1 ? 0 : handler.indexOf('},', handler.indexOf('notIncluded: {')));
        assert.ok(excludedBlock.includes('device_tokens'),
            'the notIncluded literal could not be located; this check would enforce nothing');

        for (const table of familyScoped) {
            const selected = new RegExp(`from\\s+${table}\\b`).test(handler);
            const namedAsExcluded = new RegExp(`\\b${table}\\s*:`).test(excludedBlock);
            assert.ok(selected || namedAsExcluded,
                `${table} is family-scoped but the export neither selects from it nor lists it ` +
                'in notIncluded. PRIVACY.md promises "everything held about your family", so a ' +
                'new table has to be exported or its exclusion stated in the response.');
        }
    });

    it('health can read schema_migrations as crow_app', async () => {
        // Migration 003 exists only for this. Without the grant, routing the
        // liveness probe through the app role turns it into a 503.
        const { rows } = await withAppRole(c => c.query<{ count: string }>(
            'select count(*)::text as count from schema_migrations'));
        assert.ok(Number(rows[0]?.count) > 0);
    });
});
