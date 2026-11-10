import 'dotenv/config';
import { createApp } from '../src/app.js';
import { parseEnvironment, databaseUrlSchema } from '../src/config/env.js';
import { createDatabaseClient } from '../src/database/client.js';
import { seedCourses } from '../src/database/seed-courses.js';
import { seedAccounts } from '../src/database/seed-accounts.js';

async function main() {
  const target = databaseUrlSchema.parse(process.env.TEST_DATABASE_URL);
  const development = databaseUrlSchema.parse(process.env.DATABASE_URL);
  const runId = process.env.E2E_RUN_ID;
  if (
    process.env.NODE_ENV === 'production' ||
    !runId ||
    !/^[a-f0-9-]{36}$/.test(runId) ||
    !new URL(target).pathname.endsWith('_test') ||
    new URL(target).pathname === new URL(development).pathname
  )
    throw new Error('Invalid isolated browser test configuration');
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error('Seed password required for browser tests');
  const config = parseEnvironment({ ...process.env, DATABASE_URL: target, NODE_ENV: 'test' });
  const database = createDatabaseClient(target);
  await seedAccounts(database, password);
  await seedCourses(database);
  const app = createApp(
    config,
    async () => {
      await database.$queryRaw`SELECT 1`;
    },
    database,
  );
  const server = app.listen(config.PORT, config.HOST, () =>
    console.info('Isolated browser-test API ready.'),
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(() => {
      void database.course
        .deleteMany({ where: { title: { startsWith: `content-e2e-${runId}-` } } })
        .then(() =>
          database.user.deleteMany({
            where: { email: { startsWith: `auth-e2e-${runId}-`, endsWith: '@example.test' } },
          }),
        )
        .finally(() => database.$disconnect())
        .finally(() => clearTimeout(deadline));
    });
  };
  server.on('error', () => {
    console.error('Browser-test API could not bind.');
    void database.$disconnect();
    process.exitCode = 1;
  });
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
void main().catch(() => {
  console.error(
    'Browser-test API setup failed. Check the migrated test database and seed configuration.',
  );
  process.exitCode = 1;
});
