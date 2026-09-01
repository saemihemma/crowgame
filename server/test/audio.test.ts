/**
 * The /audio sound-review surface.
 *
 * Through the real HTTP surface, and NEEDS NO DATABASE — which is the point
 * worth stating, because every other suite here does. This one reads the Godot
 * tree and nothing else, so it runs on any machine and in CI unconditionally.
 *
 * What it pins is the shape of the gate (off, closed, open) and the one thing a
 * file-serving route must never get wrong: that a key cannot be steered out of
 * the sample tree.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { resolve } from 'node:path';

const PASSWORD = 'test-audio-password';
const REPO = resolve(import.meta.dirname, '..', '..');

// config.ts resolves the environment once, at import time, so this has to be set
// before app.js is pulled in — hence the dynamic imports below.
process.env['CROW_AUDIO_PASSWORD'] = PASSWORD;
process.env['CROW_AUDIO_ROOT'] = resolve(REPO, 'godot', 'assets', 'audio');
process.env['CROW_AUDIO_DATA_ROOT'] = resolve(REPO, 'godot', 'data', 'audio');
process.env['CROW_SOUND_DESIGN_DOC'] = resolve(REPO, 'brand', 'SOUND_DESIGN.md');
// The gate sets a Secure cookie in production; inject() is plain HTTP.
process.env['CROW_COOKIE_SECURE'] = 'false';

describe('audio review surface', () => {
    let app: Awaited<ReturnType<typeof import('../src/app.ts').buildApp>>;

    before(async () => {
        const { buildApp } = await import('../src/app.ts');
        app = await buildApp();
    });

    after(async () => {
        await app.close();
    });

    async function openSession(password = PASSWORD): Promise<string> {
        const response = await app.inject({
            method: 'POST', url: '/api/v1/audio/session', payload: { password },
        });
        assert.equal(response.statusCode, 200, 'the right password opens a session');
        const cookie = response.cookies.find(c => c.name === 'crow_audio');
        assert.ok(cookie, 'a session is a cookie, because <audio src> cannot carry a header');
        return `crow_audio=${cookie.value}`;
    }

    it('serves the page once the password is set', async () => {
        const response = await app.inject({ method: 'GET', url: '/audio' });
        assert.equal(response.statusCode, 200);
        assert.match(response.headers['content-type'] as string, /text\/html/);
        assert.match(response.body, /Hörmann Sound/);
    });

    /**
     * The page ships as a template literal, so a backslash the TEMPLATE consumes
     * is a backslash the browser never sees.
     *
     * That is not hypothetical. `'this sound\\'s volume'` inside the literal
     * emitted `'this sound's volume'`, which is a syntax error, which meant the
     * whole page rendered blank — and the existing test passed, because it only
     * checked that the HTML contained a title. Parsing the script is the cheapest
     * possible guard against an entire class of quoting mistake in a 400-line
     * string, and it needs no browser.
     */
    it('emits JavaScript that actually parses', async () => {
        const { Script } = await import('node:vm');
        const response = await app.inject({ method: 'GET', url: '/audio' });
        const blocks = [...response.body.matchAll(/<script>([\s\S]*?)<\/script>/g)];
        assert.ok(blocks.length > 0, 'the page has a script block');
        for (const [, code] of blocks) {
            assert.ok((code ?? '').length > 500, 'and it is the real one, not a stub');
            // Compiles without running: a syntax error throws here, and nothing
            // in the page executes.
            assert.doesNotThrow(() => new Script(code ?? '', { filename: 'audio-page.js' }),
                'the page script must parse');
        }
    });

    /**
     * The page reads each sound's duration out of the same decode cache it plays
     * from, so the cache key has to be the one it stores under. It was not: takes
     * moved the cache from key to URL and the duration lookup kept the bare key,
     * which made every row report "unreadable" while playing perfectly. Asserting
     * the two helpers agree is the whole of the fix and needs no audio at all.
     */
    it('reads durations from the same cache key it plays from', async () => {
        const response = await app.inject({ method: 'GET', url: '/audio' });
        assert.match(response.body, /buffers\.get\(shippedUrl\(sound\.key\)\)/,
            'the duration lookup uses the URL, like buffer() does');
        assert.doesNotMatch(response.body, /buffers\.get\(sound\.key\)/,
            'and never the bare key');
    });

    it('is closed, not open, without a session', async () => {
        for (const url of ['/api/v1/audio/manifest', '/api/v1/audio/file/coin_collect']) {
            const response = await app.inject({ method: 'GET', url });
            assert.equal(response.statusCode, 401, `${url} needs a session`);
        }
    });

    it('refuses a wrong password', async () => {
        const response = await app.inject({
            method: 'POST', url: '/api/v1/audio/session', payload: { password: 'nope' },
        });
        assert.equal(response.statusCode, 401);
        assert.equal(response.cookies.find(c => c.name === 'crow_audio'), undefined,
            'a failed attempt hands out nothing');
    });

    it('serves every moment with its brief and its mix', async () => {
        const cookie = await openSession();
        const response = await app.inject({
            method: 'GET', url: '/api/v1/audio/manifest', headers: { cookie },
        });
        assert.equal(response.statusCode, 200);
        const library = response.json() as {
            mix: Record<string, unknown>;
            sounds: Array<{ event: string | null; key: string; family: string; kind: string;
                brief: string; firesFrom: string; missing: boolean; mix: Record<string, unknown> }>;
            warnings: string[];
        };

        assert.ok(library.sounds.length >= 40, 'the whole bank is there');
        assert.equal(library.warnings.length, 0,
            `every moment has a brief in brand/SOUND_DESIGN.md: ${library.warnings.join('; ')}`);
        assert.deepEqual(library.sounds.filter(s => s.missing).map(s => s.key), [],
            'every file the manifest names is on disk');

        // The brief is the ONLY column a generator cannot produce, and the only
        // reason a human opens this page. An empty one is the failure that
        // matters, so it is asserted rather than assumed.
        for (const sound of library.sounds) {
            if (!sound.event) continue;
            assert.ok(sound.brief.length > 20,
                `"${sound.event}" has a brief worth reading, got ${JSON.stringify(sound.brief)}`);
            assert.ok(sound.firesFrom.length > 0, `"${sound.event}" says what fires it`);
        }

        // The families are what the page groups by, and they come from the doc's
        // own headings rather than from a list here.
        const families = new Set(library.sounds.map(s => s.family));
        for (const expected of ['BODY', 'WORLD']) {
            assert.ok([...families].some(f => f.toUpperCase().startsWith(expected)),
                `the ${expected} family survived the doc parse; got ${[...families].join(', ')}`);
        }

        // The three moments whose runtime behaviour the page reproduces.
        const coin = library.sounds.find(s => s.key === 'coin_collect');
        assert.ok(Array.isArray(coin?.mix['pitch_ladder']), 'the coin run is data the page can read');
        assert.ok(library.sounds.some(s => s.kind === 'bed'), 'the ambience beds are listed');
        assert.ok(library.sounds.some(s => s.kind === 'loop'),
            'the proximity loops are told apart from one-shots, so the page loops them');

        assert.ok(typeof library.mix['duck_db'] === 'number', 'the mix block reaches the page');
    });

    it('offers the takes waiting for each sound, and serves one', async () => {
        const cookie = await openSession();
        // The takes directory is working material and gitignored, so a test that
        // needed real takes would be a test that only ran on one machine. Point
        // the resolver at a directory this test creates instead.
        const { mkdtemp, writeFile: write } = await import('node:fs/promises');
        const { tmpdir } = await import('node:os');
        const dir = await mkdtemp(resolve(tmpdir(), 'crow-takes-'));
        // A minimal but real WAV, so the route's content type is exercised.
        const wav = Buffer.concat([
            Buffer.from('RIFF'), Buffer.from([36, 0, 0, 0]), Buffer.from('WAVEfmt '),
            Buffer.from([16, 0, 0, 0, 1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0]),
            Buffer.from('data'), Buffer.from([0, 0, 0, 0]),
        ]);
        await write(resolve(dir, 'coin_collect-2.wav'), wav);
        process.env['CROW_AUDIO_TAKES_ROOT'] = dir;

        const listed = await app.inject({
            method: 'GET', url: '/api/v1/audio/manifest', headers: { cookie },
        });
        const coin = (listed.json() as { sounds: Array<{ key: string; takes: number[] }> })
            .sounds.find(s => s.key === 'coin_collect');
        assert.deepEqual(coin?.takes, [2], 'the manifest lists the take that is there');

        const served = await app.inject({
            method: 'GET', url: '/api/v1/audio/take/coin_collect/2', headers: { cookie },
        });
        assert.equal(served.statusCode, 200);
        assert.match(served.headers['content-type'] as string, /audio\/wav/);

        // A take for a key that is not in the manifest is not a file to serve,
        // and neither is a traversal dressed as a take number.
        for (const url of ['/api/v1/audio/take/not_a_sound/2',
                           '/api/v1/audio/take/coin_collect/..%2F..%2Fpackage.json']) {
            const bad = await app.inject({ method: 'GET', url, headers: { cookie } });
            assert.equal(bad.statusCode, 404, url);
        }
        delete process.env['CROW_AUDIO_TAKES_ROOT'];
    });

    it('serves a sample as audio', async () => {
        const cookie = await openSession();
        const response = await app.inject({
            method: 'GET', url: '/api/v1/audio/file/coin_collect', headers: { cookie },
        });
        assert.equal(response.statusCode, 200);
        assert.match(response.headers['content-type'] as string, /audio\/wav/);
        assert.ok(response.rawPayload.length > 1000, 'and it is the actual bytes');
        assert.equal(response.rawPayload.subarray(0, 4).toString('ascii'), 'RIFF');
    });

    it('cannot be steered out of the sample tree', async () => {
        const cookie = await openSession();
        // Both shapes: a traversal attempt, and a well-formed key that is simply
        // not ours. Neither may reach the filesystem, and the route must not
        // distinguish them — a 404 either way.
        for (const key of ['..%2F..%2F..%2Fetc%2Fpasswd', '../../package.json', 'not_a_sound']) {
            const response = await app.inject({
                method: 'GET', url: `/api/v1/audio/file/${key}`, headers: { cookie },
            });
            assert.ok(response.statusCode === 404,
                `"${key}" must 404, got ${response.statusCode}`);
        }
    });
});

/**
 * The off switch and the open door both live in their own files now.
 *
 * This suite used to assert them by reading the source of the guard, because
 * config.ts freezes the environment at import and one module cannot hold two
 * configurations. A second FILE can: `node --test` gives each one its own
 * process. See audio_off.test.ts (deployed, no password: 404) and
 * audio_open.test.ts (developer machine, no password: open), which pin the
 * behaviour instead of the shape of the code that produces it.
 */
