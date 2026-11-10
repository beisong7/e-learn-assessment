import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../src/database/client.js';
import { createApp } from '../src/app.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { hashSessionToken } from '../src/repositories/sessions.js';

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
const config = { FRONTEND_ORIGIN: origin, NODE_ENV: 'test' as const, SESSION_TTL_HOURS: 24 };
const app = createApp(config, undefined, database);
const prefix = `auth-${randomUUID()}`;
const learnerEmail = `${prefix}-learner@example.test`;
const adminEmail = `${prefix}-admin@example.test`;
const registrationEmail = `${prefix}-new@example.test`;
const password = 'test-only-password123';
const ids: string[] = [];
const cookieHeader = (response: request.Response): string => {
  const raw: unknown = response.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string') throw new Error('No cookie header');
  return first;
};
const cookieOf = (response: request.Response): string => {
  const cookie = cookieHeader(response).split(';')[0];
  if (!cookie) throw new Error('No session cookie set');
  return cookie;
};
const login = (email = learnerEmail) =>
  request(app).post('/api/auth/login').set('Origin', origin).send({ email, password });

beforeAll(async () => {
  const passwordHash = await hashPassword(password);
  for (const [email, role] of [
    [learnerEmail, 'LEARNER'],
    [adminEmail, 'ADMIN'],
  ] as const) {
    const user = await database.user.create({
      data: { name: 'Auth test', email, role, passwordHash },
    });
    ids.push(user.id);
  }
});
afterAll(async () => {
  try {
    await database.user.deleteMany({
      where: { OR: [{ id: { in: ids } }, { email: registrationEmail }] },
    });
  } finally {
    await database.$disconnect();
  }
});

describe('database-backed authentication', () => {
  it('registers a learner, normalizes email, hashes the password, and starts a session', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: ' New Learner ', email: ` ${registrationEmail.toUpperCase()} `, password })
      .expect(201);
    expect(response.body.user).toMatchObject({
      name: 'New Learner',
      email: registrationEmail,
      role: 'learner',
    });
    expect(Object.keys(response.body)).toEqual(['user']);
    expect(response.body.user.passwordHash).toBeUndefined();
    const stored = await database.user.findUniqueOrThrow({ where: { email: registrationEmail } });
    expect(stored.passwordHash).not.toBe(password);
    expect(await verifyPassword(password, stored.passwordHash)).toBe(true);
    await request(app).get('/api/auth/me').set('Cookie', cookieOf(response)).expect(200);
  });
  it('rejects duplicate email registration', async () => {
    await request(app)
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'Duplicate', email: learnerEmail.toUpperCase(), password })
      .expect(409);
  });
  it('rejects a role assignment and invalid registration fields', async () => {
    await request(app)
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'Escalation', email: `${prefix}@example.test`, password, role: 'admin' })
      .expect(400);
    const response = await request(app)
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'A', email: 'bad', password: 'short' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('returns the same credential error for incorrect and unknown credentials', async () => {
    const wrong = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: learnerEmail, password: 'incorrect' })
      .expect(401);
    const unknown = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: `${prefix}-missing@example.test`, password })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });
  it('creates an HttpOnly persistent cookie and stores only a hashed session token', async () => {
    const response = await login().expect(200);
    const header = cookieHeader(response);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Expires=');
    const cookie = cookieOf(response);
    const token = cookie.split('=')[1]!;
    const stored = await database.session.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(token) },
    });
    expect(stored.tokenHash).not.toBe(token);
    const separateApp = createApp(config, undefined, database);
    const restored = await request(separateApp)
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(restored.body.user.email).toBe(learnerEmail);
  });
  it('rotates the session on login and revokes the old cookie', async () => {
    const first = await login().expect(200);
    const second = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookieOf(first))
      .set('Origin', origin)
      .send({ email: learnerEmail, password })
      .expect(200);
    expect(cookieOf(second)).not.toBe(cookieOf(first));
    await request(app).get('/api/auth/me').set('Cookie', cookieOf(first)).expect(401);
    await request(app).get('/api/auth/me').set('Cookie', cookieOf(second)).expect(200);
  });
  it('enforces anonymous and learner restrictions on all admin API paths', async () => {
    await request(app).get('/api/admin/access').expect(401);
    await request(app).get('/api/auth/me').set('Cookie', 'learnova_session=forged').expect(401);
    const learner = await login().expect(200);
    await request(app).get('/api/admin/access').set('Cookie', cookieOf(learner)).expect(403);
    await request(app)
      .delete('/api/admin/courses/anything')
      .set('Cookie', cookieOf(learner))
      .set('Origin', origin)
      .expect(403);
    await request(app).get('/api/learner/access').set('Cookie', cookieOf(learner)).expect(200);
  });
  it('allows administrators and reads current roles from the database', async () => {
    const admin = await login(adminEmail).expect(200);
    const cookie = cookieOf(admin);
    await request(app).get('/api/admin/access').set('Cookie', cookie).expect(200);
    await database.user.update({ where: { email: adminEmail }, data: { role: 'LEARNER' } });
    try {
      await request(app).get('/api/admin/access').set('Cookie', cookie).expect(403);
    } finally {
      await database.user.update({ where: { email: adminEmail }, data: { role: 'ADMIN' } });
    }
  });
  it('rejects expired sessions and removes them', async () => {
    const response = await login().expect(200);
    const cookie = cookieOf(response);
    const tokenHash = hashSessionToken(cookie.split('=')[1]!);
    await database.session.update({
      where: { tokenHash },
      data: { createdAt: new Date(Date.now() - 120000), expiresAt: new Date(Date.now() - 60000) },
    });
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
    expect(await database.session.count({ where: { tokenHash } })).toBe(0);
  });
  it('revokes logout sessions, clears cookies, and permits idempotent logout', async () => {
    const response = await login().expect(200);
    const cookie = cookieOf(response);
    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({})
      .expect(204);
    expect(cookieHeader(logout)).toContain('Expires=Thu, 01 Jan 1970');
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await request(app).post('/api/auth/logout').set('Origin', origin).send({}).expect(204);
  });
  it('blocks missing/cross-site Origin and non-JSON requests', async () => {
    await request(app).post('/api/auth/login').send({ email: learnerEmail, password }).expect(403);
    await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://untrusted.example')
      .send({ email: learnerEmail, password })
      .expect(403);
    await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .type('form')
      .send({ email: learnerEmail, password })
      .expect(415);
  });
  it('uses Secure cookies in production', async () => {
    const production = createApp({ ...config, NODE_ENV: 'production' }, undefined, database);
    const response = await request(production)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: adminEmail, password })
      .expect(200);
    expect(cookieHeader(response)).toContain('Secure');
  });
  it('rate-limits authentication attempts', async () => {
    const isolated = createApp(config, undefined, database);
    // Invalid bodies count too, without running expensive password derivation.
    for (let i = 0; i < 20; i++)
      await request(isolated).post('/api/auth/login').set('Origin', origin).send({}).expect(400);
    const response = await request(isolated)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({})
      .expect(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBeDefined();
  });
});
