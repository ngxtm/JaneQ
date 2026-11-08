import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from .auth import SESSION_COOKIE_NAME, router as auth_router
from .database import initialize_database
from .learn import router as learn_router
from .study_sets import router as study_sets_router
from .test import router as test_router

BACKEND_DIR = Path(__file__).resolve().parents[1]


def required_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value.strip():
        raise RuntimeError(f"Set {name} in the environment before starting JaneQ.")
    return value


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database(app.state.database_path)
    yield


def health() -> dict[str, str]:
    return {"status": "ok"}


def create_app() -> FastAPI:
    secret = required_env("JANEQ_SESSION_SECRET")
    if len(secret) < 32:
        raise RuntimeError("JANEQ_SESSION_SECRET must be at least 32 characters.")

    app = FastAPI(title="JaneQ API", lifespan=lifespan)
    app.state.demo_username = required_env("JANEQ_DEMO_USERNAME")
    app.state.demo_password = required_env("JANEQ_DEMO_PASSWORD")
    app.state.database_path = BACKEND_DIR / os.getenv(
        "JANEQ_DB_PATH", "data/janeq-mvp.sqlite3"
    )
    app.add_middleware(
        SessionMiddleware,
        secret_key=secret,
        session_cookie=SESSION_COOKIE_NAME,
        max_age=8 * 60 * 60,
        same_site="lax",
        https_only=os.getenv("JANEQ_COOKIE_SECURE", "false").lower() == "true",
    )
    app.add_api_route("/api/health", health, methods=["GET"], tags=["health"])
    app.include_router(auth_router)
    app.include_router(study_sets_router)
    app.include_router(learn_router)
    app.include_router(test_router)
    return app


app = create_app()
