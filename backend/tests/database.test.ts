import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../src/database/client.js';

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== 'test' ||
  !new URL(url).pathname.endsWith('_test') ||
  process.env.DATABASE_URL !== url
) {
  throw new Error('Run database tests using npm run test:db against a dedicated _test database.');
}
const database = createDatabaseClient(url);
const userId = randomUUID();
const otherUserId = randomUUID();
const courseId = randomUUID();
const otherCourseId = randomUUID();
const lessonId = randomUUID();
const courseInput = {
  title: 'Database fixture',
  description: 'Isolated test fixture',
  category: 'DESIGN' as const,
  thumbnailUrl: 'https://example.com/course.jpg',
  instructorName: 'Test guide',
};
const lessonInput = {
  title: 'Test lesson',
  videoUrl: 'https://example.com/lesson.mp4',
  durationSeconds: 120,
  order: 1,
};

beforeAll(async () => {
  await database.$connect();
  await database.user.createMany({
    data: [userId, otherUserId].map((id) => ({
      id,
      name: 'Test learner',
      email: `${id}@example.com`,
      passwordHash: 'test-only-placeholder-not-a-login',
    })),
  });
  await database.course.createMany({
    data: [
      { ...courseInput, id: courseId },
      { ...courseInput, id: otherCourseId },
    ],
  });
  await database.lesson.create({ data: { ...lessonInput, id: lessonId, courseId } });
  await database.enrollment.create({ data: { userId, courseId } });
  await database.lessonProgress.create({
    data: { userId, lessonId, courseId, positionSeconds: 42.5 },
  });
});

afterAll(async () => {
  try {
    await database.course.deleteMany({ where: { id: { in: [courseId, otherCourseId] } } });
    await database.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  } finally {
    await database.$disconnect();
  }
});

describe('migrated PostgreSQL schema', () => {
  it('persists enrollments and fractional resume positions across connections', async () => {
    const reader = createDatabaseClient(url);
    try {
      const progress = await reader.lessonProgress.findUniqueOrThrow({
        where: { userId_lessonId: { userId, lessonId } },
        include: { enrollment: true },
      });
      expect(progress.positionSeconds).toBe(42.5);
      expect(progress.enrollment.courseId).toBe(courseId);
    } finally {
      await reader.$disconnect();
    }
  });

  it('defaults new users to learners and rejects duplicate normalized emails', async () => {
    expect((await database.user.findUniqueOrThrow({ where: { id: userId } })).role).toBe('LEARNER');
    await expect(
      database.user.create({
        data: { name: 'Duplicate', email: `${userId}@example.com`, passwordHash: 'test-only' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      database.user.update({ where: { id: userId }, data: { email: 'UPPER@example.com' } }),
    ).rejects.toThrow();
  });

  it('rejects roles outside the database enum', async () => {
    await expect(
      database.$executeRaw`UPDATE users SET role = 'OWNER' WHERE id = ${userId}::uuid`,
    ).rejects.toThrow();
  });

  it('prevents duplicate enrollments', async () => {
    await expect(database.enrollment.create({ data: { userId, courseId } })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('requires a unique positive lesson order and positive duration', async () => {
    await expect(
      database.lesson.create({ data: { ...lessonInput, courseId } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      database.lesson.update({ where: { id: lessonId }, data: { order: 0 } }),
    ).rejects.toThrow();
    await expect(
      database.lesson.update({ where: { id: lessonId }, data: { durationSeconds: 0 } }),
    ).rejects.toThrow();
  });

  it('requires enrollment before saving progress', async () => {
    await expect(
      database.lessonProgress.create({ data: { userId: otherUserId, lessonId, courseId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects progress that pairs a lesson with an enrollment from a different course', async () => {
    await database.enrollment.create({ data: { userId: otherUserId, courseId: otherCourseId } });
    await expect(
      database.lessonProgress.create({
        data: { userId: otherUserId, lessonId, courseId: otherCourseId },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('allows only one progress record per learner and lesson', async () => {
    await expect(
      database.lessonProgress.create({ data: { userId, lessonId, courseId } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it.each(['-1', 'Infinity', 'NaN'])(
    'rejects invalid playback position %s in PostgreSQL',
    async (position) => {
      await expect(
        database.$executeRaw`UPDATE lesson_progress SET position_seconds = ${position}::double precision WHERE user_id = ${userId}::uuid AND lesson_id = ${lessonId}::uuid`,
      ).rejects.toThrow();
    },
  );

  it('requires a completion timestamp and persists completion', async () => {
    const where = { userId_lessonId: { userId, lessonId } };
    await expect(
      database.lessonProgress.update({ where, data: { completed: true } }),
    ).rejects.toThrow();
    const completedAt = new Date();
    await database.lessonProgress.update({ where, data: { completed: true, completedAt } });
    const saved = await database.lessonProgress.findUniqueOrThrow({ where });
    expect(saved.completed).toBe(true);
    expect(saved.completedAt).toEqual(completedAt);
  });

  it('deletes lesson progress with its lesson while retaining enrollment', async () => {
    await database.lesson.delete({ where: { id: lessonId } });
    expect(await database.lessonProgress.count({ where: { lessonId } })).toBe(0);
    expect(await database.enrollment.count({ where: { userId, courseId } })).toBe(1);
  });

  it('deletes course lessons, enrollments, and progress without deleting users', async () => {
    const lesson = await database.lesson.create({ data: { ...lessonInput, courseId } });
    await database.lessonProgress.create({ data: { userId, courseId, lessonId: lesson.id } });
    await database.course.delete({ where: { id: courseId } });
    expect(await database.lesson.count({ where: { courseId } })).toBe(0);
    expect(await database.enrollment.count({ where: { courseId } })).toBe(0);
    expect(await database.lessonProgress.count({ where: { courseId } })).toBe(0);
    expect(await database.user.count({ where: { id: userId } })).toBe(1);
  });
});
