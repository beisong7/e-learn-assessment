import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { databaseUrlSchema } from '../src/config/env.js';

// Database tests insert their own unique fixtures and clean up only those fixtures.
// These checks additionally prevent pointing the test runner at the development database.
const testUrl = databaseUrlSchema.safeParse(process.env.TEST_DATABASE_URL);
const devUrl = databaseUrlSchema.safeParse(process.env.DATABASE_URL);
const mode = process.argv[2];
if (
  process.env.NODE_ENV === 'production' ||
  !testUrl.success ||
  !devUrl.success ||
  !['test', 'migrate'].includes(mode || '')
) {
  console.error('Set valid DATABASE_URL and TEST_DATABASE_URL in a non-production environment.');
  process.exit(1);
}
const target = new URL(testUrl.data);
const development = new URL(devUrl.data);
if (
  !decodeURIComponent(target.pathname).endsWith('_test') ||
  target.pathname === development.pathname
) {
  console.error(
    'Test database name must end in _test and differ from the development database name.',
  );
  process.exit(1);
}
const command =
  mode === 'migrate'
    ? '../node_modules/prisma/build/index.js'
    : '../node_modules/vitest/vitest.mjs';
const args =
  mode === 'migrate'
    ? ['migrate', 'deploy']
    : [
        'run',
        'tests/database.test.ts',
        'tests/auth.db.test.ts',
        'tests/content.db.test.ts',
        'tests/learning.db.test.ts',
        'tests/user-management.db.test.ts',
      ];
const result = spawnSync(
  process.execPath,
  [fileURLToPath(new URL(command, import.meta.url)), ...args],
  {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: testUrl.data, NODE_ENV: 'test' },
    stdio: 'inherit',
  },
);
process.exitCode = result.status ?? 1;
