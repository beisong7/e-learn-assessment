import { Router } from 'express';

export function createHealthRouter(checkDatabase?: () => Promise<void>) {
  const router = Router();
  router.get('/health', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json({ status: 'ok', service: 'learnova-api' });
  });

  router.get('/ready', async (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (!checkDatabase) throw new Error('Database check not configured');
      await checkDatabase();
      response.status(200).json({ status: 'ready', database: 'connected' });
    } catch {
      response.status(503).json({
        error: { code: 'DATABASE_UNAVAILABLE', message: 'The database is not available.' },
      });
    }
  });
  return router;
}
