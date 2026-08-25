import pg from 'pg';
import { config } from './config.js';

/**
 * One pool for the process. Small on purpose: Railway Postgres connection limits
 * are modest, and this service is IO-light — it does a couple of statements per
 * request. A big pool here buys nothing and risks starving the migration job.
 */
export const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: Number(process.env['CROW_DB_POOL_MAX'] ?? 8),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Railway's managed Postgres terminates TLS with its own chain; the
    // connection is inside the private network either way.
    ...(config.databaseUrl.includes('sslmode=disable') ? {} : { ssl: { rejectUnauthorized: false } }),
});

/**
 * Run fn in a transaction AS THE CONNECTING USER, rolling back on any throw.
 *
 * On Railway that user is the superuser, which bypasses row-level security
 * entirely. That is required for exactly one caller — `migrate.ts`, which does
 * DDL and creates the `crow_app` role — and is wrong for every other one.
 *
 * A request handler that reaches for this instead of `withAppRole` silently
 * opts out of both defences the schema provides: the RLS policies become
 * decorative, and the deliberate absence of DELETE on the append-only tables
 * stops applying. `POST /api/v1/errors` did exactly that, unauthenticated, while
 * a comment two files away claimed every path dropped the role — so
 * `test/role-isolation.test.ts` now asserts that no route imports this.
 *
 * Migrations only. Handlers want `withAppRole` or `withFamily`.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('begin');
        const result = await fn(client);
        await client.query('commit');
        return result;
    } catch (error) {
        try { await client.query('rollback'); } catch { /* the connection is already gone */ }
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Run fn in a transaction as the non-superuser `crow_app` role.
 *
 * This is the floor for every request path, family-scoped or not: no DDL, no
 * ownership, and no DELETE on `attempts` or `child_save_history`, so a query bug
 * cannot rewrite the record of what a child did. `SET LOCAL` reverts on commit
 * or rollback, so a pooled connection cannot carry the role into the next
 * request.
 *
 * For family-scoped data use `withFamily`, which adds the `app.family_id`
 * setting the RLS policies compare against. Tables with no family column
 * (`error_events`, `error_groups`) have no policy to satisfy and belong here.
 */
export async function withAppRole<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('begin');
        await client.query('set local role crow_app');
        const result = await fn(client);
        await client.query('commit');
        return result;
    } catch (error) {
        try { await client.query('rollback'); } catch { /* the connection is already gone */ }
        throw error;
    } finally {
        client.release();
    }
}
