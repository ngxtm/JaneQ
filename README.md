# JaneQ

JaneQ is a multiple-choice quiz app. `backend/` contains the FastAPI service and `frontend/` contains the React and TypeScript app.

## Documentation

- [Demo sign-in and Home](docs/features/login-home.md) covers setup, the UI-to-API flow, and acceptance checks. [The 404 screen](docs/features/login-home.md#page-and-study-set-not-found) covers missing pages and study sets.
- [Built-in study sets](docs/features/builtin-sets.md) covers the seeded question bank and the path from Home to Learn.
- [Study Set and Learn](docs/features/learn.md) covers the study flow, local review setup, and Learn acceptance checks. [Study set URLs and preview loading](docs/features/learn.md#study-set-urls-and-preview-loading) covers direct links and the top loading bar.
- [Test, Results, and PDF download](docs/features/test-results.md) covers the practice flow, API contract, and sample report.
- [JaneQ branding](docs/features/branding.md) describes the shared logo and where it appears.
- [Database reference](docs/database.md) covers the SQLite schema, seed behavior, and read-only inspection.
- [Frontend UI guide](docs/frontend.md) covers shared components, interaction states, and verification.

## Local development

Use Python 3.13 with [uv](https://docs.astral.sh/uv/getting-started/installation/) and Node.js 24 with npm.

From `backend/`, install the locked dependencies:

```sh
uv sync --locked
```

Copy `backend/.env.example` to `backend/.env`. Set a password for the local demo account and generate a session secret with `uv run --locked python -c "import secrets; print(secrets.token_urlsafe(32))"`. Set `JANEQ_SESSION_SECRET` to the generated value. Then run from `backend/`:

```sh
uv run --locked --env-file .env fastapi dev
```

From `frontend/`, install the locked dependencies and start Vite:

```sh
npm ci
npm run dev
```

Open [JaneQ](http://127.0.0.1:5173/). Vite forwards `/api` to FastAPI on port 8000. [The health endpoint](http://127.0.0.1:5173/api/health) should return `{"status":"ok"}` through the proxy. [FastAPI's OpenAPI UI](http://127.0.0.1:8000/docs) is available on the backend port.

Sign in with the username and password from `backend/.env`. Home shows 18 built-in study sets with 281 questions and ready-to-use answer keys. The MVP seeds `backend/data/janeq-mvp.sqlite3` on first startup. If `JANEQ_DB_PATH` points to a previous demo database, point it to a new file. The fresh file starts with empty Learn progress. Set `JANEQ_COOKIE_SECURE=true` when serving JaneQ over HTTPS.

## Frontend checks

Run from `frontend/`:

```sh
npm run lint
npm run build
```
