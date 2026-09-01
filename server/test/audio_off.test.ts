/**
 * The bench on a deployed host with no password: OFF, not open.
 *
 * The counterpart to audio_open.test.ts, and the reason `config.audio.open` asks
 * about the environment rather than only about the password. Without this, the
 * developer convenience next door would mean that forgetting CROW_AUDIO_PASSWORD
 * in Railway publishes every sound endpoint to the open web — and it would look
 * exactly like a working page while doing it.
 *
 * Its own file for the same reason: config.ts resolves the environment once.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..', '..');

// A deployed host that was never given a password.
delete process.env['CROW_AUDIO_PASSWORD'];
process.env['CROW_ENV'] = 'production';
process.env['CROW_AUDIO_ROOT'] = resolve(REPO, 'godot', 'assets', 'audio');
process.env['CROW_AUDIO_DATA_ROOT'] = resolve(REPO, 'godot', 'data', 'audio');
process.env['CROW_SOUND_DESIGN_DOC'] = resolve(REPO, 'brand', 'SOUND_DESIGN.md');
process.env['CROW_COOKIE_SECURE'] = 'false';

describe('audio review surface, switched off', () => {
    let app: Awaited<ReturnType<typeof import('../src/app.ts').buildApp>>;

    before(async () => {
        const { buildApp } = await import('../src/app.ts');
        app = await buildApp();
    });

    after(async () => {
        await app.close();
    });

    it('does not open just because the password is empty', async () => {
        const { config } = await import('../src/config.ts');
        assert.equal(config.audio.password, '');
        assert.equal(config.audio.open, false, 'a deployed host is never open');
    });

    it('answers 404, not 401, everywhere', async () => {
        // 404 rather than 401 so that "is there an audio page here" is not a
        // question a stranger can get an answer to.
        for (const url of [
            '/audio',
            '/api/v1/audio/manifest',
            '/api/v1/audio/file/coin_collect',
            '/api/v1/audio/take/coin_collect/1',
        ]) {
            const response = await app.inject({ method: 'GET', url });
            assert.equal(response.statusCode, 404, `${url} must be 404`);
        }
        const login = await app.inject({
            method: 'POST', url: '/api/v1/audio/session', payload: { password: 'guess' },
        });
        assert.equal(login.statusCode, 404, 'and the login is not there to be guessed at');
    });
});
