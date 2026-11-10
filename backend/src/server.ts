import 'dotenv/config';
import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import { createDatabaseClient } from './database/client.js';

async function startServer() {
  const config = parseEnvironment(process.env);
  const database = createDatabaseClient(config.DATABASE_URL);
  try {
    await database.$connect();
  } catch {
    await database.$disconnect();
    throw new Error('Database connection failed. Check PostgreSQL and DATABASE_URL.');
  }

  const app = createApp(
    config,
    async () => {
      await database.$queryRaw`SELECT 1`;
    },
    database,
  );
  const server = app.listen(config.PORT, config.HOST, () => {
    console.info(`Learnova API listening at http://${config.HOST}:${config.PORT}`);
  });

  server.on('error', () => {
    console.error('API could not bind its configured host/port.');
    process.exitCode = 1;
    void database.$disconnect();
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info('Shutting down Learnova API.');
    const deadline = setTimeout(() => {
      console.error('API shutdown timed out.');
      process.exit(1);
    }, 10_000);
    deadline.unref();
    server.close((error) => {
      if (error) process.exitCode = 1;
      void database
        .$disconnect()
        .catch(() => {
          process.exitCode = 1;
        })
        .finally(() => clearTimeout(deadline));
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void startServer().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'API startup failed.');
  process.exitCode = 1;
});
