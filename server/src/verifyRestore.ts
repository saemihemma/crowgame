/**
 * Prove a restored backup is actually a backup.
 *
 * deploy/RAILWAY.md makes one hard claim: migrations are forward-only, so some
 * rollbacks are a *restore* rather than a redeploy, and "an untested backup is
 * not a backup" for a database whose entire purpose is not losing a child's
 * progress. This is the test, so that sentence stops being a good intention.
 *
 * Run it against the RESTORED copy, never against the live database:
 *
 *   CROW_JOB=verify-restore  (as a Railway one-off on the restored service)
 *   npm --prefix server run verify:restore   (locally, with DATABASE_URL set)
 *
 * It reads, and it opens exactly one transaction that it rolls back. Nothing it
 * does changes the copy, so a failed run can be re-run after a fix.
 *
 * The four questions it answers, in the order they can ruin a restore:
 *
 * 1. IS THE SCHEMA AT THE CODE'S LEVEL? A restore of yesterday's dump into
 *    today's code is a schema the app does not understand, which is the exact
 *    failure the forward-only rule exists to avoid — and it presents as data
 *    corruption, not as a 500.
 *
 * 2. DOES `crow_app` EXIST? This is the one that will actually happen. Postgres
 *    roles are CLUSTER-level, not database-level, so a logical dump restored
 *    into a fresh cluster brings the tables and not the role. Every request path
 *    in this service runs `set local role crow_app` (see db.ts), so a restore
 *    that looks perfect — every row present, every index built — answers 500 to
 *    every single request until someone re-runs the migration that creates it.
 *    A row count cannot see this. Nothing in the dashboard can either.
 *
 * 3. DO THE TWO DATABASE DEFENCES STILL HOLD? RLS FORCE on the child tables and
 *    the withheld DELETE on `attempts`. A restore performed as a superuser with
 *    the wrong flags can land the data without them, and then the schema's
 *    guarantees are decorative while looking fine.
 *
 * 4. WHAT DID THE RESTORE LOSE? Not a pass/fail — a number. The newest save and
 *    the newest attempt in the copy, against now, is how much play a child would
 *    have to do again. That figure is the reason to pick a backup frequency, and
 *    it is the one thing nobody can tell you from the dashboard either.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { config, assertDatabaseConfigured } from './config.js';

const PROGRESS_TABLES = [
    'accounts', 'children', 'child_saves', 'child_save_history',
    'attempts', 'play_pings', 'devices', 'device_tokens',
] as const;

let failures = 0;
function check(ok: boolean, message: string): void {
    if (ok) {
        console.log(`  ok    ${message}`);
    } else {
        failures += 1;
        console.log(`  FAIL  ${message}`);
    }
}

function ago(when: Date | null): string {
    if (when === null) return 'never';
    const minutes = Math.round((Date.now() - when.getTime()) / 60_000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

async function main(): Promise<void> {
    assertDatabaseConfigured();
    // A fresh client rather than the app pool: this runs as a one-off job and
    // has no reason to hold eight connections on a database being restored.
    const client = new pg.Client({
        connectionString: config.databaseUrl,
        ...(config.databaseUrl.includes('sslmode=disable')
            ? {} : { ssl: { rejectUnauthorized: false } }),
    });
    await client.connect();

    try {
        console.log(`\nVerifying the restored database (CROW_ENV=${config.environment}).\n`);

        // ── 1. schema level ──────────────────────────────────────────────────
        const onDisk = readdirSync(join(import.meta.dirname, '..', 'migrations'))
            .filter(f => f.endsWith('.sql')).length;
        const applied = await client.query<{ count: string }>(
            'select count(*)::text as count from schema_migrations');
        const appliedCount = Number(applied.rows[0]?.count ?? 0);
        check(appliedCount === onDisk,
            `schema is at the code's level: ${appliedCount} applied, ${onDisk} on disk` +
            (appliedCount === onDisk ? '' :
                ' — run the pre-deploy migration against this copy before trusting it'));

        // ── 2. the role every request path needs ─────────────────────────────
        const role = await client.query(
            `select 1 from pg_roles where rolname = 'crow_app'`);
        const hasRole = role.rowCount === 1;
        check(hasRole,
            'the crow_app role exists' + (hasRole ? '' :
                ' — roles are cluster-level and a logical dump does not carry them. ' +
                'Every request would 500. Re-run node dist/migrate.js against this copy.'));

        // ── 3. the two schema defences ───────────────────────────────────────
        const rls = await client.query<{ relname: string; relforcerowsecurity: boolean }>(
            `select relname, relforcerowsecurity from pg_class
              where relname in ('children', 'child_saves', 'attempts', 'play_pings')
                and relkind = 'r'`);
        const unforced = rls.rows.filter(r => !r.relforcerowsecurity).map(r => r.relname);
        check(unforced.length === 0,
            'row-level security is still FORCEd on the child tables' +
            (unforced.length === 0 ? '' : ` — not on: ${unforced.join(', ')}`));

        if (hasRole) {
            const canDelete = await client.query<{ has: boolean }>(
                `select has_table_privilege('crow_app', 'attempts', 'delete') as has`);
            check(canDelete.rows[0]?.has === false,
                'crow_app still cannot DELETE from attempts');

            // The live probe: be crow_app, read one family-scoped table, roll back.
            // This is what proves the GRANTs survived rather than just the role.
            await client.query('begin');
            try {
                await client.query('set local role crow_app');
                await client.query(`select set_config('app.family_id', $1, true)`,
                    ['00000000-0000-0000-0000-000000000000']);
                await client.query('select count(*) from children');
                check(true, 'crow_app can read the child tables it is supposed to');
            } catch (error) {
                check(false, `crow_app cannot read as the app does: ${(error as Error).message}`);
            } finally {
                await client.query('rollback');
            }
        }

        // ── 4. what the restore lost ─────────────────────────────────────────
        console.log('\nWhat is in this copy:\n');
        for (const table of PROGRESS_TABLES) {
            const rows = await client.query<{ count: string }>(
                `select count(*)::text as count from ${table}`);
            console.log(`  ${table.padEnd(20)} ${rows.rows[0]?.count ?? '?'}`);
        }

        const freshness = await client.query<{ save: Date | null; attempt: Date | null }>(
            `select (select max(updated_at) from child_saves) as save,
                    (select max(received_at) from attempts)   as attempt`);
        const { save = null, attempt = null } = freshness.rows[0] ?? {};
        console.log(`\n  newest save          ${ago(save)}`);
        console.log(`  newest attempt       ${ago(attempt)}`);
        console.log('\n  That gap is what a child would have to play again. If it is ' +
                    'larger than\n  you are willing to lose, the backup schedule is the ' +
                    'thing to change.\n');

        if (failures > 0) {
            console.error(`${failures} check(s) failed: this restore is NOT ready to be ` +
                          'promoted to the live database.\n');
            process.exit(1);
        }
        console.log('Every check passed. This restore is usable.\n');
    } finally {
        await client.end();
    }
}

main().catch(error => {
    console.error('verify-restore could not run:', error);
    process.exit(1);
});
