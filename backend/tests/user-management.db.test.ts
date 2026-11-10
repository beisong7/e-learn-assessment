import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/database/client.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== 'test' ||
  process.env.DATABASE_URL !== url ||
  !new URL(url).pathname.endsWith('_test')
)
  throw new Error('Use npm run test:db.');
const database = createDatabaseClient(url);
const app = createApp({ FRONTEND_ORIGIN: 'http://localhost:5173' }, undefined, database);
const origin = 'http://localhost:5173';
const adminId = randomUUID(),
  learnerId = randomUUID(),
  courseId = randomUUID(),
  lessonId = randomUUID();
const adminEmail = `${adminId}@example.test`,
  learnerEmail = `${learnerId}@example.test`,
  newEmail = `${randomUUID()}@example.test`;
const password = 'test-password123';
let adminCookie = '',
  learnerCookie = '';
function cookie(response: request.Response) {
  const raw: unknown = response.headers['set-cookie'];
  return String(Array.isArray(raw) ? raw[0] : raw).split(';')[0]!;
}
const login = (email: string) =>
  request(app).post('/api/auth/login').set('Origin', origin).send({ email, password });
const patch = (id: string, body: object, token = adminCookie) =>
  request(app)
    .patch(`/api/admin/learners/${id}/status`)
    .set('Cookie', token)
    .set('Origin', origin)
    .send(body);
const create = (body: object, token = adminCookie) =>
  request(app).post('/api/admin/users').set('Cookie', token).set('Origin', origin).send(body);

beforeAll(async () => {
  const passwordHash = await hashPassword(password);
  await database.user.createMany({
    data: [
      { id: adminId, name: 'Management admin', email: adminEmail, role: 'ADMIN', passwordHash },
      { id: learnerId, name: 'Management learner', email: learnerEmail, passwordHash },
    ],
  });
  await database.course.create({
    data: {
      id: courseId,
      title: 'Management fixture',
      description: 'Test course',
      category: 'DESIGN',
      instructorName: 'Guide',
      thumbnailUrl: 'https://example.test/image.jpg',
      lessons: {
        create: {
          id: lessonId,
          title: 'Lesson',
          videoUrl: 'https://example.test/video.mp4',
          durationSeconds: 60,
          order: 1,
        },
      },
    },
  });
  await database.enrollment.create({ data: { userId: learnerId, courseId } });
  await database.lessonProgress.create({
    data: {
      userId: learnerId,
      lessonId,
      courseId,
      positionSeconds: 60,
      completed: true,
      completedAt: new Date(),
    },
  });
  adminCookie = cookie(await login(adminEmail).expect(200));
  learnerCookie = cookie(await login(learnerEmail).expect(200));
});
afterAll(async () => {
  try {
    await database.course.deleteMany({ where: { id: courseId } });
    await database.user.deleteMany({
      where: { OR: [{ id: { in: [adminId, learnerId] } }, { email: newEmail }] },
    });
  } finally {
    await database.$disconnect();
  }
});

describe('admin learner and account management', () => {
  it('restricts all management operations to admins', async () => {
    for (const path of [
      '/api/admin/users',
      '/api/admin/learners',
      `/api/admin/learners/${learnerId}/courses`,
    ]) {
      await request(app).get(path).expect(401);
      await request(app).get(path).set('Cookie', learnerCookie).expect(403);
    }
    await patch(learnerId, { enabled: false }, learnerCookie).expect(403);
    await create({ name: 'Escalation', email: newEmail, password }, learnerCookie).expect(403);
  });
  it('lists/searches safe account information and learner enrollment counts', async () => {
    const learners = await request(app)
      .get('/api/admin/learners')
      .query({ q: learnerEmail.toUpperCase(), pageSize: 1 })
      .set('Cookie', adminCookie)
      .expect(200);
    expect(learners.body.total).toBe(1);
    expect(learners.body.items[0]).toMatchObject({
      id: learnerId,
      isActive: true,
      enrollmentCount: 1,
      role: 'LEARNER',
    });
    expect(JSON.stringify(learners.body)).not.toContain('passwordHash');
    const users = await request(app)
      .get('/api/admin/users')
      .query({ q: adminEmail })
      .set('Cookie', adminCookie)
      .expect(200);
    expect(users.body.items[0].role).toBe('ADMIN');
    await request(app).get('/api/admin/users?pageSize=1000').set('Cookie', adminCookie).expect(400);
  });
  it('shows enrolled courses and server-calculated percentages', async () => {
    const response = await request(app)
      .get(`/api/admin/learners/${learnerId}/courses`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(response.body.courses).toEqual([
      expect.objectContaining({
        id: courseId,
        progressPercent: 100,
        completedLessons: 1,
        totalLessons: 1,
      }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain('videoUrl');
    await request(app)
      .get(`/api/admin/learners/${adminId}/courses`)
      .set('Cookie', adminCookie)
      .expect(404);
  });
  it('disables learners, immediately revokes sessions, and preserves enrollment and progress', async () => {
    const response = await patch(learnerId, { enabled: false }).expect(200);
    expect(response.body.user.isActive).toBe(false);
    expect(await database.session.count({ where: { userId: learnerId } })).toBe(0);
    await request(app).get('/api/auth/me').set('Cookie', learnerCookie).expect(401);
    expect((await login(learnerEmail).expect(403)).body.error.code).toBe('ACCOUNT_DISABLED');
    expect(await database.enrollment.count({ where: { userId: learnerId } })).toBe(1);
    expect(
      await database.lessonProgress.count({ where: { userId: learnerId, completed: true } }),
    ).toBe(1);
    await request(app)
      .get(`/api/admin/learners/${learnerId}/courses`)
      .set('Cookie', adminCookie)
      .expect(200);
  });
  it('re-enables learners without restoring revoked sessions', async () => {
    expect((await patch(learnerId, { enabled: true }).expect(200)).body.user.isActive).toBe(true);
    await request(app).get('/api/auth/me').set('Cookie', learnerCookie).expect(401);
    learnerCookie = cookie(await login(learnerEmail).expect(200));
    await request(app).get('/api/me/dashboard').set('Cookie', learnerCookie).expect(200);
  });
  it('rejects admin status changes, role injection, and untrusted write origins', async () => {
    await patch(adminId, { enabled: false }).expect(404);
    await patch(learnerId, { enabled: false, role: 'ADMIN' }).expect(400);
    await request(app)
      .patch(`/api/admin/learners/${learnerId}/status`)
      .set('Cookie', adminCookie)
      .set('Origin', 'https://untrusted.test')
      .send({ enabled: false })
      .expect(403);
    expect((await database.user.findUniqueOrThrow({ where: { id: adminId } })).isActive).toBe(true);
  });
  it('creates a separate admin with a hashed password and keeps the creator signed in', async () => {
    const response = await create({
      name: 'New administrator',
      email: newEmail.toUpperCase(),
      password,
    }).expect(201);
    expect(response.body.user).toMatchObject({ email: newEmail, role: 'ADMIN', isActive: true });
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
    const stored = await database.user.findUniqueOrThrow({ where: { email: newEmail } });
    expect(await verifyPassword(password, stored.passwordHash)).toBe(true);
    const signedIn = cookie(await login(newEmail).expect(200));
    await request(app).get('/api/admin/users').set('Cookie', signedIn).expect(200);
    const creator = await request(app).get('/api/auth/me').set('Cookie', adminCookie).expect(200);
    expect(creator.body.user.id).toBe(adminId);
  });
  it('rejects duplicate users, invalid input, and changing an existing learner into an admin', async () => {
    await create({ name: 'Existing learner', email: learnerEmail, password }).expect(409);
    await create({ name: 'A', email: 'invalid', password: 'short' }).expect(400);
    await create({ name: 'Role selection', email: newEmail, password, role: 'LEARNER' }).expect(
      400,
    );
    expect((await database.user.findUniqueOrThrow({ where: { id: learnerId } })).role).toBe(
      'LEARNER',
    );
  });
  it('also rejects disabled accounts when a session exists outside the status endpoint', async () => {
    await database.user.update({ where: { id: learnerId }, data: { isActive: false } });
    try {
      await request(app).get('/api/auth/me').set('Cookie', learnerCookie).expect(401);
    } finally {
      await database.user.update({ where: { id: learnerId }, data: { isActive: true } });
    }
  });
});
