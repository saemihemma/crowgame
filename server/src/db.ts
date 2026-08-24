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

/** Run fn in a transaction, rolling back on any throw. */
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
