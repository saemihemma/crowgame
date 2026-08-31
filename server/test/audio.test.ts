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
 * And the off switch, in its own process-level state.
 *
 * Kept separate because config.ts freezes the environment at import: proving
 * "unset means 404" in the same module as "set means 200" would need the module
 * graph reloaded, which node:test cannot do cleanly. This suite asserts the
 * BRANCH instead — that both routes consult the same emptiness check — which is
 * the part that can actually rot.
 */
describe('audio review surface, switched off', () => {
    it('answers 404 rather than 401 when no password is configured', async () => {
        const { config } = await import('../src/config.ts');
        // The live config has a password (set above), so read the source of the
        // guard rather than the running app: every audio route must gate on the
        // empty password before it gates on the cookie, or "is there an audio
        // page here" becomes answerable by a stranger.
        const { readFileSync } = await import('node:fs');
        const auth = readFileSync(resolve(REPO, 'server', 'src', 'lib', 'audioAuth.ts'), 'utf8');
        const routes = readFileSync(resolve(REPO, 'server', 'src', 'routes', 'audio.ts'), 'utf8');
        assert.match(auth, /password === ''[\s\S]{0,120}404/,
            'requireAudioSession answers 404 before it answers 401');
        assert.equal((routes.match(/password === ''/g) ?? []).length, 2,
            'the page and the login both check it too, since neither runs the preHandler');
        assert.ok(config.audio.password !== undefined, 'the config exposes the switch');
    });
});
