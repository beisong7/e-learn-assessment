import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp({ FRONTEND_ORIGIN: 'http://localhost:5173' });

describe('API foundation', () => {
  it('reports liveness without claiming database readiness', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', service: 'learnova-api' });
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows the configured frontend origin', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not reflect an untrusted origin', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://untrusted.example')
      .expect(200);
    expect(response.headers['access-control-allow-origin']).not.toBe('https://untrusted.example');
  });

  it('returns consistent JSON for unknown routes', async () => {
    const response = await request(app).get('/api/missing').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('handles malformed JSON without exposing parser details', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{invalid')
      .expect(400);
    expect(response.body).toEqual({
      error: { code: 'INVALID_JSON', message: 'Invalid JSON body.' },
    });
  });

  it('rejects oversized JSON bodies', async () => {
    const response = await request(app)
      .post('/api/health')
      .send({ text: 'x'.repeat(110 * 1024) })
      .expect(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('database readiness', () => {
  it('reports readiness when the database check succeeds', async () => {
    const readyApp = createApp({ FRONTEND_ORIGIN: 'http://localhost:5173' }, async () => {});
    const response = await request(readyApp).get('/api/ready').expect(200);
    expect(response.body).toEqual({ status: 'ready', database: 'connected' });
  });

  it('returns a safe 503 when the database check fails', async () => {
    const failingApp = createApp({ FRONTEND_ORIGIN: 'http://localhost:5173' }, async () => {
      throw new Error('private connection details');
    });
    const response = await request(failingApp).get('/api/ready').expect(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('private connection details');
    await request(failingApp).get('/api/health').expect(200);
  });
});
