/**
 * Cloud save and family auth, exercised through the real HTTP surface.
 *
 * These go through app.inject rather than calling the libs directly, because the
 * things most worth proving are end-to-end properties: that a cookie actually
 * authorizes, that one family cannot touch another's child, and that two devices
 * racing on the same save produce exactly one winner and no lost attempts.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const HAS_DB = Boolean(process.env['DATABASE_URL']);

describe('cloud save', { skip: HAS_DB ? false : 'DATABASE_URL not set' }, () => {
    let app: Awaited<ReturnType<typeof import('../src/app.ts').buildApp>>;
    let pool: typeof import('../src/db.ts').pool;

    /** Enroll a brand-new family and return its device cookie. */
    async function enrollFamily(email: string): Promise<string> {
        const { withAuthTables } = await import('../src/lib/familyDb.ts');
        const { hashToken, newToken } = await import('../src/lib/tokens.ts');

        // Mint a link token directly: the mailer's default driver only logs, so
        // there is no inbox to read in a test.
        const token = newToken();
        await withAuthTables(client => client.query(
            `insert into login_codes (purpose, email, code_sha256, expires_at)
             values ('email_link', $1, $2, now() + interval '10 minutes')`,
            [email, hashToken(token)],
        ));

        const consumed = await app.inject({
            method: 'GET',
            url: `/api/v1/auth/consume?token=${encodeURIComponent(token)}`,
        });
        assert.equal(consumed.statusCode, 303, 'consume should redirect after setting the cookie');
        const cookie = consumed.cookies.find(c => c.name === 'crow_device');
        assert.ok(cookie, 'consume must set the device cookie');
        assert.equal(cookie.httpOnly, true, 'the device cookie must be HttpOnly');
        assert.equal(cookie.sameSite?.toLowerCase(), 'lax', 'Strict would break the email-link navigation');
        return `crow_device=${cookie.value}`;
    }

    async function createChild(cookie: string, displayName: string, legacyChildId?: string): Promise<string> {
        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/family/children',
            headers: { cookie },
            payload: legacyChildId ? { displayName, legacyChildId } : { displayName },
        });
        assert.ok([200, 201].includes(response.statusCode), `child create failed: ${response.body}`);
        return response.json().remoteChildId;
    }

    function saveBlob(problemsAttempted: number, coins: number) {
        return {
            coins,
            eloStats: { globalELO: 150 + problemsAttempted, problemsAttempted },
            learnerState: { mastery: { problemsAttempted } },
            timestamp: 1_700_000_000_000 + problemsAttempted,
        };
    }

    async function putSave(cookie: string, childId: string, blob: object, attempts: object[] = []) {
        return app.inject({
            method: 'PUT',
            url: `/api/v1/children/${childId}/save`,
            headers: { cookie },
            payload: { save: blob, saveVersion: 1, clientTimestamp: 1, attempts },
        });
    }

    before(async () => {
        const appModule = await import('../src/app.ts');
        const dbModule = await import('../src/db.ts');
        const { migrate } = await import('../src/migrate.ts');
        pool = dbModule.pool;
        await migrate();
        app = await appModule.buildApp();
        // A clean slate for identity, so display-name uniqueness is predictable.
        await pool.query('delete from families');
    });

    after(async () => {
        await app.close();
        await pool.end();
    });

    it('buckets write limits per device, not per IP', async () => {
        // The magnitude of the limit is env-driven (CROW_SAVE_WRITES_PER_MIN is
        // raised for this suite so arbitration tests are not throttled), but the
        // KEYING is the part that would silently hurt real families: an IP bucket
        // puts a whole household, or a school, into one budget.
        const { rateLimitKeyByDevice } = await import('../src/lib/deviceAuth.ts');
        const asRequest = (cookie?: string, ip = '203.0.113.7') =>
            ({ cookies: cookie ? { crow_device: cookie } : {}, ip }) as never;

        const keyA = rateLimitKeyByDevice(asRequest('token-aaa'));
        const keyB = rateLimitKeyByDevice(asRequest('token-bbb'));
        assert.notEqual(keyA, keyB, 'two devices behind one IP must not share a bucket');
        assert.equal(keyA, rateLimitKeyByDevice(asRequest('token-aaa', '198.51.100.9')),
            'the same device keeps its bucket across networks');
        assert.ok(!keyA.includes('token-aaa'), 'the limiter must not hold a live credential');
        assert.equal(rateLimitKeyByDevice(asRequest(undefined)), 'ip:203.0.113.7',
            'anonymous callers still fall back to an IP bucket');
    });

    it('refuses everything without a device cookie', async () => {
        for (const [method, url] of [
            ['GET', '/api/v1/family/children'],
            ['POST', '/api/v1/family/children'],
            ['GET', '/api/v1/family/export'],
        ] as const) {
            const response = await app.inject({ method, url, payload: { displayName: 'X' } });
            assert.equal(response.statusCode, 401, `${method} ${url} should be 401 without a cookie`);
        }
    });

    it('answers request-link identically for known and unknown addresses', async () => {
        // Anything else makes this endpoint an account-existence oracle.
        const first = await app.inject({
            method: 'POST', url: '/api/v1/auth/request-link',
            payload: { email: 'oracle-probe@example.com' },
        });
        const second = await app.inject({
            method: 'POST', url: '/api/v1/auth/request-link',
            payload: { email: 'definitely-not-registered@example.com' },
        });
        assert.equal(first.statusCode, 202);
        assert.equal(second.statusCode, 202);
        assert.deepEqual(first.json(), second.json());
    });

    it('consumes a magic link exactly once', async () => {
        const { withAuthTables } = await import('../src/lib/familyDb.ts');
        const { hashToken, newToken } = await import('../src/lib/tokens.ts');
        const token = newToken();
        await withAuthTables(client => client.query(
            `insert into login_codes (purpose, email, code_sha256, expires_at)
             values ('email_link', $1, $2, now() + interval '10 minutes')`,
            ['once@example.com', hashToken(token)],
        ));
        const first = await app.inject({ method: 'GET', url: `/api/v1/auth/consume?token=${token}` });
        const second = await app.inject({ method: 'GET', url: `/api/v1/auth/consume?token=${token}` });
        assert.equal(first.statusCode, 303);
        assert.equal(second.statusCode, 400, 'a replayed link must not enroll a second device');
    });

    it('rejects an expired link', async () => {
        const { withAuthTables } = await import('../src/lib/familyDb.ts');
        const { hashToken, newToken } = await import('../src/lib/tokens.ts');
        const token = newToken();
        await withAuthTables(client => client.query(
            `insert into login_codes (purpose, email, code_sha256, expires_at)
             values ('email_link', $1, $2, now() - interval '1 minute')`,
            ['expired@example.com', hashToken(token)],
        ));
        const response = await app.inject({ method: 'GET', url: `/api/v1/auth/consume?token=${token}` });
        assert.equal(response.statusCode, 400);
    });

    it('round-trips a save', async () => {
        const cookie = await enrollFamily('roundtrip@example.com');
        const childId = await createChild(cookie, 'Emma');

        const empty = await app.inject({
            method: 'GET', url: `/api/v1/children/${childId}/save`, headers: { cookie } });
        assert.equal(empty.statusCode, 404, 'no save yet');

        const put = await putSave(cookie, childId, saveBlob(10, 42));
        assert.equal(put.statusCode, 200);
        assert.equal(put.json().outcome, 'accepted');

        const get = await app.inject({
            method: 'GET', url: `/api/v1/children/${childId}/save`, headers: { cookie } });
        assert.equal(get.statusCode, 200);
        assert.equal(get.json().save.coins, 42);
        assert.equal(get.json().problemsAttempted, 10, 'problemsAttempted is read out of eloStats');
    });

    it('lets the device that has seen more answers win, and hands the loser the truth', async () => {
        const cookie = await enrollFamily('arbitrate@example.com');
        const childId = await createChild(cookie, 'Emma');

        // Device A plays to 20 attempts.
        const ahead = await putSave(cookie, childId, saveBlob(20, 100));
        assert.equal(ahead.json().outcome, 'accepted');

        // Device B was offline and only has 12. It must NOT clobber.
        const behind = await putSave(cookie, childId, saveBlob(12, 5));
        assert.equal(behind.statusCode, 200);
        assert.equal(behind.json().outcome, 'rejected');
        assert.equal(behind.json().state.problemsAttempted, 20,
            'the loser is handed the authoritative save so it can adopt it');
        assert.equal(behind.json().state.save.coins, 100);

        // And the stored save is untouched.
        const stored = await app.inject({
            method: 'GET', url: `/api/v1/children/${childId}/save`, headers: { cookie } });
        assert.equal(stored.json().problemsAttempted, 20);
    });

    it('records a losing device\'s attempts even when its save is rejected', async () => {
        // This is the property that makes "last writer wins" acceptable: the
        // cosmetic progress may lose, but the child's actual answers are never
        // silently dropped.
        const cookie = await enrollFamily('attempts-survive@example.com');
        const childId = await createChild(cookie, 'Emma');

        await putSave(cookie, childId, saveBlob(30, 200));
        const rejected = await putSave(cookie, childId, saveBlob(5, 1), [
            { attemptId: 'attempt-111-aaa', problemId: 'p1', domain: 'addition', correct: true },
            { attemptId: 'attempt-222-bbb', problemId: 'p2', domain: 'addition', correct: false },
        ]);
        assert.equal(rejected.json().outcome, 'rejected');
        assert.deepEqual(rejected.json().appliedAttemptIds.sort(),
            ['attempt-111-aaa', 'attempt-222-bbb']);

        const rows = await pool.query(
            'select count(*)::int as n from attempts where child_id = $1', [childId]);
        assert.equal(rows.rows[0].n, 2, 'attempts are durable regardless of save arbitration');
    });

    it('is idempotent on attempt ids', async () => {
        const cookie = await enrollFamily('idempotent@example.com');
        const childId = await createChild(cookie, 'Emma');
        const batch = [{ attemptId: 'attempt-dup-1', problemId: 'p1', correct: true }];

        for (let i = 0; i < 3; i += 1) {
            const response = await app.inject({
                method: 'POST', url: '/api/v1/attempts/sync', headers: { cookie },
                payload: { childId, attempts: batch },
            });
            assert.equal(response.statusCode, 200);
            assert.deepEqual(response.json().appliedAttemptIds, ['attempt-dup-1']);
        }
        const rows = await pool.query(
            'select count(*)::int as n from attempts where child_id = $1', [childId]);
        assert.equal(rows.rows[0].n, 1, 'retrying a batch must not duplicate rows');
    });

    it('maps a device-local childId so a second device does not duplicate the child', async () => {
        const cookie = await enrollFamily('alias@example.com');
        const first = await createChild(cookie, 'Emma', 'child-1717171717-aaa');
        const again = await createChild(cookie, 'Emma', 'child-1717171717-aaa');
        assert.equal(first, again, 'the same local childId must resolve to the same server child');

        // A different device's local id for the same child resolves by name.
        const other = await createChild(cookie, 'Emma', 'child-9999999999-zzz');
        assert.equal(other, first, 'same family + same display name is the same child');

        const children = await app.inject({
            method: 'GET', url: '/api/v1/family/children', headers: { cookie } });
        assert.equal(children.json().children.length, 1);
    });

    it('cannot read or write another family\'s child', async () => {
        const cookieA = await enrollFamily('family-a@example.com');
        const cookieB = await enrollFamily('family-b@example.com');
        const childA = await createChild(cookieA, 'Emma');
        await putSave(cookieA, childA, saveBlob(7, 7));

        const read = await app.inject({
            method: 'GET', url: `/api/v1/children/${childA}/save`, headers: { cookie: cookieB } });
        assert.equal(read.statusCode, 404, 'another family\'s child must be indistinguishable from missing');

        const write = await putSave(cookieB, childA, saveBlob(999, 999));
        assert.equal(write.statusCode, 404);

        // And family A's data is untouched.
        const stored = await app.inject({
            method: 'GET', url: `/api/v1/children/${childA}/save`, headers: { cookie: cookieA } });
        assert.equal(stored.json().problemsAttempted, 7);
    });

    it('pairs a second device without email', async () => {
        const cookieA = await enrollFamily('pairing@example.com');
        const childA = await createChild(cookieA, 'Emma');
        await putSave(cookieA, childA, saveBlob(15, 60));

        const paired = await app.inject({
            method: 'POST', url: '/api/v1/auth/pair', headers: { cookie: cookieA } });
        assert.equal(paired.statusCode, 200);
        const code = paired.json().code;
        assert.match(code, /^[A-Z2-9]{8}$/, 'pairing codes avoid ambiguous glyphs');

        const redeemed = await app.inject({
            method: 'POST', url: '/api/v1/auth/redeem', payload: { code: code.toLowerCase() } });
        assert.equal(redeemed.statusCode, 200, 'codes are case-insensitive for a human typing them');
        const cookieB = `crow_device=${redeemed.cookies.find(c => c.name === 'crow_device')!.value}`;

        // The second device sees the same child and the same save.
        const children = await app.inject({
            method: 'GET', url: '/api/v1/family/children', headers: { cookie: cookieB } });
        assert.equal(children.json().children[0].remoteChildId, childA);
        const save = await app.inject({
            method: 'GET', url: `/api/v1/children/${childA}/save`, headers: { cookie: cookieB } });
        assert.equal(save.json().save.coins, 60, 'this is the multi-device requirement, end to end');

        // A pairing code is single use.
        const replay = await app.inject({
            method: 'POST', url: '/api/v1/auth/redeem', payload: { code } });
        assert.equal(replay.statusCode, 400);
    });

    it('keeps bounded save history and logs conflicts', async () => {
        const cookie = await enrollFamily('history@example.com');
        const childId = await createChild(cookie, 'Emma');
        for (let i = 1; i <= 25; i += 1) await putSave(cookie, childId, saveBlob(i, i));

        const history = await pool.query(
            'select count(*)::int as n from child_save_history where child_id = $1', [childId]);
        assert.ok(history.rows[0].n <= 20, `history should be pruned to 20, got ${history.rows[0].n}`);
        assert.ok(history.rows[0].n >= 19, 'but it should actually be retaining versions');

        await putSave(cookie, childId, saveBlob(3, 3)); // a stale device
        const conflicts = await pool.query(
            `select outcome from sync_conflicts where child_id = $1 order by created_at desc limit 1`,
            [childId]);
        assert.equal(conflicts.rows[0].outcome, 'rejected', 'arbitration is instrumented');
    });

    it('rejects an oversized save instead of storing it', async () => {
        const cookie = await enrollFamily('toobig@example.com');
        const childId = await createChild(cookie, 'Emma');
        const huge = { ...saveBlob(1, 1), padding: 'x'.repeat(600 * 1024) };
        const response = await putSave(cookie, childId, huge);
        assert.equal(response.statusCode, 413);
    });

    it('exports and hard-deletes a family', async () => {
        const cookie = await enrollFamily('erasure@example.com');
        // A family with a row in every table the export promises, so the
        // assertions below are about the endpoint rather than about the fixture:
        // two children (one enrolled with a device-local id, which is what
        // populates child_aliases), two save versions per child so save history is
        // non-empty, and a losing write to produce a sync-conflict row.
        const childId = await createChild(cookie, 'Emma', 'local-child-erasure');
        const secondChildId = await createChild(cookie, 'Ari');
        await putSave(cookie, childId, saveBlob(9, 9), [{ attemptId: 'attempt-exp-1', correct: true }]);
        await putSave(cookie, childId, saveBlob(12, 12), [{ attemptId: 'attempt-exp-2', correct: true }]);
        // Fewer problems attempted than the stored save, so arbitration rejects it
        // and logs the conflict. The attempts still land — that is the documented
        // behaviour and the reason sync_conflicts exists.
        await putSave(cookie, childId, saveBlob(3, 3), []);
        await putSave(cookie, secondChildId, saveBlob(4, 4), []);

        const exported = await app.inject({
            method: 'GET', url: '/api/v1/family/export', headers: { cookie } });
        assert.equal(exported.statusCode, 200);
        const body = exported.json();

        // The RESPONSE, not the handler's source text.
        //
        // role-isolation.test.ts derives the family-scoped tables and checks the
        // handler selects from each — which is a static read, and it passed two
        // mutations that ship the broken promise: deleting `parents: parents.rows`
        // from the response object, and returning `parents: []`. Both leave the
        // query in place, so the source-text gate sees `from parents` and goes
        // green while the file a parent downloads is missing the only row a
        // subject-access request is actually about.
        //
        // PRIVACY.md now tells parents this is checkable. That sentence is only
        // true because of the assertions below.
        // CONTENT for every promised key, not `Array.isArray`.
        //
        // The first version of this asserted shape for all eight and content for
        // four, so `saves: []`, `saveHistory: []`, `syncConflicts: []` and
        // `childAliases: []` each shipped the broken promise past it — and `saves`
        // is the child's actual progress, the single biggest reason after the
        // email that the export exists. PRIVACY.md names all seven of these things
        // one by one and then says "everything" is checkable; that sentence is
        // only as true as the weakest assertion here.
        const promised: Array<[string, number, string]> = [
            ['parents', 1, 'the grown-up email is the only PII in the system'],
            ['children', 2, 'the aliased child and the plain one'],
            ['childAliases', 1, 'a second device enrolling maps its local child id here'],
            ['devices', 1, 'the enrolling device'],
            ['saves', 2, "the child's actual progress"],
            ['attempts', 2, 'the record of what was answered'],
            ['saveHistory', 1, 'the recoverable earlier versions'],
            ['syncConflicts', 1, 'the arbitration log a losing device produced'],
        ];
        for (const [key, atLeast, why] of promised) {
            assert.ok(Array.isArray(body[key]),
                `the export must carry a "${key}" array — PRIVACY.md promises ` +
                'everything held about the family, and names its exclusions separately');
            assert.ok(body[key].length >= atLeast,
                `the export's "${key}" is ${body[key].length} rows, expected at least ` +
                `${atLeast} (${why}). An empty array satisfies a shape check and still ` +
                'breaks the promise made in PRIVACY.md.');
        }
        assert.equal(body.parents[0].email, 'erasure@example.com',
            'the export must carry the real address, not an empty or placeholder row');
        assert.deepEqual(Object.keys(body.notIncluded).sort(),
            ['accounts', 'device_tokens', 'login_codes'],
            'the exclusions are part of the promise; changing them changes what the doc must say');
        // `accounts` is a PARTIAL exclusion and the only one: the usernames are
        // exported in full and it is the PIN hash alone that is withheld, because
        // a downloaded file carrying the hash of a 4-digit PIN is ten thousand
        // guesses away from being the PIN.
        assert.ok(Array.isArray(body.accounts), 'the usernames themselves are still exported');
        for (const row of body.accounts) {
            assert.ok(!('pin_hash' in row), 'and no credential rides along with them');
        }

        const deleted = await app.inject({
            method: 'DELETE', url: '/api/v1/family', headers: { cookie } });
        assert.equal(deleted.statusCode, 200);

        const remaining = await pool.query(
            'select count(*)::int as n from children where id = $1', [childId]);
        assert.equal(remaining.rows[0].n, 0, 'delete must cascade, not soft-hide');

        const afterDelete = await app.inject({
            method: 'GET', url: '/api/v1/family/children', headers: { cookie } });
        assert.equal(afterDelete.statusCode, 401, 'the device credential dies with the family');
    });
});

// Declared here so `before` can assign it without TypeScript complaining about
// use-before-assignment on a module-scoped binding.
