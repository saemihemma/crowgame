/**
 * The two database defences the schema provides, asserted by running them.
 *
 * `migrations/002` enables and FORCEs row-level security on the child-data tables
 * (`006` added `play_pings` to them), and deliberately withholds DELETE on
 * `attempts` so the record of what a child answered cannot be rewritten. Both defences depend entirely on one
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
const SRC_DIR = join(import.meta.dirname, '..', 'src');
const ROUTES_DIR = join(SRC_DIR, 'routes');
const LIB_DIR = join(SRC_DIR, 'lib');

/**
 * The files allowed to touch the pool or `withTransaction` directly, each for a
 * stated reason. Anything not on this list is a request path, and a request path
 * that reaches the pool has opted out of RLS and of the append-only grants.
 *
 *   db.ts          builds the transaction helpers; it IS the pool
 *   familyDb.ts    builds withFamily/withAuthTables on top of them
 *   migrate.ts     DDL, and it creates the crow_app role — needs the superuser
 *   maintenance.ts partition DDL on a cron schedule, not a request path. Note
 *                  that retention drops partitions as the table OWNER, which is
 *                  what lets `error_events` be pruned while crow_app holds no
 *                  DELETE on it.
 *
 * The comment here used to say "the two files allowed to touch the pool", naming
 * two of the four — an exception list that was already wrong when written.
 */
const POOL_OWNERS = new Set(['db.ts', 'familyDb.ts', 'migrate.ts', 'maintenance.ts']);

/**
 * The four tables that deliberately carry no RLS policy, subtracted by name from
 * the derived family-scoped set. Resolving a token to a family has to happen
 * BEFORE the family is known, so a policy comparing against `app.family_id` would
 * need the answer the lookup is producing.
 *
 * This list is the whole exception, and it is subtracted rather than the protected
 * set being enumerated — that direction matters. See RLS_DENOMINATOR below.
 */
const AUTH_TABLES_WITHOUT_RLS = [
    'device_tokens', 'devices', 'login_codes', 'parents',
    // `accounts` is the username+PIN login (migration 007) and is the same kind
    // of table for the same reason: signing in means finding a family FROM a
    // username, so the policy would need the row it is being asked to authorize.
    'accounts',
];

/**
 * RLS_DENOMINATOR — why the protected set is DERIVED and not listed.
 *
 * `... where relrowsecurity or relforcerowsecurity` enumerates the tables that
 * ARE protected. Compared against six literals that passes, and a seventh table
 * with no policy at all is invisible to it by construction. A reviewer proved
 * exactly that: a new `child_notes` table with a foreign key to `families`, a
 * grant to `crow_app` and no policy passed all 59 tests, with every family's rows
 * in it readable inside any `withFamily` transaction.
 *
 * So the denominator is the FK walk: every table whose foreign keys reach
 * `families`, minus the four above. It has already earned that shape: `play_pings`
 * arrived with the sessions feature and joined the protected set automatically,
 * which is how the same run caught that the family export had not grown with it.
 * A count here would have gone stale instead — so there is no count.
 */
async function familyScopedTables(
    pool: typeof import('../src/db.ts').pool,
): Promise<Set<string>> {
    const { rows } = await pool.query<{ table_name: string }>(
        `with recursive reach(t) as (
             select 'families'::text
             union
             select c.conrelid::regclass::text
               from pg_constraint c
               join reach r on c.confrelid::regclass::text = r.t
              where c.contype = 'f'
         )
         select t as table_name from reach where t <> 'families'`);
    return new Set(rows.map(r => r.table_name));
}

/**
 * The static half, which needs no database and is the check that would actually
 * have caught this. `withTransaction` runs as the connecting user — the
 * superuser on Railway — and exists for `migrate.ts`, which does DDL. A route
 * reaching for it opts out of RLS and of the append-only grants silently, with
 * no failing test and no error at runtime.
 */
describe('no route bypasses the app role', () => {
    // routes/ AND lib/. This scanned routes/ alone for two rounds, while every
    // actual data access lives in lib/ — deviceAuth, errorEvents, saveSync. Clean
    // today, which is the reason to include it now rather than after it is not;
    // the retired-name ban learned the same lesson one commit earlier and this
    // gate, written before it, did not.
    // All three source directories. This scanned routes/ alone for two rounds
    // while every actual data access lives in lib/, and then routes/ and lib/
    // while src/ itself held the two files that legitimately use the superuser —
    // the directory where a mistake is least visible, because a superuser query
    // belongs there and a request-path one does not.
    const scanned = [
        ...readdirSync(ROUTES_DIR).filter(f => f.endsWith('.ts')).map(f => ['routes', f] as const),
        ...readdirSync(LIB_DIR).filter(f => f.endsWith('.ts') && !POOL_OWNERS.has(f))
            .map(f => ['lib', f] as const),
        ...readdirSync(SRC_DIR, { withFileTypes: true })
            .filter(e => e.isFile() && e.name.endsWith('.ts') && !POOL_OWNERS.has(e.name))
            .map(e => ['.', e.name] as const),
    ];

    it('finds the files to scan at all', () => {
        // Without this, a moved directory turns every assertion below into a
        // vacuous pass over an empty array.
        assert.ok(scanned.length >= 13, `expected routes/, lib/ and src/, found ${scanned.length}`);
        for (const dir of ['routes', 'lib', '.']) {
            assert.ok(scanned.some(([d]) => d === dir), `${dir} must be in scope`);
        }
        // And the exception list must name files that exist, or it is silently
        // excluding nothing while looking like it excludes something.
        for (const owner of POOL_OWNERS) {
            const found = [...readdirSync(LIB_DIR), ...readdirSync(SRC_DIR)].includes(owner);
            assert.ok(found, `POOL_OWNERS names ${owner}, which no longer exists`);
        }
    });

    for (const [dir, file] of scanned) {
        it(`${dir}/${file} does not import withTransaction or query the bare pool`, () => {
            const src = readFileSync(join(SRC_DIR, dir, file), 'utf8');
            const code = src
                .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
                .replace(/^\s*\/\/.*$/gm, '');             // line comments
            assert.ok(
                !/\bwithTransaction\b/.test(code),
                `${dir}/${file} imports withTransaction, which runs as the superuser and ` +
                'bypasses RLS. Use withAppRole, or withFamily for family-scoped data.',
            );

            // THE OWNER'S SURFACE IS THE ONE PLACE THE BARE POOL IS CORRECT.
            //
            // This rule was written when every route served one family, and it
            // said flatly that nothing may touch the pool. Then the owner
            // dashboard arrived: it aggregates ACROSS families, which is exactly
            // what RLS FORCE on `crow_app` prevents, so `withAppRole` cannot
            // serve it and `withFamily` is meaningless for it. The rule was too
            // broad, not the code wrong.
            //
            // So the exemption is conditional, not a name on a skip list: a file
            // may use the pool only if EVERY route it registers is behind
            // `requireAdmin`. Add an admin route without owner auth, or reach for
            // the pool from a device-authorized file, and this still fails —
            // which is the property the blanket ban was really protecting.
            if (/\bpool\s*\.\s*query\b/.test(code)) {
                const routes = code.match(/app\.(get|post|put|delete|patch)\s*\(/g) ?? [];
                const adminGuards = code.match(/preHandler:\s*requireAdmin\b/g) ?? [];
                assert.ok(
                    routes.length > 0 && adminGuards.length > 0,
                    `${dir}/${file} queries the pool directly, which connects as the superuser. ` +
                    'Use withAppRole, or withFamily for family-scoped data. Only a surface where ' +
                    'every route is behind requireAdmin may read across families on the pool.',
                );
                // One `const auth = { preHandler: requireAdmin }` reused by every
                // route is the shape admin.ts uses, so the guard count does not
                // have to match the route count — but every route must take it.
                const guarded = code.match(/\b(auth|adminAuth)\b\s*,/g) ?? [];
                assert.ok(
                    guarded.length >= routes.length,
                    `${dir}/${file} uses the bare pool and registers ${routes.length} route(s), ` +
                    `but only ${guarded.length} pass the admin preHandler. Every route on a ` +
                    'pool-using surface has to be behind owner auth.',
                );
            }
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

        // THREE families, each with a row in EVERY RLS-protected table.
        //
        // Two was not enough and one row per table was not enough, and the way
        // that failed is the whole reason this fixture is now this long. The
        // behavioural isolation check below passed with permissive policies on all
        // five tables — 24 pass, 0 fail, family isolation entirely off — whenever
        // this file ran on a database holding only its own fixtures. It
        // discriminated in CI purely because cloudsave.test.ts happens to leave
        // cross-family rows behind: three of the five subtests were comparing
        // `mine = 0` against somebody else's data. A security gate that is green
        // with RLS disabled, for reasons that live in another file's leftovers, is
        // worse than no gate.
        //
        // Three, because the erasure test destroys one and the loop needs two
        // survivors. Every protected table gets rows for more than one family, so
        // there is always something for a broken policy to leak.
        //
        // A NEW FAMILY-SCOPED TABLE HAS TO BE SEEDED HERE. The protected set is
        // derived by walking foreign keys to `families`, so a new table joins the
        // isolation loop the moment it is migrated — and the loop refuses to run
        // vacuously on a table with no rows. That is deliberate: `play_pings`
        // arrived with the sessions feature, the loop went red rather than
        // quietly passing over an empty table, and the same red caught the
        // family export not growing with it either.
        for (const tag of ['iso-A', 'iso-B', 'iso-C']) {
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
            await pool.query(
                `insert into child_saves (family_id, child_id, save, save_version, server_version)
                 select $1, id, '{}'::jsonb, 1, 1 from children where family_id = $1`,
                [familyId]);
            await pool.query(
                `insert into child_save_history (family_id, child_id, save, server_version)
                 select $1, id, '{}'::jsonb, 1 from children where family_id = $1`,
                [familyId]);
            await pool.query(
                `insert into child_aliases (family_id, legacy_child_id, child_id)
                 select $1, 'legacy-' || $2::text, id from children where family_id = $1`,
                [familyId, tag]);
            await pool.query(
                `insert into sync_conflicts
                     (family_id, child_id, incoming_attempted, stored_attempted, outcome)
                 select $1, id, 1, 2, 'rejected' from children where family_id = $1`,
                [familyId]);
            await pool.query(
                `insert into play_pings (family_id, child_id)
                 select $1, id from children where family_id = $1`,
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
        assert.deepEqual(seen, ['iso-A', 'iso-B', 'iso-C']);
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
        // Takes the LAST family (iso-C), which exists so that popping one still
        // leaves two for the isolation loop. Popping iso-B is how that loop ended
        // up with nothing to compare against.
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
        // server_version 2: the fixture already put a row at 1 in every family, and
        // the primary key is (child_id, server_version). Deleting only version 2
        // also keeps the isolation loop's row intact, since these tests share a
        // database and node:test gives no ordering guarantee between them.
        await pool.query(
            `insert into child_save_history (family_id, child_id, save, server_version)
             values ($1, $2, '{}'::jsonb, 2)`, [familyId, childId]);
        const deleted = await withFamily(familyId, c =>
            c.query('delete from child_save_history where child_id = $1 and server_version = 2',
                [childId]));
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
        // "Family-scoped" is derived by FOLLOWING FOREIGN KEYS to `families`, not
        // by looking for a `family_id` column. The column heuristic was itself a
        // shape assumption and it had a live counterexample: `device_tokens` hangs
        // off `device_id`, holds family data, and was invisible to it. A future
        // table hung off `child_id` would be too.
        const familyScoped = await familyScopedTables(pool);
        assert.ok(familyScoped.has('device_tokens'),
            'the FK walk must reach device_tokens — that is the case the old ' +
            'family_id heuristic missed, so its absence means this check regressed');
        assert.ok(familyScoped.size >= 10,
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

    it('RLS is enabled AND forced on exactly the derived child-data set', async () => {
        // Nothing asserted RLS was switched on at all until round 7 of review.
        // The protected set was a hardcoded six-element array in migration 002
        // with no gate, and the only behavioural assertion covered `children`, so
        // five of six were unexercised and a seventh table would have been
        // unprotected and unnoticed. Meanwhile three docs claimed database-level
        // isolation for "the family's records" without naming the four auth
        // tables that deliberately have none — where the only PII lives.
        //
        // FORCE matters as much as ENABLE: without it the table OWNER bypasses
        // its own policies, and on a managed Postgres the owner is the user the
        // migration ran as.
        // The set that MUST be protected, derived (see RLS_DENOMINATOR above).
        const familyScoped = await familyScopedTables(pool);
        const mustBeProtected = [...familyScoped]
            .filter(t => !AUTH_TABLES_WITHOUT_RLS.includes(t)).sort();
        assert.ok(mustBeProtected.length >= 6,
            `the FK walk found only ${mustBeProtected.length} tables needing RLS; ` +
            'if the walk broke, this check enforces nothing');

        const { rows } = await pool.query<{ relname: string; enabled: boolean; forced: boolean }>(
            `select c.relname, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
               from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r'`);
        const state = new Map(rows.map(r => [r.relname, r]));

        for (const table of mustBeProtected) {
            const row = state.get(table);
            assert.ok(row, `${table} is family-scoped but not in pg_class`);
            assert.ok(row.enabled,
                `${table}'s foreign keys reach families, so it holds one family's data, and ` +
                'it has NO row-level security. Either add a policy in a migration, or add it ' +
                'to AUTH_TABLES_WITHOUT_RLS with the reason and say so in SECURITY.md, ' +
                'ARCHITECTURE.md and PRIVACY.md — all three describe this set.');
            assert.ok(row.forced,
                `${table} has RLS ENABLEd but not FORCEd — the table owner then bypasses its ` +
                'own policies, and on managed Postgres the owner is the migration user');
        }

        // And the four exceptions really are outside it, so the docs' exception
        // clause is a fact rather than a comment.
        for (const table of AUTH_TABLES_WITHOUT_RLS) {
            assert.ok(!state.get(table)?.enabled,
                `${table} has acquired an RLS policy. That is probably good news, but ` +
                'three docs currently explain why it has none — rewrite them, and remove ' +
                'it from AUTH_TABLES_WITHOUT_RLS.');
        }
    });

    it('every RLS-protected table actually isolates, not just children', async () => {
        // The one behavioural assertion covered `children`. A policy could be
        // missing, misspelled, or written against the wrong column on any of the
        // other five and every test would still pass.
        const familyId = families[0]!;

        // Derived, for the same reason as the assertion above: a hardcoded array
        // never exercises a new table. `children` is covered by its own subtest,
        // which compares display names rather than counts.
        const familyScoped = await familyScopedTables(pool);
        const toCheck = [...familyScoped]
            .filter(t => !AUTH_TABLES_WITHOUT_RLS.includes(t) && t !== 'children').sort();
        assert.ok(toCheck.length >= 5,
            `expected the protected tables less children, found ${toCheck.length}`);

        for (const table of toCheck) {
            const seen = Number(await withFamily(familyId, async c =>
                (await c.query<{ n: string }>(`select count(*)::text as n from ${table}`)).rows[0]!.n));
            const all = Number((await pool.query<{ n: string }>(
                `select count(*)::text as n from ${table}`)).rows[0]!.n);
            const mine = Number((await pool.query<{ n: string }>(
                `select count(*)::text as n from ${table} where family_id = $1`,
                [familyId])).rows[0]!.n);

            // THE GUARD THAT WAS MISSING, and its absence is why this check
            // passed with every policy set to `using (true)`. If this family owns
            // no rows here, or nobody else does, then `seen === mine` holds
            // whether the policy filters or not and the comparison below asserts
            // nothing. This file already carries exactly this guard for the route
            // scan 100 lines up; it was not applied to the security check.
            assert.ok(mine > 0,
                `${table}: this family owns no rows, so the isolation comparison would ` +
                'be vacuous. Fix the fixture, do not delete the check.');
            assert.ok(all > mine,
                `${table}: no OTHER family owns a row (${all} total, ${mine} ours), so a ` +
                'permissive policy would be indistinguishable from a correct one.');

            assert.equal(seen, mine,
                `${table}: inside withFamily the visible row count must equal this family's ` +
                `own (${mine}), got ${seen} of ${all} total — the policy is not filtering`);
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
