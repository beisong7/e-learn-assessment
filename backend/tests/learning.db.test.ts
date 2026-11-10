import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../src/database/client.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== 'test' ||
  process.env.DATABASE_URL !== url ||
  !new URL(url).pathname.endsWith('_test')
)
  throw new Error('Use npm run test:db.');
const db = createDatabaseClient(url);
const origin = 'http://localhost:5173';
const app = createApp({ FRONTEND_ORIGIN: origin }, undefined, db);
const learnerId = randomUUID(),
  adminId = randomUUID(),
  otherId = randomUUID(),
  courseId = randomUUID(),
  emptyId = randomUUID(),
  firstId = randomUUID(),
  secondId = randomUUID();
let learnerCookie = '',
  adminCookie = '';
const put = (lessonId: string, body: object, cookie = learnerCookie) =>
  request(app)
    .put(`/api/lessons/${lessonId}/progress`)
    .set('Cookie', cookie)
    .set('Origin', origin)
    .send(body);
beforeAll(async () => {
  const passwordHash = await hashPassword('test-password123');
  for (const [id, role] of [
    [learnerId, 'LEARNER'],
    [adminId, 'ADMIN'],
    [otherId, 'LEARNER'],
  ] as const)
    await db.user.create({
      data: { id, role, email: `${id}@example.test`, name: `Learning ${role}`, passwordHash },
    });
  for (const id of [courseId, emptyId])
    await db.course.create({
      data: {
        id,
        title: `Learning test ${id}`,
        description: 'Learning fixture',
        category: 'DESIGN',
        thumbnailUrl: 'https://example.test/course.jpg',
        instructorName: 'Guide',
        lessons:
          id === courseId
            ? {
                create: [
                  {
                    id: firstId,
                    title: 'First',
                    videoUrl: 'https://example.test/video.mp4',
                    durationSeconds: 60,
                    order: 1,
                  },
                  {
                    id: secondId,
                    title: 'Second',
                    videoUrl: 'https://example.test/video.mp4',
                    durationSeconds: 30,
                    order: 2,
                  },
                ],
              }
            : undefined,
      },
    });
  await db.enrollment.createMany({
    data: [
      { userId: learnerId, courseId },
      { userId: learnerId, courseId: emptyId },
    ],
  });
  for (const [id, role] of [
    [learnerId, 'learner'],
    [adminId, 'admin'],
  ] as const) {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: `${id}@example.test`, password: 'test-password123' })
      .expect(200);
    const raw: unknown = response.headers['set-cookie'];
    const cookie = String(Array.isArray(raw) ? raw[0] : raw).split(';')[0]!;
    if (role === 'learner') learnerCookie = cookie;
    else adminCookie = cookie;
  }
});
afterAll(async () => {
  try {
    await db.course.deleteMany({ where: { id: { in: [courseId, emptyId] } } });
    await db.user.deleteMany({ where: { id: { in: [learnerId, adminId, otherId] } } });
  } finally {
    await db.$disconnect();
  }
});

describe('persistent progress and simple reports', () => {
  it('requires an owned enrollment, trusted Origin, and valid progress input', async () => {
    const body = { positionSeconds: 10, completed: false, expectedUpdatedAt: null };
    await request(app)
      .put(`/api/lessons/${firstId}/progress`)
      .set('Origin', origin)
      .send(body)
      .expect(401);
    await put(firstId, body, adminCookie).expect(403);
    await put(firstId, { ...body, positionSeconds: -1 }).expect(400);
    await put(firstId, { ...body, userId: otherId }).expect(400);
    await request(app)
      .put(`/api/lessons/${firstId}/progress`)
      .set('Cookie', learnerCookie)
      .set('Origin', 'https://untrusted.test')
      .send(body)
      .expect(403);
  });
  it('persists fractional positions and exposes them only to the current user', async () => {
    await put(firstId, { positionSeconds: 17.5, completed: false, expectedUpdatedAt: null }).expect(
      200,
    );
    const lesson = await request(app)
      .get(`/api/lessons/${firstId}`)
      .set('Cookie', learnerCookie)
      .expect(200);
    expect(lesson.body.progress.positionSeconds).toBe(17.5);
    const reader = createDatabaseClient(url);
    try {
      expect(
        (
          await reader.lessonProgress.findUniqueOrThrow({
            where: { userId_lessonId: { userId: learnerId, lessonId: firstId } },
          })
        ).positionSeconds,
      ).toBe(17.5);
    } finally {
      await reader.$disconnect();
    }
    const admin = await request(app)
      .get('/api/me/dashboard')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(admin.body.progress[firstId]).toBeUndefined();
  });
  it('rejects stale updates, clamps positions, and preserves completion during replay', async () => {
    await put(firstId, { positionSeconds: 5, completed: false, expectedUpdatedAt: null }).expect(
      409,
    );
    const current = await db.lessonProgress.findUniqueOrThrow({
      where: { userId_lessonId: { userId: learnerId, lessonId: firstId } },
    });
    const completed = await put(firstId, {
      positionSeconds: 999,
      completed: true,
      expectedUpdatedAt: current.updatedAt.toISOString(),
    }).expect(200);
    expect(completed.body.progress.positionSeconds).toBe(60);
    expect(completed.body.learning.progressPercent).toBe(50);
    const replayed = await put(firstId, {
      positionSeconds: 2,
      completed: false,
      expectedUpdatedAt: completed.body.progress.updatedAt,
    }).expect(200);
    expect(replayed.body.progress.completed).toBe(true);
    expect(replayed.body.progress.completedAt).toBe(completed.body.progress.completedAt);
  });
  it('returns authoritative learner totals, including empty and completed courses', async () => {
    await put(secondId, { positionSeconds: 30, completed: true, expectedUpdatedAt: null }).expect(
      200,
    );
    const response = await request(app)
      .get('/api/me/dashboard')
      .set('Cookie', learnerCookie)
      .expect(200);
    expect(response.body.stats).toEqual({ enrolled: 2, active: 1, completed: 1, savedSeconds: 32 });
    expect(
      response.body.enrollments.find((item: { courseId: string }) => item.courseId === emptyId)
        .learning.progressPercent,
    ).toBe(0);
  });
  it('restricts admin reports and shows real course and learner activity', async () => {
    await request(app).get('/api/admin/dashboard').expect(401);
    await request(app).get('/api/admin/dashboard').set('Cookie', learnerCookie).expect(403);
    const response = await request(app)
      .get('/api/admin/dashboard?page=1&pageSize=100')
      .set('Cookie', adminCookie)
      .expect(200);
    const course = response.body.courses.find((item: { id: string }) => item.id === courseId);
    expect(course).toMatchObject({ enrollments: 1, averageProgress: 100, completed: 1 });
    expect(
      response.body.learners.find(
        (item: { userId: string; courseId: string }) =>
          item.userId === learnerId && item.courseId === courseId,
      ).progressPercent,
    ).toBe(100);
  });
  it('recalculates progress when current lesson content changes', async () => {
    const extra = await db.lesson.create({
      data: {
        courseId,
        title: 'Added',
        videoUrl: 'https://example.test/video.mp4',
        durationSeconds: 5,
        order: 3,
      },
    });
    const added = await request(app)
      .get('/api/me/dashboard')
      .set('Cookie', learnerCookie)
      .expect(200);
    expect(
      added.body.enrollments.find((item: { courseId: string }) => item.courseId === courseId)
        .learning.progressPercent,
    ).toBe(67);
    await db.lesson.delete({ where: { id: extra.id } });
    const removed = await request(app)
      .get('/api/me/dashboard')
      .set('Cookie', learnerCookie)
      .expect(200);
    expect(
      removed.body.enrollments.find((item: { courseId: string }) => item.courseId === courseId)
        .learning.progressPercent,
    ).toBe(100);
  });
});
