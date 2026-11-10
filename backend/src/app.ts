import { userManagementRouter } from './routes/user-management.js';
import { learningRouter, reportingRouter } from './routes/learning.js';
import { publicContentRouter, adminContentRouter } from './routes/content.js';
import type { PrismaClient } from '@prisma/client';
import { createAuthRouter } from './routes/auth.js';
import { requireSession, requireRole, requireTrustedOrigin } from './middleware/auth.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { Environment } from './config/env.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { createHealthRouter } from './routes/health.js';

export function createApp(
  config: Pick<Environment, 'FRONTEND_ORIGIN'> &
    Partial<Pick<Environment, 'NODE_ENV' | 'SESSION_TTL_HOURS'>>,
  checkDatabase?: () => Promise<void>,
  database?: PrismaClient,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createHealthRouter(checkDatabase));
  if (database) {
    app.use(
      '/api/auth',
      createAuthRouter(database, {
        FRONTEND_ORIGIN: config.FRONTEND_ORIGIN,
        NODE_ENV: config.NODE_ENV || 'development',
        SESSION_TTL_HOURS: config.SESSION_TTL_HOURS || 24,
      }),
    );
    app.use('/api', publicContentRouter(database, config.FRONTEND_ORIGIN));
    app.use(
      '/api/admin',
      requireSession(database),
      requireRole('ADMIN'),
      requireTrustedOrigin(config.FRONTEND_ORIGIN),
    );
    app.use('/api/admin', adminContentRouter(database));
    app.use('/api/admin', reportingRouter(database));
    app.use('/api/admin', userManagementRouter(database));
    app.get('/api/admin/access', (_request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.json({ user: response.locals.user });
    });
    app.use(
      '/api/learner',
      requireSession(database),
      requireRole('LEARNER'),
      requireTrustedOrigin(config.FRONTEND_ORIGIN),
    );
    app.get('/api/learner/access', (_request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.json({ user: response.locals.user });
    });
  }
  if (database) app.use('/api', learningRouter(database, config.FRONTEND_ORIGIN));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
