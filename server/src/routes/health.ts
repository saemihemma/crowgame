import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { config } from '../config.js';

/**
 * GET /api/v1/health — liveness plus enough to tell a broken deploy from a
 * broken database. Reports applied migration count so a deploy that shipped code
 * ahead of its migration is visible without opening a psql session.
 */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
    app.get('/api/v1/health', async (_request, reply) => {
        try {
            const migrations = await pool.query<{ count: string }>(
                'select count(*)::text as count from schema_migrations',
            );
            return reply.send({
                ok: true,
                environment: config.environment,
                migrationsApplied: Number(migrations.rows[0]?.count ?? 0),
            });
        } catch (error) {
            app.log.error({ err: error }, 'health check could not reach the database');
            return reply.code(503).send({ ok: false, error: 'database unavailable' });
        }
    });
}
