import type { PoolClient } from 'pg';
import { pool } from '../db.js';

/**
 * Every piece of family-scoped data access goes through here.
 *
 * Two statements do the security work:
 *
 *   SET LOCAL ROLE crow_app          -- drop out of the superuser Railway gives
 *                                       us; a superuser bypasses RLS entirely,
 *                                       which would make the policies decorative
 *   SET LOCAL app.family_id = ...    -- the value every policy compares against
 *
 * LOCAL matters: both revert when the transaction commits or rolls back, so a
 * pooled connection cannot carry one request's family into the next.
 *
 * This is belt and braces with the explicit `family_id = $1` predicates in the
 * queries themselves. In a store of children's data, one forgotten WHERE clause
 * should not be able to return another family's rows.
 */
export async function withFamily<T>(
    familyId: string,
    fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('begin');
        await client.query('set local role crow_app');
        // set_config rather than string interpolation: SET LOCAL cannot take a
        // bind parameter, and interpolating a uuid into SQL is a habit worth not
        // having even when the value is already validated.
        await client.query(`select set_config('app.family_id', $1, true)`, [familyId]);
        const result = await fn(client);
        await client.query('commit');
        return result;
    } catch (error) {
        try { await client.query('rollback'); } catch { /* connection already gone */ }
        throw error;
    } finally {
        client.release();
    }
}

/**
 * For the auth tables only (parents, devices, device_tokens, login_codes), which
 * intentionally have no RLS: resolving a token to a family has to happen before
 * a family is known. Still runs as crow_app so a query bug cannot do DDL.
 */
export async function withAuthTables<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('begin');
        await client.query('set local role crow_app');
        const result = await fn(client);
        await client.query('commit');
        return result;
    } catch (error) {
        try { await client.query('rollback'); } catch { /* connection already gone */ }
        throw error;
    } finally {
        client.release();
    }
}
