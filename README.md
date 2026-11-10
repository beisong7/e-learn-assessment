# Learnova — Mini Learning Platform

An assessment LMS built with React + TypeScript, Node.js + TypeScript, and PostgreSQL. It includes a marketing landing page, registration/login, searchable courses, enrollment, video resume and completion, learner dashboards, course/lesson administration, learner enable/disable, and administrator creation.

## Prerequisites

- Node.js **22.12+** and npm.
- PostgreSQL **17**, running locally, with `createuser` and `createdb` available on your PATH.
- Google Chrome for browser tests.
- Internet access for dependency installation and externally hosted sample videos, images, and fonts.

Commands below start at the project root unless a different directory is stated. Frontend and backend have separate package files and lockfiles; there is no root npm install or dev command.

## 1. Create local databases

Using your PostgreSQL administrator account, run these commands once. `createuser` prompts for the application's database password. If your server requires it, add `-U YOUR_POSTGRES_ADMIN` to each command.

```sh
createuser -h 127.0.0.1 --pwprompt --no-superuser --no-createdb --no-createrole learnova_app
createdb -h 127.0.0.1 --owner=learnova_app learnova_dev
createdb -h 127.0.0.1 --owner=learnova_app learnova_test
createdb -h 127.0.0.1 --owner=learnova_app learnova_shadow
```

Each database has a separate purpose:

| Database          | Environment variable  | Purpose and when it is used                                                                                                                                       |
| ----------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `learnova_dev`    | `DATABASE_URL`        | Stores the application's users, courses, enrollments, and progress during normal local usage.                                                                     |
| `learnova_test`   | `TEST_DATABASE_URL`   | Isolates automated test data from development data. Used by `npm run db:migrate:test`, `npm run test:db`, and browser tests.                                      |
| `learnova_shadow` | `SHADOW_DATABASE_URL` | Disposable workspace where Prisma replays migrations and checks for schema differences when running `npm run db:migrate:dev`. It does not store application data. |

**Normal app usage requires only the development database.** Applying committed migrations with `npm run db:migrate` does not require the test or shadow database. Keep all three URLs pointed at separate databases; Prisma may reset the shadow database while developing migrations.

PostgreSQL must be running before migrating, seeding, or starting the API. On macOS with Homebrew, an installed PostgreSQL 17 service can be started with `brew services start postgresql@17`.

If these databases and your private environment files are already configured, keep them and continue with dependency installation.

## 2. Configure the environment

On a fresh checkout, copy the templates before editing them:

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Do not overwrite existing configured `.env` files. In `backend/.env`, replace `replace_with_local_password` in the database URLs with the password chosen above. URL-encode reserved characters in that password.

### Backend: `backend/.env`

| Variable              | Value / purpose                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`            | `development` locally                                                                          |
| `HOST`                | `127.0.0.1`                                                                                    |
| `PORT`                | `4000`                                                                                         |
| `FRONTEND_ORIGIN`     | `http://localhost:5173`; must exactly match the browser origin                                 |
| `DATABASE_URL`        | `postgresql://learnova_app:YOUR_PASSWORD@127.0.0.1:5432/learnova_dev?schema=public`            |
| `TEST_DATABASE_URL`   | Same connection settings, using the separate `learnova_test` database                          |
| `SHADOW_DATABASE_URL` | Same connection settings, using `learnova_shadow`; needed only for migration development       |
| `SEED_DEMO_PASSWORD`  | Set to `password123` to use the demo credentials below; required for seeding and browser tests |
| `SESSION_TTL_HOURS`   | `24`; absolute session lifetime                                                                |

### Frontend: `frontend/.env`

| Variable            | Value / purpose                                                  |
| ------------------- | ---------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `/api`; browser requests go through the Vite proxy               |
| `API_PROXY_TARGET`  | `http://127.0.0.1:4000`; backend address used by the Vite server |

Frontend variables prefixed with `VITE_` are public browser configuration. Keep database credentials and passwords only in the backend environment file. Both `.env` files are ignored by Git; both `.env.example` files should be committed.

**Origin troubleshooting:** `localhost` and `127.0.0.1` are different browser origins. If you open `http://127.0.0.1:5173`, set `FRONTEND_ORIGIN=http://127.0.0.1:5173`. Use the same hostname consistently. An origin mismatch causes `UNTRUSTED_ORIGIN` on login or other writes. Restart the backend after changing its `.env`; restart Vite after changing frontend configuration. If port 5173 is occupied, free it or update the origin to the actual frontend port.

## 3. Install, migrate, and seed

```sh
cd backend
npm ci
npm run db:migrate
npm run db:seed
cd ../frontend
npm ci
cd ..
```

Backend installation generates the Prisma client. Committed SQL migrations create/update tables, constraints, and indexes. Seeding creates missing demo accounts, six courses, and 26 short sample lessons. Rerunning the seed preserves existing passwords and edits to existing courses; changing `SEED_DEMO_PASSWORD` does not reset existing accounts. Demo seeding is disabled in production.

## 4. Run the application

Terminal 1 — backend:

```sh
cd backend
npm run dev
```

Terminal 2 — frontend:

```sh
cd frontend
npm run dev
```

Open **http://localhost:5173**, or the hostname configured in `FRONTEND_ORIGIN`. Both processes and PostgreSQL must be running. Vite proxies `/api` to the backend on port 4000.

Verify the API directly:

```sh
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1:4000/api/ready
```

Health reports the HTTP server is running; readiness checks the PostgreSQL connection. For database troubleshooting, use `npm run db:status` and `npm run db:check` from `backend/`.

### Demo accounts

These credentials apply after seeding with `SEED_DEMO_PASSWORD=password123`:

| Email             | Password      | Role          |
| ----------------- | ------------- | ------------- |
| `learner@app.com` | `password123` | Learner       |
| `admin@app.com`   | `password123` | Administrator |

Public registration creates learners. Administrators can create additional admin accounts through **Manage users**.

### Learner and admin walkthrough

1. Register a learner: a three-step welcome guide explains Dashboard, Explore courses, and My learning. Ordinary login and refresh do not replay the guide.
2. Browse/search courses, open course details, and enroll.
3. Play part of a lesson, leave, then return or refresh to resume from the saved position.
4. Finish lessons and check course percentages and dashboard statistics. Completed dashboard courses offer **Revisit Course**.
5. Sign in as admin to create/edit/delete courses and ordered lessons.
6. Open **Manage learners** to view enrolled courses and completion percentages or enable/disable learners. Disabling revokes sessions while retaining learning data; re-enabling permits a fresh login.
7. Open **Manage users** to create an administrator without changing your own session.
8. Verify a learner cannot access admin pages/APIs, then log out to revoke the session.

Sample course/instructor descriptions are illustrative. The short nature clips demonstrate playback and progress behavior rather than full course material.

## Tests and verification

From `backend/`:

```sh
npm run typecheck
npm run format:check
npm test
npm run db:migrate:test
npm run test:db
npm run build
```

From `frontend/`:

```sh
npm run typecheck
npm run format:check
npm run build
npm test
```

| Check                                                              | Last verified result — November 9, 2026 |
| ------------------------------------------------------------------ | --------------------------------------- |
| Backend foundation/password/calculation tests                      | 26 passed                               |
| PostgreSQL integration tests                                       | 53 passed                               |
| Browser journeys                                                   | 12 passed                               |
| Frontend and backend TypeScript, formatting, and production builds | Passed                                  |

These are recorded results, not tests executed automatically by reading this document. Coverage includes authentication/roles, enrollment, content CRUD/order/conflicts, video resume/completion, progress calculations, disabled accounts, and administrator creation.

Database tests require the migrated `TEST_DATABASE_URL`; the runner rejects a database name that does not end in `_test` or matches the development database. Tests create identifiable fixtures and clean up their own data.

Browser tests require Google Chrome, both projects' dependencies, the migrated test database, and backend `SEED_DEMO_PASSWORD`. They start their own API on **4108** and frontend on **5174**, then stop them afterward; keep those ports available. Tests use `password123` by default. If you choose another shared demo password, set `E2E_DEMO_PASSWORD` in the shell running the frontend tests to match it. Browser playback tests serve the checked-in sample clip with byte-range support.

### Production build commands

```sh
npm run build --prefix backend
npm run build --prefix frontend
```

Run compiled backend code with `npm start --prefix backend`. Preview the frontend build locally with `npm run preview --prefix frontend`; if testing authentication on the default preview port, adjust `FRONTEND_ORIGIN` to match. Production hosting must serve the frontend with SPA fallback and route `/api` to the backend. HTTPS is required for production session cookies. Cloud deployment is outside this assessment.

## Development approach

The work started by breaking the assessment into a complete learner journey and the administration needed to support it. The implementation followed this order:

1. Adapt the supplied design into responsive React screens and identify the data each screen needs.
2. Define PostgreSQL entities, relationships, constraints, migrations, and sample data.
3. Implement authentication, sessions, validation, and server-side role checks.
4. Connect course browsing, enrollment, lesson playback, and admin content management to the API.
5. Persist playback position and completion, calculate course progress, and populate dashboards.
6. Add learner enable/disable and administrator creation.
7. Verify critical behavior with automated tests and document setup, configuration, and limitations.

## Architecture and trade-offs

```text
React + TypeScript browser application
        | /api (Vite proxy during development)
Express + TypeScript REST API
        | routes -> services -> Prisma/data access
PostgreSQL: users, sessions, courses, lessons, enrollments, lesson progress
```

### Why a service layer

Express routes validate requests and return responses; services handle business rules such as enrollment, progress updates, course editing, and learner status changes. This keeps route handlers small and lets tests exercise business behavior independently of the UI. Prisma handles most database access within services, with a separate session repository for authentication persistence. A repository layer for every entity would add abstraction beyond this assessment's needs.

### Major decisions

| Decision                                       | Reason and trade-off                                                                                                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate React/Vite frontend and Express API   | Clear UI/API boundaries and independent testing; local development requires two processes                                                                                                                                   |
| PostgreSQL + Prisma + versioned SQL migrations | Typed access, transactions, and relational constraints; database installation/migrations are required, with SQL checks for constraints Prisma cannot express                                                                |
| Opaque HttpOnly session cookies                | PostgreSQL stores token hashes, passwords use salted scrypt, and sessions can be revoked; authenticated requests require a database lookup. Exact-Origin checks protect writes and require consistent browser configuration |
| Server-owned roles and enrollment checks       | UI guards help navigation; backend middleware enforces permissions and protects lesson video URLs                                                                                                                           |
| Server-calculated duration and completion      | Deriving totals from current lessons avoids duplicate stale values; course edits can change completion percentages                                                                                                          |
| Periodic/pause/navigation progress saves       | Supports resume without an event analytics pipeline; abrupt browser closure may lose the interval since the last successful save. Stale writes are rejected and failures can be retried                                     |
| Transactions and course versions               | Atomic lesson reordering/content saves preserve consistency; conflicting edits return 409 and require reload/reconciliation                                                                                                 |
| Hosted sample video files                      | Native browser playback keeps the assessment small; media availability depends on the external host and video upload/transcoding is excluded                                                                                |

Rate limiting uses an in-memory per-process store, and reporting is intentionally basic. Payments, certificates, quizzes, live classes, messaging, offline sync, and production-scale analytics are outside scope. Learner management supports enable/disable and course inspection; user management supports admin creation without role editing, invitations, account deletion, or password reset.

### Scaling considerations

The frontend can be served as static assets, while API instances share PostgreSQL-backed sessions. Running multiple API instances would also require shared rate-limit storage and appropriate database connection limits. Larger reporting workloads and media delivery would need separate attention. Docker, orchestration, and those scaling changes are future deployment work; they are not included in this implementation.

## Project layout and Git hygiene

```text
frontend/                 React UI, API clients, browser tests and media fixture
backend/                  Express API, services, Prisma schema/migrations, tests
  .env.example            Backend configuration template
frontend/.env.example     Public frontend configuration template
```

The root [`.gitignore`](.gitignore) applies to both projects. It excludes private environment files, dependencies, generated builds, test reports/coverage, caches, logs, and local editor/OS files. Commit source code, both `package-lock.json` files, Prisma migrations (including `migration_lock.toml`), environment templates, and test fixtures. `npm ci`, builds, and tests regenerate their output folders. If a file was previously committed, adding an ignore rule does not remove it from Git's index.

Local reference materials (`docs/`, `assessment.md`, `template.html`, and `todo-plan.md`) are also ignored and may be absent from a fresh checkout. The setup and architecture guidance needed to run and evaluate the project is included in this README. Additional backend instructions are in [backend/README.md](backend/README.md).
