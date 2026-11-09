from contextlib import closing
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel

from .auth import AuthError, SESSION_REQUIRED_RESPONSES, User, require_user
from .database import connect
from .test_attempt_store import read_attempt, read_completed_attempts
from .test_results import TestAttemptSummary, TestResult


class TestHistoryPage(BaseModel):
    attempts: list[TestAttemptSummary]
    next_before: UUID | None


router = APIRouter(
    prefix="/api/test-attempts", tags=["test history"],
    responses={
        **SESSION_REQUIRED_RESPONSES,
        404: {"model": AuthError, "description": "Completed attempt not found for this account."},
    },
)


@router.get("")
def list_test_attempts(
    request: Request, response: Response, user: Annotated[User, Depends(require_user)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20, before: UUID | None = None,
) -> TestHistoryPage:
    """List the signed-in account's completed attempts from newest to oldest."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        connection.execute("BEGIN")
        cursor = read_attempt(connection, user.username, before) if before else None
        if before and (cursor is None or cursor["submitted_at"] is None):
            raise HTTPException(404, "Completed attempt not found.")
        rows = read_completed_attempts(connection, user.username, limit + 1, cursor)
    attempts = [TestAttemptSummary.model_validate(dict(row)) for row in rows[:limit]]
    return TestHistoryPage(attempts=attempts, next_before=attempts[-1].attempt_id if len(rows) > limit else None)


@router.get("/{attempt_id}", response_model_exclude_none=True)
def get_test_attempt(
    attempt_id: UUID, request: Request, response: Response, user: Annotated[User, Depends(require_user)],
) -> TestResult:
    """Read a completed result from its saved snapshot."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection:
        attempt = read_attempt(connection, user.username, attempt_id)
    if attempt is None or attempt["result_json"] is None:
        raise HTTPException(404, "Completed attempt not found.")
    return TestResult.model_validate_json(attempt["result_json"])
