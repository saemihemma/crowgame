import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { AUDIO_PAGE } from '../audio/page.js';
import { loadAudioLibrary, resolveSoundFile } from '../lib/audioLibrary.js';
import { clearCookie, issueCookie, requireAudioSession, sameSecret } from '../lib/audioAuth.js';

/**
 * The sound-review surface: /audio plus the three endpoints it calls.
 *
 * Read-only apart from the login. It serves the game's own audio data and
 * samples, which are not secret in any interesting sense — they are inside the
 * shipped `index.pck` — so the password is here to keep an internal tool off the
 * public web rather than to protect the bytes. That distinction is worth writing
 * down, because it is why this does not reuse the admin token: see
 * lib/audioAuth.ts.
 */
export async function registerAudioRoutes(app: FastifyInstance): Promise<void> {
    const gated = { preHandler: requireAudioSession };

    // The page. Public bytes with zero data in them — every fetch it makes is
    // behind the cookie — but still 404 when the feature is off, matching the
    // off-not-open posture the admin surface takes.
    app.get('/audio', async (_request, reply) => {
        if (config.audio.password === '') return reply.code(404).send({ error: 'not found' });
        return reply.type('text/html; charset=utf-8').send(AUDIO_PAGE);
    });

    // Exchange the password for a cookie, once.
    //
    // Rate-limited per IP, because a single shared password with no limiter is a
    // password anybody can grind. The limiter is the only reason a human-chosen
    // password is acceptable here at all.
    app.post('/api/v1/audio/session', {
        config: { rateLimit: { max: config.audio.attemptsPerMinute, timeWindow: '1 minute' } },
        schema: {
            body: {
                type: 'object',
                required: ['password'],
                properties: { password: { type: 'string', maxLength: 512 } },
            },
        },
        bodyLimit: 4 * 1024,
    }, async (request, reply) => {
        if (config.audio.password === '') return reply.code(404).send({ error: 'not found' });
        const { password } = request.body as { password: string };
        if (!sameSecret(password, config.audio.password)) {
            return reply.code(401).send({ error: 'unauthorized' });
        }
        issueCookie(reply);
        return reply.send({ ok: true });
    });

    app.post('/api/v1/audio/logout', async (_request, reply) => {
        clearCookie(reply);
        return reply.send({ ok: true });
    });

    // Everything the page draws: the mix, every sound, and each moment's brief
    // straight out of brand/SOUND_DESIGN.md.
    app.get('/api/v1/audio/manifest', gated, async (_request, reply) => {
        try {
            return reply.send(await loadAudioLibrary());
        } catch (error) {
            // Say WHICH thing is not where it should be. This route fails for
            // exactly one reason in practice — the image was built without the
            // audio tree copied in — and a bare 500 sends whoever hit it into the
            // wrong file.
            app.log.error({ err: error }, 'audio library unavailable');
            return reply.code(503).send({
                error: 'audio library unavailable',
                detail: error instanceof Error ? error.message : String(error),
                hint: 'deploy/api/Dockerfile must COPY godot/assets/audio, godot/data/audio and brand/SOUND_DESIGN.md, or set CROW_AUDIO_ROOT.',
            });
        }
    });

    // One sample. The key is matched against the manifest and the resolved path
    // is proved to be inside the sample tree before anything is opened; see
    // lib/audioLibrary.ts::resolveSoundFile.
    app.get('/api/v1/audio/file/:key', gated, async (request, reply) => {
        const { key } = request.params as { key: string };
        const found = await resolveSoundFile(key);
        if (!found) return reply.code(404).send({ error: 'not found' });
        const { size } = await stat(found.path);
        return reply
            .type(found.contentType)
            .header('content-length', String(size))
            // The page decodes each sample once and keeps it; the browser cache
            // is what makes re-opening the page instant. Short, because the whole
            // point of the tool is that these files change.
            .header('cache-control', 'private, max-age=60')
            .send(createReadStream(found.path));
    });
}
