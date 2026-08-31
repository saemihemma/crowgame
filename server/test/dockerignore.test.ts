import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * The build context has to contain what the Dockerfiles copy out of it.
 *
 * That sounds too obvious to test until it happens, which it did: `.dockerignore`
 * was written for `deploy/web/Dockerfile`, which needs `output/` and `deploy/`
 * and nothing else, so it denied `*` and allowed those two back. `deploy/api/
 * Dockerfile` was added later and its FIRST instruction is
 * `COPY server/package.json`, which Docker had already stripped out of the
 * context. The build died with
 *
 *     "/server/package.json": not found
 *
 * — a message that names the file it wanted and says nothing about why, while the
 * path is sitting right there in the repo. Nothing local catches it. It surfaces
 * as a red Railway deploy, minutes later, on a Dockerfile that is correct.
 *
 * So this reads the COPY sources out of every Dockerfile and asserts the ignore
 * rules let each one through. It is deliberately about the top-level directory
 * rather than a full reimplementation of Docker's matching: `*` denies
 * everything, an allow rule is what brings a directory back, and that is the
 * whole of the mistake this catches.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const DOCKERFILES = ['deploy/web/Dockerfile', 'deploy/api/Dockerfile'];

/** The context-relative sources of every COPY that reads from the context. */
function copySources(dockerfile: string): string[] {
    const sources: string[] = [];
    for (const line of readFileSync(join(ROOT, dockerfile), 'utf8').split('\n')) {
        const copy = line.trim().match(/^COPY\s+(.*)$/);
        if (!copy?.[1]) continue;
        const parts = copy[1].split(/\s+/).filter(Boolean);
        // `COPY --from=<stage>` reads from an earlier image, not from the
        // context, so the ignore rules have nothing to do with it.
        if (parts.some(part => part.startsWith('--from='))) continue;
        // The last argument is the destination inside the image.
        sources.push(...parts.slice(0, -1).filter(part => !part.startsWith('--')));
    }
    return sources;
}

describe('.dockerignore and the Dockerfiles agree', () => {
    const ignore = readFileSync(join(ROOT, '.dockerignore'), 'utf8')
        .split('\n').map(l => l.trim()).filter(l => l !== '' && !l.startsWith('#'));
    const deniesEverything = ignore.includes('*');
    const allowed = new Set(
        ignore.filter(l => l.startsWith('!')).map(l => l.slice(1).replace(/\/$/, '').split('/')[0]));

    it('is written as deny-everything-then-allow, which is what makes this checkable', () => {
        assert.ok(deniesEverything,
            'this test assumes the `*` deny rule; if the file changes shape, change the test with it');
    });

    for (const dockerfile of DOCKERFILES) {
        it(`leaves every path ${dockerfile} copies inside the context`, () => {
            const missing = copySources(dockerfile)
                .map(source => source.replace(/^\.\//, '').split('/')[0])
                .filter(top => top !== undefined && !allowed.has(top));

            assert.deepEqual([...new Set(missing)], [],
                `${dockerfile} copies from these, but .dockerignore strips them out of the ` +
                'context — the build fails with "not found" on a path that exists. Add !<dir>/');
        });
    }
});
