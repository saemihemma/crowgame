import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { pool } from '../db.js';
import { requireAdmin } from '../lib/adminAuth.js';

/**
 * The owner's read surface: business KPIs and the deduplicated error feed.
 *
 * Everything here is read-only aggregation except the error-status transition,
 * which is the owner's triage verb (open -> acknowledged/resolved/ignored).
 * Queries run as the pool role on purpose — this surface aggregates across
 * families, which is exactly what RLS exists to prevent for family callers.
 *
 * Honesty rules baked into the shapes:
 *  - retention returns numerators AND denominators; with one family playing, a
 *    percentage without its cohort size is a lie.
 *  - sessions are derived from attempt timestamps split on a gap
 *    (config.admin.sessionGapMinutes), so play that never touched an owl is
 *    invisible. The field is named derivedFromAttempts to keep that visible.
 *  - all times use received_at (our clock), never the tablet's.
 */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
    const auth = { preHandler: requireAdmin };

    app.get('/api/v1/admin/overview', auth, async (_request, reply) => {
        const days = config.admin.overviewDays;
        const gap = config.admin.sessionGapMinutes;

        const [daily, newChildren, errorsDaily, totals, retention, sessions] = await Promise.all([
            pool.query<{ day: string; active_children: string; attempts: string; first_try_accuracy: string | null }>(
                `select to_char(received_at::date, 'YYYY-MM-DD') as day,
                        count(distinct child_id)::text as active_children,
                        count(*)::text as attempts,
                        avg(case when first_attempt and correct then 1.0 else 0.0 end)::text as first_try_accuracy
                   from attempts
                  where received_at >= now() - make_interval(days => $1)
                  group by received_at::date
                  order by received_at::date`,
                [days],
            ),
            pool.query<{ day: string; new_children: string }>(
                `select to_char(created_at::date, 'YYYY-MM-DD') as day,
                        count(*)::text as new_children
                   from children
                  where created_at >= now() - make_interval(days => $1) and deleted_at is null
                  group by created_at::date
                  order by created_at::date`,
                [days],
            ),
            pool.query<{ day: string; events: string }>(
                `select to_char(occurred_at::date, 'YYYY-MM-DD') as day, count(*)::text as events
                   from error_events
                  where occurred_at >= now() - make_interval(days => $1)
                  group by occurred_at::date
                  order by occurred_at::date`,
                [days],
            ),
            pool.query<{ families: string; children: string; attempts: string; open_error_groups: string }>(
                `select (select count(*) from families where deleted_at is null)::text  as families,
                        (select count(*) from children where deleted_at is null)::text  as children,
                        (select count(*) from attempts)::text                           as attempts,
                        (select count(*) from error_groups where status = 'open')::text as open_error_groups`,
            ),
            pool.query<{ d1_cohort: string; d1_returned: string; d7_cohort: string; d7_returned: string }>(
                `with firsts as (
                     select child_id, min(received_at)::date as d0 from attempts group by child_id
                 )
                 select count(*) filter (where d0 <= current_date - 1)::text as d1_cohort,
                        count(*) filter (where d0 <= current_date - 1 and exists (
                            select 1 from attempts a
                             where a.child_id = firsts.child_id
                               and a.received_at::date = firsts.d0 + 1))::text as d1_returned,
                        count(*) filter (where d0 <= current_date - 7)::text as d7_cohort,
                        count(*) filter (where d0 <= current_date - 7 and exists (
                            select 1 from attempts a
                             where a.child_id = firsts.child_id
                               and a.received_at::date between firsts.d0 + 1 and firsts.d0 + 7))::text as d7_returned
                   from firsts`,
            ),
            pool.query<{ day: string; sessions: string; median_minutes: string | null; avg_attempts: string | null }>(
                `with ordered as (
                     select child_id, received_at,
                            case when lag(received_at) over w is null
                                   or received_at - lag(received_at) over w > make_interval(mins => $2)
                                 then 1 else 0 end as is_start
                       from attempts
                      where received_at >= now() - make_interval(days => $1)
                     window w as (partition by child_id order by received_at)
                 ), marked as (
                     select child_id, received_at,
                            sum(is_start) over (partition by child_id order by received_at) as session_no
                       from ordered
                 ), sessions as (
                     select child_id, session_no,
                            min(received_at) as started_at, max(received_at) as ended_at, count(*) as attempts
                       from marked group by child_id, session_no
                 )
                 select to_char(started_at::date, 'YYYY-MM-DD') as day,
                        count(*)::text as sessions,
                        (percentile_cont(0.5) within group (
                            order by extract(epoch from ended_at - started_at) / 60.0))::text as median_minutes,
                        avg(attempts)::text as avg_attempts
                   from sessions
                  group by started_at::date
                  order by started_at::date`,
                [days, gap],
            ),
        ]);

        return reply.send({
            generatedAt: new Date().toISOString(),
            windowDays: days,
            totals: {
                families: Number(totals.rows[0]?.families ?? 0),
                children: Number(totals.rows[0]?.children ?? 0),
                attempts: Number(totals.rows[0]?.attempts ?? 0),
                openErrorGroups: Number(totals.rows[0]?.open_error_groups ?? 0),
            },
            retention: {
                d1: {
                    returned: Number(retention.rows[0]?.d1_returned ?? 0),
                    cohort: Number(retention.rows[0]?.d1_cohort ?? 0),
                },
                d7: {
                    returned: Number(retention.rows[0]?.d7_returned ?? 0),
                    cohort: Number(retention.rows[0]?.d7_cohort ?? 0),
                },
            },
            daily: daily.rows.map(row => ({
                day: row.day,
                activeChildren: Number(row.active_children),
                attempts: Number(row.attempts),
                firstTryAccuracy: row.first_try_accuracy === null ? null : Number(row.first_try_accuracy),
            })),
            newChildren: newChildren.rows.map(row => ({ day: row.day, count: Number(row.new_children) })),
            errorsDaily: errorsDaily.rows.map(row => ({ day: row.day, events: Number(row.events) })),
            sessions: {
                derivedFromAttempts: true,
                gapMinutes: gap,
                daily: sessions.rows.map(row => ({
                    day: row.day,
                    sessions: Number(row.sessions),
                    medianMinutes: row.median_minutes === null ? null : Number(row.median_minutes),
                    avgAttempts: row.avg_attempts === null ? null : Number(row.avg_attempts),
                })),
            },
        });
    });

    app.get(
        '/api/v1/admin/errors',
        {
            ...auth,
            schema: {
                querystring: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        status: { type: 'string', enum: ['open', 'acknowledged', 'resolved', 'ignored', 'all'] },
                        limit: { type: 'integer', minimum: 1, maximum: 500 },
                    },
                },
            },
        },
        async (request: FastifyRequest<{ Querystring: { status?: string; limit?: number } }>, reply) => {
            const status = request.query.status ?? 'open';
            const limit = request.query.limit ?? 100;
            const rows = await pool.query(
                `select fingerprint, message, kind, level, source, release, status,
                        event_count, first_seen_at, last_seen_at, sample_event
                   from error_groups
                  where ($1 = 'all' or status = $1)
                  order by last_seen_at desc
                  limit $2`,
                [status, limit],
            );
            return reply.send({
                groups: rows.rows.map(row => ({
                    fingerprint: row.fingerprint,
                    message: row.message,
                    kind: row.kind,
                    level: row.level,
                    source: row.source,
                    release: row.release,
                    status: row.status,
                    eventCount: Number(row.event_count),
                    firstSeenAt: row.first_seen_at,
                    lastSeenAt: row.last_seen_at,
                    sampleEvent: row.sample_event,
                })),
            });
        },
    );

    app.post(
        '/api/v1/admin/errors/:fingerprint/status',
        {
            ...auth,
            schema: {
                params: {
                    type: 'object',
                    required: ['fingerprint'],
                    properties: { fingerprint: { type: 'string', minLength: 1, maxLength: 128 } },
                },
                body: {
                    type: 'object',
                    required: ['status'],
                    additionalProperties: false,
                    properties: {
                        status: { type: 'string', enum: ['open', 'acknowledged', 'resolved', 'ignored'] },
                    },
                },
            },
        },
        async (
            request: FastifyRequest<{ Params: { fingerprint: string }; Body: { status: string } }>,
            reply,
        ) => {
            const result = await pool.query(
                `update error_groups set status = $2 where fingerprint = $1 returning fingerprint`,
                [request.params.fingerprint, request.body.status],
            );
            if (result.rowCount === 0) {
                return reply.code(404).send({ error: 'unknown fingerprint' });
            }
            return reply.send({ fingerprint: request.params.fingerprint, status: request.body.status });
        },
    );
}
