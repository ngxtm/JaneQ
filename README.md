# JaneQ

JaneQ is a multiple-choice quiz app. `backend/` contains the FastAPI service and `frontend/` contains the React and TypeScript app.

## Local development

Use Python 3.13 with [uv](https://docs.astral.sh/uv/getting-started/installation/) and Node.js 24 with npm.

From `backend/`, install the locked dependencies and start FastAPI:

```sh
uv sync --locked
uv run --locked fastapi dev
```

From `frontend/`, install the locked dependencies and start Vite:

```sh
npm ci
npm run dev
```

Open [JaneQ](http://127.0.0.1:5173/). Vite forwards `/api` to FastAPI on port 8000. [The health endpoint](http://127.0.0.1:5173/api/health) should return `{"status":"ok"}` through the proxy. [FastAPI's OpenAPI UI](http://127.0.0.1:8000/docs) is available on the backend port.

## Frontend checks

Run from `frontend/`:

```sh
npm run lint
npm run build
```
