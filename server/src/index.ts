import { buildApp } from './app.js';
import { config, assertDatabaseConfigured } from './config.js';
import { pool } from './db.js';

async function main(): Promise<void> {
    assertDatabaseConfigured();
    const app = await buildApp();

    // host defaults to '::' — Railway private networking is IPv6, and binding
    // 0.0.0.0 is the classic way to ship a service that looks healthy and is
    // unreachable from the web service in front of it.
    await app.listen({ host: config.host, port: config.port });

    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.once(signal, () => {
            app.log.info(`${signal} received, draining`);
            void app.close().then(() => pool.end()).then(() => process.exit(0));
        });
    }
}

main().catch(error => {
    console.error('failed to start:', error);
    process.exit(1);
});
