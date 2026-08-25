/**
 * The analytics read surface: owner overview + error triage + parent report.
 *
 * Same posture as cloudsave.test.ts — through the real HTTP surface, because
 * what matters is end-to-end: that the admin surface is OFF (404) without a
 * token and closed (401) with a wrong one, that the overview counts what was
 * actually played, and that a parent report is family-scoped so one family can
 * never read another family's child.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const HAS_DB = Boolean(process.env['DATABASE_URL']);
const ADMIN_TOKEN = 'test-admin-token';
process.env['CROW_ADMIN_TOKEN'] = ADMIN_TOKEN;

describe('analytics', { skip: HAS_DB ? false : 'DATABASE_URL not set' }, () => {
    let app: Awaited<ReturnType<typeof import('../src/app.ts').buildApp>>;
    let pool: typeof import('../src/db.ts').pool;

    async function enrollFamily(email: string): Promise<string> {
        const { withAuthTables } = await import('../src/lib/familyDb.ts');
        const { hashToken, newToken } = await import('../src/lib/tokens.ts');
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
        const cookie = consumed.cookies.find(c => c.name === 'crow_device');
        assert.ok(cookie, 'consume must set the device cookie');
        return `crow_device=${cookie.value}`;
    }

    async function createChild(cookie: string, displayName: string): Promise<string> {
        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/family/children',
            headers: { cookie },
            payload: { displayName },
        });
        assert.ok([200, 201].includes(response.statusCode), `child create failed: ${response.body}`);
        return response.json().remoteChildId;
    }

    before(async () => {
        const { buildApp } = await import('../src/app.ts');
        ({ pool } = await import('../src/db.ts'));
        app = await buildApp();
    });

    after(async () => {
        await app?.close();
        await pool?.end();
    });

    it('admin surface answers 401 with a wrong token and 200 with the right one', async () => {
        const wrong = await app.inject({
            method: 'GET',
            url: '/api/v1/admin/overview',
            headers: { authorization: 'Bearer nope' },
        });
        assert.equal(wrong.statusCode, 401);

        const none = await app.inject({ method: 'GET', url: '/api/v1/admin/overview' });
        assert.equal(none.statusCode, 401);

        const right = await app.inject({
            method: 'GET',
            url: '/api/v1/admin/overview',
            headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        });
        assert.equal(right.statusCode, 200, right.body);
        const overview = right.json();
        assert.ok(overview.totals, 'overview carries totals');
        assert.ok(overview.retention.d1.cohort >= overview.retention.d1.returned, 'retention is n-of-cohort');
        assert.equal(overview.sessions.derivedFromAttempts, true, 'session derivation is labeled');

        const page = await app.inject({ method: 'GET', url: '/admin' });
        assert.equal(page.statusCode, 200);
        assert.match(page.headers['content-type'] ?? '', /text\/html/);
    });

    it('error groups are listable and triageable', async () => {
        const posted = await app.inject({
            method: 'POST',
            url: '/api/v1/errors',
            payload: { events: [{ message: 'analytics test boom at res://x.gd:1', kind: 'test_kind' }] },
        });
        assert.ok([200, 202].includes(posted.statusCode), posted.body);

        const list = await app.inject({
            method: 'GET',
            url: '/api/v1/admin/errors?status=all&limit=500',
            headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        });
        assert.equal(list.statusCode, 200, list.body);
        const groups = list.json().groups as Array<{ fingerprint: string; kind: string | null; eventCount: number }>;
        const mine = groups.find(g => g.kind === 'test_kind');
        assert.ok(mine, 'the posted error appears as a group');
        assert.ok(mine.eventCount >= 1);

        const triaged = await app.inject({
            method: 'POST',
            url: `/api/v1/admin/errors/${encodeURIComponent(mine.fingerprint)}/status`,
            headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
            payload: { status: 'resolved' },
        });
        assert.equal(triaged.statusCode, 200, triaged.body);

        const open = await app.inject({
            method: 'GET',
            url: '/api/v1/admin/errors?status=resolved&limit=500',
            headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        });
        assert.ok(
            (open.json().groups as Array<{ fingerprint: string }>).some(g => g.fingerprint === mine.fingerprint),
            'the transition is visible under its new status',
        );

        const missing = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/errors/not-a-real-fingerprint/status',
            headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
            payload: { status: 'ignored' },
        });
        assert.equal(missing.statusCode, 404);
    });

    it('parent report rolls attempts up by domain and kind, family-scoped', async () => {
        const { PROBLEM_CATALOG } = await import('../src/generated/problemCatalog.ts');
        const entries = Object.entries(PROBLEM_CATALOG);
        const equation = entries.find(([, e]) => e.d === 'addition' && e.k === 'equation');
        const worded = entries.find(([, e]) => e.d === 'subtraction' && e.k === 'word_problem');
        assert.ok(equation && worded, 'catalog carries both kinds');

        const cookie = await enrollFamily('analytics-parent@example.test');
        const childId = await createChild(cookie, 'Stella');

        const put = await app.inject({
            method: 'PUT',
            url: `/api/v1/children/${childId}/save`,
            headers: { cookie },
            payload: {
                save: {
                    eloStats: { globalELO: 180, problemsAttempted: 4, domainModifiers: { addition: 12 } },
                    learnerState: {
                        mastery: { problemsAttempted: 4 },
                        curriculumProgress: { addition: { currentStep: 5, highestStep: 6, totalAttempts: 3 } },
                    },
                },
                saveVersion: 1,
                clientTimestamp: 1,
                attempts: [
                    { attemptId: 'attempt-1-a', problemId: equation![0], domain: 'addition', correct: true, firstAttempt: true },
                    { attemptId: 'attempt-2-b', problemId: equation![0], domain: 'addition', correct: false, firstAttempt: true },
                    { attemptId: 'attempt-3-c', problemId: worded![0], domain: 'subtraction', correct: true, firstAttempt: false },
                    { attemptId: 'attempt-4-d', problemId: 'retired_problem_xyz', domain: 'comparison', correct: true, firstAttempt: true },
                ],
            },
        });
        assert.ok([200, 201].includes(put.statusCode), put.body);

        const report = await app.inject({
            method: 'GET',
            url: `/api/v1/family/children/${childId}/report`,
            headers: { cookie },
        });
        assert.equal(report.statusCode, 200, report.body);
        const body = report.json();

        assert.equal(body.displayName, 'Stella');
        assert.equal(body.totalAttempts, 4);
        assert.equal(body.globalElo, 180);

        const addition = body.domains.find((d: { domain: string }) => d.domain === 'addition');
        assert.ok(addition, 'addition domain present');
        assert.equal(addition.attempted, 2);
        assert.equal(addition.correct, 1);
        assert.equal(addition.accuracy, 0.5);
        assert.equal(addition.progress.currentStep, 5);
        assert.equal(addition.progress.highestStep, 6);
        assert.equal(addition.progress.effectiveElo, 192, 'globalELO + domain modifier');
        assert.deepEqual(
            addition.kinds.map((k: { kind: string }) => k.kind),
            ['equation'],
        );

        const subtraction = body.domains.find((d: { domain: string }) => d.domain === 'subtraction');
        assert.equal(subtraction.kinds[0].kind, 'word_problem');
        assert.equal(subtraction.kinds[0].firstTryAccuracy, null, 'no first-try attempts yet');

        const comparison = body.domains.find((d: { domain: string }) => d.domain === 'comparison');
        assert.ok(comparison, 'retired problem falls back to the attempt row domain');
        assert.equal(comparison.kinds[0].kind, 'equation');

        // Family isolation: a different family gets 404, not someone else's kid.
        const stranger = await enrollFamily('analytics-stranger@example.test');
        const denied = await app.inject({
            method: 'GET',
            url: `/api/v1/family/children/${childId}/report`,
            headers: { cookie: stranger },
        });
        assert.equal(denied.statusCode, 404);
    });
});
