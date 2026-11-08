# JaneQ

JaneQ is a multiple-choice quiz app. `backend/` contains the FastAPI service and `frontend/` contains the React and TypeScript app.

## Documentation

- [Demo sign-in and Home](docs/features/login-home.md) covers setup, the UI-to-API flow, and acceptance checks.
- [Set answer key](docs/features/answer-key.md) shows how to turn a fresh Draft into a Ready study set from the UI.
- [Study Set and Learn](docs/features/learn.md) covers the layout, local review setup, and Learn acceptance checks.
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

Sign in with the username and password from `backend/.env`. Home shows the six built-in study sets, their question counts, and their answer-key status. JaneQ seeds the 41 source questions into `backend/data/janeq.sqlite3` on first startup. Set `JANEQ_DB_PATH` to use a different SQLite file. Set `JANEQ_COOKIE_SECURE=true` when serving JaneQ over HTTPS.

## Frontend checks

Run from `frontend/`:

```sh
npm run lint
npm run build
```
