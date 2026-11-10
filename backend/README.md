# Learnova API

Node.js + TypeScript REST API using Express and PostgreSQL, with Prisma 6 for typed data access and versioned SQL migrations. Authentication endpoints and PostgreSQL sessions are implemented; catalog/content/enrollment/video APIs are implemented; basic progress and reporting endpoints are implemented.

## Current local setup

PostgreSQL 17 is already running through Homebrew on this machine. The project has an isolated `learnova_app` login role and three databases: `learnova_dev`, `learnova_test`, and `learnova_shadow`. The LMS and authentication-session migrations have been applied to development and test. Generated local credentials are saved only in the gitignored `backend/.env`; preserve that file when using this existing setup. The demo learner/admin accounts are seeded; six sample courses and 26 ordered lessons are seeded.

From `backend/`:

```sh
npm ci
npm run db:status
npm run db:check
npm run dev
```

The API defaults to `http://127.0.0.1:4000`. It connects to PostgreSQL before accepting HTTP requests and exits with a safe error if the connection cannot be established. Shell environment values take precedence over `.env`.

## Fresh checkout / database setup

Prerequisites: Node.js **22.12+**, npm, and a running PostgreSQL **17** server with its client tools on your PATH. For an existing Homebrew installation, start it with `brew services start postgresql@17` if needed. If a server is already running, use it.

Using your local PostgreSQL administrator account, create the role and isolated databases once. `createuser` prompts for the new role's password; use the same password in your private `.env` (URL-encode reserved characters).

```sh
createuser -h 127.0.0.1 --pwprompt --no-superuser --no-createdb --no-createrole learnova_app
createdb -h 127.0.0.1 --owner=learnova_app learnova_dev
createdb -h 127.0.0.1 --owner=learnova_app learnova_test
createdb -h 127.0.0.1 --owner=learnova_app learnova_shadow
```

On a fresh checkout without `.env`, copy `.env.example` to `.env` and fill in the database password. These are separate databases, not schemas in one database. The role owns only this project's databases and does not need superuser or database-creation permissions.

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run db:migrate:test
npm run db:check
npm run dev
```

`npm ci` also generates the Prisma client through `postinstall`. Prisma may download its platform-specific engine on first installation. Initial database creation is a one-time administrator action; application startup never creates or resets databases.

## Configuration

| Variable | Default / requirement | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `HOST` | `127.0.0.1` | HTTP bind address |
| `PORT` | `4000` | Integer port from 1 through 65535 |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | One allowed HTTP(S) browser origin, without credentials, path, query, or fragment |
| `DATABASE_URL` | Required | Development/application PostgreSQL connection URL |
| `TEST_DATABASE_URL` | Required for database tests | Separate database whose name ends in `_test` and differs from development |
| `SESSION_TTL_HOURS` | `24` (1–720) | Absolute session lifetime in hours |
| `SHADOW_DATABASE_URL` | Required for migration development | Dedicated disposable database used only to replay/check migrations |

Invalid runtime configuration exits startup with field-level messages without printing credential values. Test and shadow URLs are tooling configuration, not required by the running API. Update `FRONTEND_ORIGIN` if Vite uses a different browser origin.

## Migrations

```sh
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:status
npm run db:migrate:test
```

`db:migrate` applies committed migrations using `prisma migrate deploy`; rerunning it with an up-to-date database is a no-op. The initial migration is atomic and includes PostgreSQL CHECK constraints that Prisma cannot express directly. Keep those constraints in versioned SQL migrations.

For a future schema change, edit `prisma/schema.prisma`, then generate and review a new migration before committing it:

```sh
npm run db:migrate:dev -- --name describe_the_change --create-only
# Review the generated SQL, including custom database constraints.
npm run db:migrate
npm run db:generate
npm run db:migrate:test
npm run test:db
```

The shadow database is a separate scratch database used by `migrate dev`, not by the running app or `migrate deploy`. Do not edit migrations already applied to a shared database. Do not use `db push` or migration reset as the normal setup path.

## Health and readiness

```sh
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1:4000/api/ready
```

- `GET /api/health`: `200 {"status":"ok","service":"learnova-api"}` — HTTP liveness only.
- `GET /api/ready`: `200 {"status":"ready","database":"connected"}` after a database query; `503 DATABASE_UNAVAILABLE` on connection/query failure.

Both responses disable caching. Readiness checks connectivity; `npm run db:check` additionally verifies the LMS and session tables are queryable. The server drains HTTP requests and closes the database client on SIGINT/SIGTERM, with a ten-second deadline.

## Build and tests

```sh
npm run typecheck
npm run format:check
npm test
npm run db:migrate:test
npm run test:db
npm run build
npm start
```

`npm test` runs configuration, password, and HTTP foundation tests without a live database. Database-backed auth tests run under `test:db`. `npm run test:db` runs integration tests against `TEST_DATABASE_URL`, requires a migrated test database, and cleans up only its randomly identified fixtures. It refuses production mode, a test database name without `_test`, and a test database with the same name as development. Database tests do not truncate tables or reset schemas. Tests open local sockets, so the environment must allow loopback connections.

Current verification: **26 foundation/password/calculation tests + 53 PostgreSQL/authentication/content/learning/user-management tests pass**. Type checking, formatting checks, production build, migration status, and real server readiness/shutdown are checked for this phase.

## Schema and deletion rules

See [docs/database.md](../docs/database.md) for entities, constraints, indexes, and the persistence rules. Course duration and completion percentages are derived from current lessons/progress rather than stored as duplicate totals. The UI uses the content/enrollment APIs; playback progress and basic dashboard reports now use PostgreSQL too.

## Structure

```text
prisma/
  schema.prisma           Data model and Prisma client generator
  migrations/             Committed PostgreSQL migrations
scripts/
  check-database.ts       Connectivity and table checks
  test-database.ts        Guarded test migration/test runner
src/
  app.ts                  Testable Express app factory
  server.ts               Configuration, DB connection, HTTP lifecycle
  config/env.ts           Runtime validation
  database/client.ts      Typed database client factory
  routes/health.ts        Health and database readiness
  middleware/errors.ts    JSON errors
tests/                    HTTP, configuration, and PostgreSQL integration tests
```

The app retains Helmet headers, configured-origin CORS, and a 100 KB JSON request limit. CORS is not authentication; PostgreSQL sessions and server-side role middleware enforce access. Basic progress persistence and dashboard reporting are implemented; see `docs/learning-progress.md`. See [authentication details](../docs/authentication.md) for the implemented endpoints and cookie/CSRF design.

## Demo account seed

The account seed targets `learner@app.com` (LEARNER) and `admin@app.com` (ADMIN). Both accounts are seeded in the local development database, with the shared demo password configured privately in `backend/.env`. Set the shared password in the private backend `.env` as `SEED_DEMO_PASSWORD`, then run:

```sh
npm run db:seed
```

The seed hashes each password using Node.js scrypt with a separate random salt. Passwords and hashes are never printed. It creates missing accounts in a transaction; rerunning it preserves existing account IDs and password hashes. A role mismatch aborts instead of changing an existing account's privileges. Changing `SEED_DEMO_PASSWORD` does not reset an existing account password. Demo seeding is disabled in production.

The frontend `.env` contains the public `VITE_API_BASE_URL=/api`; an optional `API_PROXY_TARGET` configures only the Vite server. Use `http://localhost:5173` unless changing `FRONTEND_ORIGIN` to match another browser origin. Database credentials and demo passwords belong only in the backend `.env`. Both `.env` files are gitignored; their `.env.example` counterparts document the settings.

These accounts now support real frontend login and session restoration. The same command also seeds six courses and 26 lessons while preserving existing course edits. Missing seed courses are created again; existing courses and removed lessons are not overwritten. Basic progress persistence and dashboard reporting are implemented; see `docs/learning-progress.md`.

## Authentication APIs

Registration, login, logout, and `/api/auth/me` are live. State-changing requests require JSON and the exact configured Origin; sessions use HttpOnly cookies, Secure in production. No `SESSION_SECRET` is needed because the cookie contains an opaque random token whose hash is validated against PostgreSQL. See [docs/authentication.md](../docs/authentication.md) for contracts, security behavior, and verification.

`/api/admin/access` demonstrates the ADMIN-protected namespace and `/api/learner/access` demonstrates LEARNER-only access. All future `/api/admin/*` endpoints inherit the same server guards. Authentication limits currently use an in-memory per-process store.

## Course content

Catalog, details, admin course/lesson CRUD and atomic full-editor saves, lesson ordering, persistent enrollment, and authorized video endpoints are live. Existing-course writes require `expectedVersion`; stale edits return 409. See [docs/content-api.md](../docs/content-api.md) for contracts, transactional behavior, and seed policy.

## Minimal progress and reports

`PUT /api/lessons/:lessonId/progress`, `GET /api/me/dashboard`, and admin-only `GET /api/admin/dashboard` complete the basic assessment learning loop. Position saves require enrollment, are clamped to duration, and reject stale timestamps. Completion survives replay. See [learning-progress.md](../docs/learning-progress.md) for the bounded scope and save semantics.

## Learner and user management

Admin-only learner/account lists, learner course progress, enable/disable, and administrator creation are implemented. Migration `202611090001_user_status` defaults existing accounts to enabled. Disabling learners revokes their sessions while retaining learning data. See [user-management.md](../docs/user-management.md) for contracts and behavior.
