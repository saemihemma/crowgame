import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { withAuthTables } from './familyDb.js';

/**
 * Username + PIN accounts.
 *
 * A DELIBERATE REVERSAL of the decision in migration 002, which said there is no
 * pin_hash column because the PIN is a "which kid am I" selector that never
 * leaves the device. The owner's decision (2026-08) is that a child signs in to
 * their own progress from any machine with a username and a PIN and nothing
 * else, for the trial. That makes the PIN a credential. See 007 for the full
 * reasoning, including what 13 bits of secret is and is not worth.
 *
 * The two things this module exists to get right:
 *
 * 1. THE HASH. scrypt from node:crypto, so no new dependency. SHA-256 is
 *    correct for the device tokens in tokens.ts -- 256 CSPRNG bits have no
 *    dictionary to attack -- and would be actively wrong here: a 4-digit PIN has
 *    ten thousand possibilities, and a fast hash means a leaked database is ten
 *    thousand hashes per account away from being plaintext. A per-PIN salt also
 *    stops one rainbow table covering every account in the game.
 *
 * 2. THE FENCE. The secret is small, so the attempt limit is what actually
 *    protects the account, and it is per ACCOUNT rather than per IP: an attacker
 *    who can guess "saemi" has all the IPs they want and only 10000 PINs to try.
 *    LOCK_AFTER misses lock the account for LOCK_MINUTES, and a success clears
 *    the counter.
 */

const scrypt = promisify(scryptCb) as (
    password: string | Buffer, salt: string | Buffer, keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/** Misses before the account stops answering, and for how long. */
export const LOCK_AFTER = 6;
export const LOCK_MINUTES = 15;

/**
 * A PIN is exactly four digits. Checked here as well as in the route schema
 * because this is the function that decides what a stored hash was made from,
 * and "the client will have validated it" is how a five-digit PIN ends up in the
 * database with no way to type it again.
 */
export function isValidPin(pin: string): boolean {
    return /^\d{4}$/.test(pin);
}

/**
 * Usernames are compared case-insensitively (the column is citext) and stored
 * as typed, so a child sees their own capitals back. Trimmed, because a trailing
 * space typed on a tablet keyboard is invisible and unguessable.
 */
export function normalizeUsername(raw: string): string {
    return raw.trim();
}

export function isValidUsername(name: string): boolean {
    return /^[\p{L}\p{N} _-]{2,24}$/u.test(name);
}

/** `scrypt$<salt-hex>$<key-hex>`, so the parameters travel with the hash. */
export async function hashPin(pin: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await scrypt(pin, salt, KEY_LENGTH);
    return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
    const [scheme, saltHex, keyHex] = stored.split('$');
    if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await scrypt(pin, Buffer.from(saltHex, 'hex'), expected.length);
    // Constant time, so a wrong PIN cannot be narrowed down by how long the
    // answer took.
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export interface AccountRow {
    readonly id: string;
    readonly family_id: string;
    readonly child_id: string | null;
    readonly username: string;
    readonly pin_hash: string;
    readonly failed_attempts: number;
    readonly locked_until: Date | null;
}

export async function findAccount(username: string): Promise<AccountRow | null> {
    return withAuthTables(async client => {
        const found = await client.query<AccountRow>(
            `select id, family_id, child_id, username, pin_hash, failed_attempts, locked_until
               from accounts where username = $1`, [username]);
        return found.rows[0] ?? null;
    });
}

/**
 * Create a family, a child and an account in one transaction.
 *
 * One family per account during the trial. Families exist because the schema is
 * built for a parent with several children and a report that spans them, and
 * that shape is not being thrown away for a simpler login -- an account simply
 * brings its own family with it, and two accounts can be moved into one family
 * later without changing anything a client sees.
 */
export async function createAccount(
    username: string, pin: string,
): Promise<{ accountId: string; familyId: string; childId: string } | null> {
    const pinHash = await hashPin(pin);
    return withAuthTables(async client => {
        try {
            await client.query('begin');
            const family = await client.query<{ id: string }>(
                'insert into families default values returning id');
            const familyId = family.rows[0]?.id;
            // `children` carries RLS FORCE with a `family_id = current_family_id()`
            // policy, and withAuthTables deliberately sets no family -- it is for
            // the tables a lookup reads before a family is known. So the insert
            // below has to declare the family it just created, or the policy
            // rejects it. Caught by running the suite against a real Postgres:
            // "new row violates row-level security policy for table children",
            // which is the policy doing exactly its job.
            await client.query(`select set_config('app.family_id', $1, true)`, [familyId]);
            const child = await client.query<{ id: string }>(
                `insert into children (family_id, display_name) values ($1, $2) returning id`,
                [familyId, username.slice(0, 40)]);
            const childId = child.rows[0]?.id;
            const account = await client.query<{ id: string }>(
                `insert into accounts (family_id, child_id, username, pin_hash)
                 values ($1, $2, $3, $4) returning id`,
                [familyId, childId, username, pinHash]);
            const accountId = account.rows[0]?.id;
            // BEFORE the commit, not after. Every insert above carries
            // `returning id`, so a missing row is the database having answered
            // something impossible -- and throwing after a commit would roll
            // back nothing while telling the caller it had failed.
            if (!familyId || !childId || !accountId) throw new Error('account insert returned no id');
            await client.query('commit');
            return { accountId, familyId, childId };
        } catch (error) {
            await client.query('rollback');
            // A unique violation is "that name is taken", which is an ordinary
            // answer and not an error worth logging as one.
            if ((error as { code?: string }).code === '23505') return null;
            throw error;
        }
    });
}

export async function recordFailure(accountId: string): Promise<void> {
    await withAuthTables(client => client.query(
        `update accounts
            set failed_attempts = failed_attempts + 1,
                locked_until = case when failed_attempts + 1 >= $2
                                    then now() + ($3 || ' minutes')::interval
                                    else locked_until end
          where id = $1`,
        [accountId, LOCK_AFTER, String(LOCK_MINUTES)],
    ));
}

export async function recordSuccess(accountId: string): Promise<void> {
    await withAuthTables(client => client.query(
        `update accounts
            set failed_attempts = 0, locked_until = null, last_login_at = now()
          where id = $1`, [accountId]));
}

export function isLocked(account: AccountRow): boolean {
    return account.locked_until !== null && account.locked_until.getTime() > Date.now();
}
