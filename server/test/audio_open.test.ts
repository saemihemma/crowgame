/**
 * The bench with no password at all, which is the developer default.
 *
 * ITS OWN FILE ON PURPOSE. config.ts freezes the environment at import, so the
 * three states of the gate — open, closed, off — cannot be proved from one
 * module. `node --test` gives each file its own process, which is the reload
 * the sibling suites could not get, so each state gets a file and asserts
 * BEHAVIOUR rather than the shape of the source that implements it.
 *
 * This is the state a developer is in while choosing between takes: no
 * CROW_AUDIO_PASSWORD, no CROW_ENV, a working copy full of generated audio.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..', '..');

// No password, and no word on where this is running: a developer's machine.
delete process.env['CROW_AUDIO_PASSWORD'];
delete process.env['CROW_ENV'];
process.env['CROW_AUDIO_ROOT'] = resolve(REPO, 'godot', 'assets', 'audio');
process.env['CROW_AUDIO_DATA_ROOT'] = resolve(REPO, 'godot', 'data', 'audio');
process.env['CROW_SOUND_DESIGN_DOC'] = resolve(REPO, 'brand', 'SOUND_DESIGN.md');
process.env['CROW_COOKIE_SECURE'] = 'false';

describe('audio review surface, open', () => {
    let app: Awaited<ReturnType<typeof import('../src/app.ts').buildApp>>;

    before(async () => {
        const { buildApp } = await import('../src/app.ts');
        app = await buildApp();
    });

    after(async () => {
        await app.close();
    });

    it('knows it is open', async () => {
        const { config } = await import('../src/config.ts');
        assert.equal(config.audio.password, '', 'no password is configured');
        assert.equal(config.audio.open, true, 'and this machine has not been told it is deployed');
    });

    it('serves the page with no password', async () => {
        const response = await app.inject({ method: 'GET', url: '/audio' });
        assert.equal(response.statusCode, 200);
        assert.match(response.headers['content-type'] as string, /text\/html/);
    });

    it('serves the manifest with no cookie', async () => {
        // The page draws its gate only on a 401. A 200 here is the whole feature:
        // it never asks.
        const response = await app.inject({ method: 'GET', url: '/api/v1/audio/manifest' });
        assert.equal(response.statusCode, 200, 'no gate, so no 401');
        const body = response.json() as { sounds?: unknown[] };
        assert.ok(Array.isArray(body.sounds) && body.sounds.length > 0, 'and it is the real library');
    });

    it('serves a sample with no cookie', async () => {
        const response = await app.inject({ method: 'GET', url: '/api/v1/audio/file/coin_collect' });
        assert.equal(response.statusCode, 200);
        assert.ok(response.rawPayload.length > 0, 'a sample is bytes, not a redirect to a login');
    });

    it('does not contradict itself at the login endpoint', async () => {
        // Nothing to log into, but 404-ing here while /audio serves would send
        // whoever hit it looking for a bug that is not there.
        const response = await app.inject({
            method: 'POST', url: '/api/v1/audio/session', payload: { password: 'anything' },
        });
        assert.equal(response.statusCode, 200);
    });
});
