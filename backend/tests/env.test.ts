import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../src/config/env.js';

const DATABASE_URL = 'postgresql://app:demo@localhost:5432/learnova_dev';

describe('environment configuration', () => {
  it('provides local development defaults', () => {
    expect(parseEnvironment({ DATABASE_URL })).toEqual({
      DATABASE_URL,
      SESSION_TTL_HOURS: 24,
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 4000,
      FRONTEND_ORIGIN: 'http://localhost:5173',
    });
  });

  it('reads a configured port and normalizes the frontend origin', () => {
    const config = parseEnvironment({
      DATABASE_URL,
      PORT: '4100',
      FRONTEND_ORIGIN: 'https://learn.example/',
    });
    expect(config.PORT).toBe(4100);
    expect(config.FRONTEND_ORIGIN).toBe('https://learn.example');
  });

  it.each(['0', '65536', '4000.5', 'not-a-port', ''])('rejects invalid port %s', (PORT) => {
    expect(() => parseEnvironment({ DATABASE_URL, PORT })).toThrow(/PORT/);
  });

  it.each([
    'not-a-url',
    'ftp://example.com',
    'https://example.com/path',
    'https://a:b@example.com',
  ])('rejects invalid frontend origin %s', (FRONTEND_ORIGIN) => {
    expect(() => parseEnvironment({ DATABASE_URL, FRONTEND_ORIGIN })).toThrow(/FRONTEND_ORIGIN/);
  });

  it('requires a database URL without disclosing invalid values', () => {
    expect(() => parseEnvironment({})).toThrow(/DATABASE_URL/);
    expect(() =>
      parseEnvironment({ DATABASE_URL: 'https://app:private-secret@example.com' }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      parseEnvironment({ DATABASE_URL: 'https://app:private-secret@example.com' }),
    ).not.toThrow(/private-secret/);
  });

  it('rejects unknown runtime modes', () => {
    expect(() => parseEnvironment({ DATABASE_URL, NODE_ENV: 'preview' })).toThrow(/NODE_ENV/);
  });
});
