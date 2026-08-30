/**
 * Username + PIN accounts.
 *
 * Split in two on purpose. The hashing and the input rules need no database and
 * therefore always run -- they are the part where a mistake is silent, because a
 * PIN that is stored wrong still lets the child who just typed it in. The
 * account lifecycle and the lockout need real rows and are gated the same way
 * every other database suite here is (see coverage-guard.test.ts).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import {
    hashPin, isValidPin, isValidUsername, LOCK_AFTER, normalizeUsername, verifyPin,
} from '../src/lib/pinAuth.ts';

const HAS_DB = Boolean(process.env['DATABASE_URL']);

describe('pin hashing', () => {
    it('round-trips the right pin and rejects every other one', async () => {
        const stored = await hashPin('4271');
        assert.equal(await verifyPin('4271', stored), true);
        assert.equal(await verifyPin('4272', stored), false);
        assert.equal(await verifyPin('1724', stored), false, 'not order-insensitive');
        assert.equal(await verifyPin('', stored), false);
    });

    /**
     * The salt is what stops one precomputed table covering every account in the
     * game. Ten thousand possible PINs is small enough that an unsalted hash IS
     * the plaintext.
     */
    it('salts, so the same pin never stores the same bytes twice', async () => {
        const a = await hashPin('0000');
        const b = await hashPin('0000');
        assert.notEqual(a, b, 'two accounts with PIN 0000 do not share a hash');
        assert.equal(await verifyPin('0000', a), true);
        assert.equal(await verifyPin('0000', b), true);
    });

    it('carries its scheme, so the hash can be migrated later', async () => {
        assert.match(await hashPin('1234'), /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    });

    /** A malformed or truncated row must be a refusal, never a crash or a pass. */
    it('refuses a hash it cannot read', async () => {
        for (const junk of ['', 'scrypt', 'scrypt$', 'md5$aa$bb', 'scrypt$$', 'nonsense']) {
            assert.equal(await verifyPin('1234', junk), false, `refused: ${junk}`);
        }
    });
});

describe('what a username and a pin may be', () => {
    it('takes four digits and nothing else', () => {
        for (const good of ['0000', '1234', '9999']) assert.equal(isValidPin(good), true, good);
        for (const bad of ['123', '12345', 'abcd', '12 4', '', '12.4', '१२३४']) {
            assert.equal(isValidPin(bad), false, bad);
        }
    });

    /** Icelandic names are the first-class case here, not an edge one. */
    it('takes Icelandic letters', () => {
        for (const name of ['Sæmundur', 'Þórdís', 'Jón Páll', 'ólöf', 'Ari_2', 'Bo']) {
            assert.equal(isValidUsername(name), true, name);
        }
    });

    it('refuses names that are too short, too long, or carry punctuation', () => {
        assert.equal(isValidUsername('A'), false, 'one letter');
        assert.equal(isValidUsername('x'.repeat(25)), false, 'over the column limit');
        assert.equal(isValidUsername('drop;table'), false);
        assert.equal(isValidUsername('a\nb'), false, 'no newlines');
        assert.equal(isValidUsername(''), false);
    });

    /**
     * A trailing space typed on a tablet keyboard is invisible on screen and
     * unguessable the next day, so it is trimmed before it can become half of a
     * credential.
     */
    it('trims, so an invisible space cannot lock a child out', () => {
        assert.equal(normalizeUsername('  Sæmi  '), 'Sæmi');
        assert.equal(normalizeUsername('Sæmi'), 'Sæmi');
    });
});

describe('signing in', { skip: HAS_DB ? false : 'DATABASE_URL not set' }, () => {
    let app: Awaited<ReturnType<typeof import('../src/app.ts').buildApp>>;
    let pool: typeof import('../src/db.ts').pool;
    const name = () => `t${Date.now()}${Math.floor(Math.random() * 1e6)}`;

    before(async () => {
        const { buildApp } = await import('../src/app.ts');
        ({ pool } = await import('../src/db.ts'));
        await (await import('../src/migrate.ts')).migrate();
        app = await buildApp();
        await app.ready();
    });
    after(async () => {
        await app.close();
        await pool.end();
    });

    const signup = (username: string, pin: string) =>
        app.inject({ method: 'POST', url: '/api/v1/auth/signup', payload: { username, pin } });
    const signin = (username: string, pin: string) =>
        app.inject({ method: 'POST', url: '/api/v1/auth/signin', payload: { username, pin } });

    it('signing up enrols the device that did it', async () => {
        const res = await signup(name(), '1234');
        assert.equal(res.statusCode, 200);
        assert.ok(res.cookies.some(c => c.name.includes('device') || c.value.length > 20),
            'a device cookie comes back, so the child is already signed in');
    });

    /**
     * THE WHOLE POINT OF THE FEATURE: the same username and PIN, on a machine
     * that has never seen this child, reaches the same family.
     */
    it('the same name and pin reach the same family from a second device', async () => {
        const username = name();
        const first = await signup(username, '4271');
        const second = await signin(username, '4271');
        assert.equal(second.statusCode, 200);
        assert.equal(second.json().childId, first.json().childId,
            'the work computer finds the child, not a new empty one');
    });

    it('will not let two children take one name', async () => {
        const username = name();
        await signup(username, '1111');
        assert.equal((await signup(username, '2222')).statusCode, 409);
    });

    /**
     * One answer for both, because telling them apart hands over a list of every
     * username in the game -- which is half of a 13-bit secret given away.
     */
    it('answers the same for a wrong pin and for no such account', async () => {
        const username = name();
        await signup(username, '1111');
        const wrongPin = await signin(username, '2222');
        const noAccount = await signin(name(), '2222');
        assert.equal(wrongPin.statusCode, 401);
        assert.equal(noAccount.statusCode, 401);
        assert.deepEqual(wrongPin.json(), noAccount.json());
    });

    /**
     * The fence that actually protects the account. The secret is ~13 bits, so
     * what stops a guess is that guessing has to stop.
     */
    it('locks the account after a run of misses, and says so', async () => {
        const username = name();
        await signup(username, '1111');
        let last = await signin(username, '9999');
        for (let i = 1; i < LOCK_AFTER + 1; i += 1) last = await signin(username, '9999');
        assert.equal(last.statusCode, 429, 'stops answering');
        // And the lock holds even against the RIGHT pin: a lock a correct guess
        // can lift is not a lock, it is a delay.
        assert.equal((await signin(username, '1111')).statusCode, 429);
    });

    it('refuses a pin that is not four digits before it ever reaches the database', async () => {
        assert.equal((await signup(name(), '123')).statusCode, 400);
        assert.equal((await signup(name(), 'abcd')).statusCode, 400);
        assert.equal((await signup('x', '1234')).statusCode, 400, 'and a one-letter name');
    });
});
