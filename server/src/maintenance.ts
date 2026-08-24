/**
 * Retention and partition maintenance. Runs on a schedule (Railway cron service,
 * same image, CROW_JOB=retention) because pg_cron is not available on managed
 * Railway Postgres by default.
 *
 * Two jobs, in this order:
 *   1. create upcoming daily partitions — must happen BEFORE they are needed,
 *      or inserts fall into the default partition
 *   2. drop partitions past the retention window
 *
 * Retention is DROP TABLE per day partition, not DELETE. A DELETE over a large
 * append-only table leaves dead tuples and hands the real work to autovacuum;
 * dropping a partition is O(1) and returns the disk immediately.
 */
import { config, assertDatabaseConfigured } from './config.js';
import { pool } from './db.js';

export async function runMaintenance(): Promise<{ created: number; dropped: string[]; drained: number }> {
    assertDatabaseConfigured();

    const created = await pool.query<{ error_events_ensure_partitions: number }>(
        `select error_events_ensure_partitions((now() at time zone 'utc')::date, $1)`,
        [config.errors.partitionsAhead],
    );

    const dropped = await pool.query<{ error_events_drop_old_partitions: string }>(
        'select error_events_drop_old_partitions($1)',
        [config.errors.retainDays],
    );

    // The default partition is a safety net for a missing day, not storage. If
    // anything landed there it is past retention too, so clear it — this is the
    // one place a DELETE is correct, because the table should be empty or tiny.
    const drained = await pool.query(
        `delete from error_events_default
         where occurred_at < (now() at time zone 'utc')::date - $1::int`,
        [config.errors.retainDays],
    );

    return {
        created: created.rows[0]?.error_events_ensure_partitions ?? 0,
        dropped: dropped.rows.map(r => r.error_events_drop_old_partitions).filter(Boolean),
        drained: drained.rowCount ?? 0,
    };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    runMaintenance()
        .then(result => {
            console.log(`partitions created: ${result.created}`);
            console.log(`partitions dropped: ${result.dropped.length}${result.dropped.length ? ` (${result.dropped.join(', ')})` : ''}`);
            console.log(`default-partition rows removed: ${result.drained}`);
            return pool.end();
        })
        .catch(error => { console.error('maintenance failed:', error); process.exit(1); });
}
