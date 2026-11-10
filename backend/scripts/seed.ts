import 'dotenv/config';
import { parseEnvironment } from '../src/config/env.js';
import { createDatabaseClient } from '../src/database/client.js';
import { seedCourses } from '../src/database/seed-courses.js';
import { seedAccounts } from '../src/database/seed-accounts.js';

async function main() {
  const config = parseEnvironment(process.env);
  if (config.NODE_ENV === 'production')
    throw new Error('Demo account seeding is disabled in production.');
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 8 || password.length > 1024) {
    throw new Error('Set SEED_DEMO_PASSWORD in backend/.env (8–1024 characters).');
  }
  const database = createDatabaseClient(config.DATABASE_URL);
  try {
    const users = await seedAccounts(database, password);
    const courses = await seedCourses(database);
    console.info(`Sample course library ready: ${courses} courses.`);
    for (const user of users) console.info(`Demo account ready: ${user.email} (${user.role})`);
  } finally {
    await database.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Demo seed failed. Check the database, migrations, SEED_DEMO_PASSWORD, and existing account roles.',
  );
  process.exitCode = 1;
});
