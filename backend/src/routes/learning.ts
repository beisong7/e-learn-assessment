import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { requireSession, requireTrustedOrigin } from '../middleware/auth.js';
import { HttpError } from '../middleware/http-error.js';
import { idSchema, parseInput } from '../services/content-validation.js';
import { adminDashboard, learnerDashboard, saveLessonProgress } from '../services/learning.js';

const progressSchema = z
  .object({
    positionSeconds: z.number().finite().nonnegative(),
    completed: z.boolean(),
    expectedUpdatedAt: z.string().datetime().nullable(),
  })
  .strict();
const pageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export function learningRouter(database: PrismaClient, origin: string) {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/me/dashboard', requireSession(database), async (_request, response) => {
    response.json(await learnerDashboard(database, response.locals.user!.id));
  });
  router.put(
    '/lessons/:lessonId/progress',
    requireSession(database),
    requireTrustedOrigin(origin),
    async (request, response) => {
      if (!request.is('application/json'))
        throw new HttpError(415, 'JSON_REQUIRED', 'Send requests as application/json.');
      response.json(
        await saveLessonProgress(
          database,
          response.locals.user!.id,
          parseInput(idSchema, request.params.lessonId),
          parseInput(progressSchema, request.body),
        ),
      );
    },
  );
  return router;
}
export function reportingRouter(database: PrismaClient) {
  const router = Router();
  router.get('/dashboard', async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const query = parseInput(pageSchema, request.query);
    response.json(await adminDashboard(database, query.page, query.pageSize));
  });
  return router;
}
