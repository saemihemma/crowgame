/**
 * Migration runner.
 *
 * Runs as the service's PRE-DEPLOY command, never at app boot — a boot-time
 * migration races every replica that starts at the same time, and on a store of
 * children's progress that is not a race worth having.
 *
 * Plain ordered .sql files, applied once, recorded in schema_migrations. No ORM
 * migration generation: for a hard-to-reverse data store the DDL should be
 * something a human read before it ran.
 *
 * Rules (also stated in deploy/RAILWAY.md, because they constrain rollback):
 *   - forward-only
 *   - expand/contract: add, deploy code, only then remove in a LATER deploy
 *   - never a destructive change in the same deploy as the code that stops
 *     using the thing being dropped
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDatabaseConfigured } from './config.js';
import { pool, withTransaction } from './db.js';

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');

export async function migrate(): Promise<string[]> {
    assertDatabaseConfigured();
    await pool.query(`
        create extension if not exists pgcrypto;
        create table if not exists schema_migrations (
            name text primary key,
            applied_at timestamptz not null default now()
        )`);

    const applied = new Set(
        (await pool.query<{ name: string }>('select name from schema_migrations')).rows.map(r => r.name),
    );
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
    const ran: string[] = [];

    for (const file of files) {
        if (applied.has(file)) continue;
        const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
        // Each migration is one transaction: a half-applied migration is worse
        // than an un-applied one, because the next run starts from an unknown
        // shape.
        await withTransaction(async client => {
            await client.query(sql);
            await client.query('insert into schema_migrations (name) values ($1)', [file]);
        });
        ran.push(file);
        console.log(`applied ${file}`);
    }
    if (ran.length === 0) console.log('no pending migrations');
    return ran;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    migrate()
        .then(() => pool.end())
        .catch(error => { console.error('migration failed:', error); process.exit(1); });
}
