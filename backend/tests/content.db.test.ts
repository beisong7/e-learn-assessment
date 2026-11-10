import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../src/database/client.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { seedCourses } from '../src/database/seed-courses.js';
import sampleCourses from '../src/database/course-seed.json' with { type: 'json' };

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== 'test' ||
  !new URL(url).pathname.endsWith('_test') ||
  process.env.DATABASE_URL !== url
)
  throw new Error('Run through npm run test:db.');
const database = createDatabaseClient(url);
const origin = 'http://localhost:5173';
const app = createApp({ FRONTEND_ORIGIN: origin }, undefined, database);
const marker = `content-test-${randomUUID()}`;
const adminId = randomUUID(),
  learnerId = randomUUID(),
  strangerId = randomUUID();
const adminEmail = `${adminId}@example.test`,
  learnerEmail = `${learnerId}@example.test`;
let adminCookie = '',
  learnerCookie = '';
const created: string[] = [];
const fields = {
  title: marker,
  description: 'A database-backed course',
  category: 'DESIGN',
  thumbnailUrl: 'https://example.com/course.jpg',
  instructorName: 'Course guide',
  level: 'BEGINNER',
  outcomes: ['Build a skill'],
};
const lesson = (title: string, order: number) => ({
  id: randomUUID(),
  title,
  order,
  durationSeconds: 60,
  videoUrl: 'https://example.com/video.mp4',
});
const cookie = (response: request.Response): string => {
  const raw: unknown = response.headers['set-cookie'];
  return String(Array.isArray(raw) ? raw[0] : raw).split(';')[0]!;
};
const post = (path: string, body: object, token = adminCookie) =>
  request(app).post(path).set('Cookie', token).set('Origin', origin).send(body);
const put = (path: string, body: object) =>
  request(app).put(path).set('Cookie', adminCookie).set('Origin', origin).send(body);
async function create(title = marker, lessons = [lesson('First', 1), lesson('Second', 2)]) {
  const response = await post('/api/admin/courses', { ...fields, title, lessons }).expect(201);
  created.push(response.body.course.id);
  return response.body.course;
}

beforeAll(async () => {
  const passwordHash = await hashPassword('test-password123');
  await database.user.createMany({
    data: [
      { id: adminId, email: adminEmail, name: 'Content admin', passwordHash, role: 'ADMIN' },
      { id: learnerId, email: learnerEmail, name: 'Content learner', passwordHash },
      { id: strangerId, email: `${strangerId}@example.test`, name: 'Other learner', passwordHash },
    ],
  });
  adminCookie = cookie(
    await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: adminEmail, password: 'test-password123' })
      .expect(200),
  );
  learnerCookie = cookie(
    await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: learnerEmail, password: 'test-password123' })
      .expect(200),
  );
});
afterAll(async () => {
  try {
    await database.course.deleteMany({ where: { id: { in: created } } });
    await database.user.deleteMany({ where: { id: { in: [adminId, learnerId, strangerId] } } });
  } finally {
    await database.$disconnect();
  }
});

describe('course content API', () => {
  it('creates atomically and serves ordered public metadata with derived duration, without videos', async () => {
    const course = await create();
    expect(course.version).toBe(1);
    expect(course.durationSeconds).toBe(120);
    expect(course.lessonCount).toBe(2);
    const result = await request(app).get(`/api/courses/${course.id}`).expect(200);
    expect(result.body.course.lessons.map((item: { order: number }) => item.order)).toEqual([1, 2]);
    expect(JSON.stringify(result.body)).not.toContain('videoUrl');
    const list = await request(app)
      .get('/api/courses')
      .query({ q: marker, pageSize: 1 })
      .expect(200);
    expect(list.body.items[0].lessons).toBeUndefined();
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(list.body)).not.toContain('videoUrl');
  });
  it('performs case-insensitive search, category filtering, and deterministic pagination', async () => {
    const suffix = `${marker}-paging`;
    const first = await create(`${suffix}-a`, []);
    const second = await create(`${suffix}-b`, []);
    const page1 = await request(app)
      .get('/api/courses')
      .query({ q: suffix.toUpperCase(), category: 'DESIGN', pageSize: 1, page: 1 })
      .expect(200);
    const page2 = await request(app)
      .get('/api/courses')
      .query({ q: suffix, pageSize: 1, page: 2 })
      .expect(200);
    expect(page1.body.total).toBe(2);
    expect(page1.body.items[0].id).toBe(first.id);
    expect(page2.body.items[0].id).toBe(second.id);
    expect(
      (await request(app).get('/api/courses').query({ q: suffix, category: 'BUSINESS' })).body
        .total,
    ).toBe(0);
    expect(
      (
        await request(app)
          .get('/api/courses')
          .query({ q: 'missing-' + randomUUID() })
      ).body.items,
    ).toEqual([]);
  });
  it('rejects invalid IDs, unsupported categories, URL schemes, durations, and pagination', async () => {
    await request(app).get('/api/courses/not-a-uuid').expect(400);
    await request(app).get(`/api/courses/${randomUUID()}`).expect(404);
    for (const query of [
      { page: 0 },
      { pageSize: 101 },
      { category: 'OTHER' },
      { q: ['one', 'two'] },
    ])
      await request(app).get('/api/courses').query(query).expect(400);
    await post('/api/admin/courses', { ...fields, thumbnailUrl: 'javascript:alert(1)' }).expect(
      400,
    );
    await post('/api/admin/courses', {
      ...fields,
      lessons: [{ ...lesson('bad', 1), durationSeconds: 0 }],
    }).expect(400);
    const same = lesson('duplicate', 1);
    await post('/api/admin/courses', { ...fields, lessons: [same, { ...same, order: 2 }] }).expect(
      400,
    );
  });
  it('blocks anonymous and learner mutations and requires trusted origins', async () => {
    await request(app).get('/api/admin/courses').expect(401);
    await post('/api/admin/courses', fields, learnerCookie).expect(403);
    const course = await create();
    for (const method of ['put', 'patch', 'delete'] as const)
      await request(app)
        [method](`/api/admin/courses/${course.id}`)
        .set('Cookie', learnerCookie)
        .set('Origin', origin)
        .send({ expectedVersion: course.version })
        .expect(403);
    await request(app)
      .delete(`/api/admin/courses/${course.id}`)
      .set('Cookie', adminCookie)
      .set('Origin', 'https://untrusted.example')
      .send({ expectedVersion: course.version })
      .expect(403);
  });
  it('requires persistent enrollment for videos and keeps enrollment responses private to each learner', async () => {
    const course = await create();
    const id = course.lessons[0].id;
    await request(app).get(`/api/lessons/${id}`).expect(401);
    await request(app).get(`/api/lessons/${id}`).set('Cookie', learnerCookie).expect(403);
    await request(app)
      .post(`/api/courses/${course.id}/enroll`)
      .set('Origin', origin)
      .send({})
      .expect(401);
    await post(`/api/courses/${course.id}/enroll`, { userId: strangerId }, learnerCookie).expect(
      400,
    );
    await post(`/api/courses/${course.id}/enroll`, {}, learnerCookie).expect(200);
    await post(`/api/courses/${course.id}/enroll`, {}, learnerCookie).expect(200);
    expect(
      await database.enrollment.count({ where: { userId: learnerId, courseId: course.id } }),
    ).toBe(1);
    expect(
      (await request(app).get(`/api/lessons/${id}`).set('Cookie', learnerCookie).expect(200)).body
        .lesson.videoUrl,
    ).toBe('https://example.com/video.mp4');
    const own = await request(app)
      .get('/api/me/enrollments')
      .set('Cookie', learnerCookie)
      .expect(200);
    expect(
      own.body.enrollments.some((entry: { courseId: string }) => entry.courseId === course.id),
    ).toBe(true);
    expect(JSON.stringify(own.body)).not.toContain('videoUrl');
    await request(app).get(`/api/lessons/${id}`).set('Cookie', adminCookie).expect(200);
    const fresh = createDatabaseClient(url);
    try {
      expect(
        await fresh.enrollment.count({ where: { userId: learnerId, courseId: course.id } }),
      ).toBe(1);
    } finally {
      await fresh.$disconnect();
    }
  });
  it('atomically replaces content, preserving retained lesson IDs/progress and removing deleted progress', async () => {
    const course = await create();
    await database.enrollment.create({ data: { userId: learnerId, courseId: course.id } });
    for (const item of course.lessons)
      await database.lessonProgress.create({
        data: { userId: learnerId, courseId: course.id, lessonId: item.id, positionSeconds: 10 },
      });
    const retained = { ...course.lessons[1], title: 'Retained and moved', order: 1 };
    delete retained.courseId;
    delete retained.createdAt;
    delete retained.updatedAt;
    const replacement = lesson('Replacement', 2);
    const response = await put(`/api/admin/courses/${course.id}`, {
      ...fields,
      title: `${marker}-edited`,
      expectedVersion: 1,
      lessons: [retained, replacement],
    }).expect(200);
    expect(response.body.course.version).toBe(2);
    expect(response.body.course.lessons[0].id).toBe(retained.id);
    expect(
      await database.lessonProgress.count({ where: { lessonId: retained.id, userId: learnerId } }),
    ).toBe(1);
    expect(await database.lessonProgress.count({ where: { lessonId: course.lessons[0].id } })).toBe(
      0,
    );
    const fresh = createDatabaseClient(url);
    try {
      expect((await fresh.course.findUniqueOrThrow({ where: { id: course.id } })).title).toBe(
        `${marker}-edited`,
      );
    } finally {
      await fresh.$disconnect();
    }
  });
  it('rolls back invalid foreign lesson adoption and preserves all prior content', async () => {
    const first = await create();
    const second = await create();
    const foreign = {
      id: second.lessons[0].id,
      title: 'Foreign',
      videoUrl: 'https://example.com/video.mp4',
      durationSeconds: 5,
      order: 1,
    };
    await put(`/api/admin/courses/${first.id}`, {
      ...fields,
      title: 'Should not persist',
      expectedVersion: 1,
      lessons: [foreign],
    }).expect(400);
    const saved = await database.course.findUniqueOrThrow({
      where: { id: first.id },
      include: { lessons: true },
    });
    expect(saved.title).toBe(marker);
    expect(saved.version).toBe(1);
    expect(saved.lessons.length).toBe(2);
  });
  it('supports individual lesson create/edit/reorder/delete with contiguous unique order', async () => {
    const course = await create();
    const addition = await post(`/api/admin/courses/${course.id}/lessons`, {
      title: 'Inserted',
      videoUrl: 'https://example.com/new.mp4',
      durationSeconds: 30,
      order: 1,
      expectedVersion: 1,
    }).expect(201);
    const addedId = addition.body.course.lessons[0].id;
    const edited = await request(app)
      .patch(`/api/admin/lessons/${addedId}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ title: 'Edited', expectedVersion: 2 })
      .expect(200);
    const order = edited.body.course.lessons.map((entry: { id: string }) => entry.id).reverse();
    const reordered = await put(`/api/admin/courses/${course.id}/lesson-order`, {
      lessonIds: order,
      expectedVersion: 3,
    }).expect(200);
    expect(reordered.body.course.lessons.map((entry: { id: string }) => entry.id)).toEqual(order);
    const deleted = await request(app)
      .delete(`/api/admin/lessons/${addedId}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ expectedVersion: 4 })
      .expect(200);
    expect(deleted.body.course.lessons.map((entry: { order: number }) => entry.order)).toEqual([
      1, 2,
    ]);
    await put(`/api/admin/courses/${course.id}/lesson-order`, {
      lessonIds: [order[0], order[0]],
      expectedVersion: 5,
    }).expect(400);
  });
  it('rejects stale saves and allows only one of two concurrent edits at the same version', async () => {
    const course = await create();
    const results = await Promise.all(
      ['one', 'two'].map((title) =>
        request(app)
          .patch(`/api/admin/courses/${course.id}`)
          .set('Cookie', adminCookie)
          .set('Origin', origin)
          .send({ title, expectedVersion: 1 }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    await request(app)
      .delete(`/api/admin/courses/${course.id}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ expectedVersion: 1 })
      .expect(409);
  });
  it('deletes course content/enrollments/progress with the course but keeps users', async () => {
    const course = await create();
    await database.enrollment.create({ data: { userId: learnerId, courseId: course.id } });
    await database.lessonProgress.create({
      data: { userId: learnerId, lessonId: course.lessons[0].id, courseId: course.id },
    });
    await request(app)
      .delete(`/api/admin/courses/${course.id}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ expectedVersion: 1 })
      .expect(204);
    await request(app).get(`/api/courses/${course.id}`).expect(404);
    expect(await database.lesson.count({ where: { courseId: course.id } })).toBe(0);
    expect(await database.enrollment.count({ where: { courseId: course.id } })).toBe(0);
    expect(await database.lessonProgress.count({ where: { courseId: course.id } })).toBe(0);
    expect(await database.user.count({ where: { id: learnerId } })).toBe(1);
  });
  it('seeds repeatably without overwriting admin edits or recreating removed lessons in existing courses', async () => {
    const sample = structuredClone(sampleCourses[0]!);
    sample.id = randomUUID();
    sample.title = `${marker}-seed`;
    sample.lessons = sample.lessons.map((item) => ({ ...item, id: randomUUID() }));
    created.push(sample.id);
    await seedCourses(database, [sample]);
    await database.course.update({
      where: { id: sample.id },
      data: { title: `${marker}-admin-edit` },
    });
    await database.lesson.delete({ where: { id: sample.lessons[0]!.id } });
    await seedCourses(database, [sample]);
    await seedCourses(database, [sample]);
    expect((await database.course.findUniqueOrThrow({ where: { id: sample.id } })).title).toBe(
      `${marker}-admin-edit`,
    );
    expect(await database.lesson.count({ where: { courseId: sample.id } })).toBe(
      sample.lessons.length - 1,
    );
  });
});
