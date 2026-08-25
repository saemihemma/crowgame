import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withFamily } from '../lib/familyDb.js';
import { deviceOf, requireDevice } from '../lib/deviceAuth.js';
import { PROBLEM_CATALOG, type CatalogEntry } from '../generated/problemCatalog.js';

/**
 * The parent report: how is my kid actually doing, per domain and per kind of
 * problem, from every device the family has ever played on.
 *
 * Family-scoped like every other family route: device cookie, then withFamily()
 * so RLS applies — a parent can only ever read their own child. The heavy
 * lifting is one fetch of the child's attempt rows plus the save blob; the
 * rollup happens here in JS because the domain x kind classification lives in
 * the generated problem catalog, not in Postgres.
 */

interface Tally {
    attempted: number;
    correct: number;
    firstTry: number;
    firstTryCorrect: number;
}

function emptyTally(): Tally {
    return { attempted: 0, correct: 0, firstTry: 0, firstTryCorrect: 0 };
}

function finish(tally: Tally): {
    attempted: number; correct: number; accuracy: number | null; firstTryAccuracy: number | null;
} {
    return {
        attempted: tally.attempted,
        correct: tally.correct,
        accuracy: tally.attempted === 0 ? null : tally.correct / tally.attempted,
        firstTryAccuracy: tally.firstTry === 0 ? null : tally.firstTryCorrect / tally.firstTry,
    };
}

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
    app.get(
        '/api/v1/family/children/:childId/report',
        {
            preHandler: requireDevice,
            schema: {
                params: {
                    type: 'object',
                    required: ['childId'],
                    properties: { childId: { type: 'string', format: 'uuid' } },
                },
            },
        },
        async (request: FastifyRequest<{ Params: { childId: string } }>, reply) => {
            const { familyId } = deviceOf(request);
            const childId = request.params.childId;
            const catalog: Record<string, CatalogEntry> = PROBLEM_CATALOG;

            const result = await withFamily(familyId, async client => {
                const child = await client.query<{ display_name: string }>(
                    `select display_name from children
                      where id = $1 and family_id = $2 and deleted_at is null`,
                    [childId, familyId],
                );
                if (child.rowCount === 0) return null;

                const attempts = await client.query<{
                    problem_id: string | null;
                    domain: string | null;
                    correct: boolean | null;
                    first_attempt: boolean | null;
                    received_at: Date;
                }>(
                    `select problem_id, domain, correct, first_attempt, received_at
                       from attempts
                      where child_id = $1 and family_id = $2`,
                    [childId, familyId],
                );

                const save = await client.query<{ save: Record<string, unknown>; updated_at: Date }>(
                    `select save, updated_at from child_saves
                      where child_id = $1 and family_id = $2`,
                    [childId, familyId],
                );

                return {
                    displayName: child.rows[0]!.display_name,
                    attempts: attempts.rows,
                    save: save.rows[0] ?? null,
                };
            });

            if (result === null) {
                return reply.code(404).send({ error: 'unknown child' });
            }

            // domain -> tally, and domain -> kind -> tally
            const domains = new Map<string, Tally>();
            const kinds = new Map<string, Map<string, Tally>>();
            const daily = new Map<string, { attempted: number; correct: number }>();

            for (const row of result.attempts) {
                const entry = row.problem_id !== null ? catalog[row.problem_id] : undefined;
                const domain = entry?.d ?? row.domain ?? 'unknown';
                const kind = entry?.k ?? 'equation';

                const domainTally = domains.get(domain) ?? emptyTally();
                domains.set(domain, domainTally);
                const kindRow = kinds.get(domain) ?? new Map<string, Tally>();
                kinds.set(domain, kindRow);
                const kindTally = kindRow.get(kind) ?? emptyTally();
                kindRow.set(kind, kindTally);

                for (const tally of [domainTally, kindTally]) {
                    tally.attempted += 1;
                    if (row.correct === true) tally.correct += 1;
                    if (row.first_attempt === true) {
                        tally.firstTry += 1;
                        if (row.correct === true) tally.firstTryCorrect += 1;
                    }
                }

                const day = row.received_at.toISOString().slice(0, 10);
                const dayTally = daily.get(day) ?? { attempted: 0, correct: 0 };
                dayTally.attempted += 1;
                if (row.correct === true) dayTally.correct += 1;
                daily.set(day, dayTally);
            }

            // Learning state straight out of the synced save blob.
            const save = result.save?.save ?? null;
            const eloStats = (save?.['eloStats'] ?? null) as
                | { globalELO?: number; domainModifiers?: Record<string, number>; problemsAttempted?: number }
                | null;
            const learner = (save?.['learnerState'] ?? null) as
                | { curriculumProgress?: Record<string, { currentStep?: number; highestStep?: number; totalAttempts?: number }> }
                | null;

            const progress: Record<string, { currentStep: number; highestStep: number; effectiveElo: number | null }> = {};
            const curriculum = learner?.curriculumProgress ?? {};
            for (const [domain, p] of Object.entries(curriculum)) {
                const modifier = eloStats?.domainModifiers?.[domain] ?? 0;
                progress[domain] = {
                    currentStep: p.currentStep ?? 0,
                    highestStep: Math.max(p.highestStep ?? 0, p.currentStep ?? 0),
                    effectiveElo: eloStats?.globalELO === undefined ? null : eloStats.globalELO + modifier,
                };
            }

            return reply.send({
                childId,
                displayName: result.displayName,
                generatedAt: new Date().toISOString(),
                totalAttempts: result.attempts.length,
                globalElo: eloStats?.globalELO ?? null,
                saveUpdatedAt: result.save?.updated_at ?? null,
                domains: [...domains.entries()]
                    .sort((a, b) => b[1].attempted - a[1].attempted)
                    .map(([domain, tally]) => ({
                        domain,
                        ...finish(tally),
                        progress: progress[domain] ?? null,
                        kinds: [...(kinds.get(domain) ?? new Map<string, Tally>()).entries()]
                            .sort((a, b) => b[1].attempted - a[1].attempted)
                            .map(([kind, kindTally]) => ({ kind, ...finish(kindTally) })),
                    })),
                daily: [...daily.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .slice(-28)
                    .map(([day, tally]) => ({ day, ...tally })),
            });
        },
    );
}
