import 'dotenv/config';
import { parseEnvironment } from '../src/config/env.js';
import { createDatabaseClient } from '../src/database/client.js';

async function main() {
  const config = parseEnvironment(process.env);
  const database = createDatabaseClient(config.DATABASE_URL);
  try {
    await database.$connect();
    await database.$queryRaw`SELECT 1`;
    const [users, courses, lessons, enrollments, progress, sessions] = await Promise.all([
      database.user.count(),
      database.course.count(),
      database.lesson.count(),
      database.enrollment.count(),
      database.lessonProgress.count(),
      database.session.count(),
    ]);
    console.info('PostgreSQL connection and LMS schema verified.', {
      users,
      courses,
      lessons,
      enrollments,
      progress,
      sessions,
    });
  } finally {
    await database.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Database check failed. Verify configuration, PostgreSQL availability, and migrations.',
  );
  process.exitCode = 1;
});
