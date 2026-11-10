import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import type { PrismaClient } from '@prisma/client';
import { login, register } from '../services/auth.js';
import { revokeSession } from '../repositories/sessions.js';
import {
  cookieOptions,
  readSessionToken,
  requireSession,
  requireTrustedOrigin,
  sessionCookieName,
} from '../middleware/auth.js';
import { HttpError } from '../middleware/http-error.js';

const email = z.string().trim().toLowerCase().email().max(320);
const loginSchema = z.object({ email, password: z.string().min(1).max(1024) }).strict();
const registrationSchema = z
  .object({ email, name: z.string().trim().min(2).max(120), password: z.string().min(8).max(128) })
  .strict();

function parseInput<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) fields[issue.path.join('.') || 'form'] = issue.message;
    throw new HttpError(400, 'VALIDATION_ERROR', 'Please check the form and try again.', fields);
  }
  return result.data;
}

export function createAuthRouter(
  database: PrismaClient,
  config: { FRONTEND_ORIGIN: string; NODE_ENV: string; SESSION_TTL_HOURS: number },
) {
  const router = Router();
  const cookie = cookieOptions(config.NODE_ENV === 'production');
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(requireTrustedOrigin(config.FRONTEND_ORIGIN));
  router.use((request, _response, next) => {
    if (request.method === 'POST' && !request.is('application/json'))
      throw new HttpError(415, 'JSON_REQUIRED', 'Send requests as application/json.');
    next();
  });
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
    },
  });
  router.post('/register', limiter, async (request, response) => {
    const result = await register(
      database,
      parseInput(registrationSchema, request.body),
      config.SESSION_TTL_HOURS,
      readSessionToken(request),
    );
    response.cookie(sessionCookieName, result.token, { ...cookie, expires: result.expiresAt });
    response.status(201).json({ user: result.user });
  });
  router.post('/login', limiter, async (request, response) => {
    const result = await login(
      database,
      parseInput(loginSchema, request.body),
      config.SESSION_TTL_HOURS,
      readSessionToken(request),
    );
    response.cookie(sessionCookieName, result.token, { ...cookie, expires: result.expiresAt });
    response.json({ user: result.user });
  });
  router.get('/me', requireSession(database), (_request, response) => {
    response.json({ user: response.locals.user });
  });
  router.post('/logout', async (request, response) => {
    const token = readSessionToken(request);
    if (token) await revokeSession(database, token);
    response.clearCookie(sessionCookieName, cookie);
    response.status(204).end();
  });
  return router;
}
