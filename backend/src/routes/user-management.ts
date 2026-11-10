import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { idSchema, parseInput } from '../services/content-validation.js';
import { HttpError } from '../middleware/http-error.js';
import {
  createAdministrator,
  learnerCourses,
  listUsers,
  setLearnerStatus,
} from '../services/user-management.js';

const querySchema = z
  .object({
    q: z.string().trim().max(200).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const statusSchema = z.object({ enabled: z.boolean() }).strict();
const adminSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(320),
    password: z.string().min(8).max(128),
  })
  .strict();

// Mounted behind the existing admin session, role, and Origin middleware.
export function userManagementRouter(database: PrismaClient) {
  const router = Router();
  router.use((request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    if (['POST', 'PATCH'].includes(request.method) && !request.is('application/json'))
      throw new HttpError(415, 'JSON_REQUIRED', 'Send requests as application/json.');
    next();
  });
  router.get('/learners', async (request, response) => {
    response.json(await listUsers(database, parseInput(querySchema, request.query), true));
  });
  router.get('/learners/:learnerId/courses', async (request, response) => {
    response.json(await learnerCourses(database, parseInput(idSchema, request.params.learnerId)));
  });
  router.patch('/learners/:learnerId/status', async (request, response) => {
    const input = parseInput(statusSchema, request.body);
    response.json({
      user: await setLearnerStatus(
        database,
        parseInput(idSchema, request.params.learnerId),
        input.enabled,
      ),
    });
  });
  router.get('/users', async (request, response) => {
    response.json(await listUsers(database, parseInput(querySchema, request.query)));
  });
  router.post('/users', async (request, response) => {
    response
      .status(201)
      .json({ user: await createAdministrator(database, parseInput(adminSchema, request.body)) });
  });
  return router;
}
