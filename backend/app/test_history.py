import sqlite3
from contextlib import closing
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .auth import AuthError, SESSION_REQUIRED_RESPONSES, User, require_user
from .database import connect, read_study_set
from .test_attempt_store import read_attempt, read_completed_attempts
from .test_pdf import read_pdf_upload, save_pdf_export
from .test_results import TestAttemptSummary, TestResult


class TestHistoryPage(BaseModel):
    attempts: list[TestAttemptSummary]
    next_before: UUID | None


class PdfExportStatus(BaseModel):
    saved: bool = Field(description="Whether this installation saved a copy of the report.")


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
    set_id: Annotated[str | None, Query(min_length=1, description="Filter completed attempts by study set reference.")] = None,
) -> TestHistoryPage:
    """List the signed-in account's completed attempts from newest to oldest."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        connection.execute("BEGIN")
        study_set = read_study_set(connection, set_id, user.username) if set_id is not None else None
        canonical_id = study_set["id"] if study_set is not None else set_id
        legacy_id = study_set["legacy_id"] if study_set is not None else None
        cursor = read_attempt(connection, user.username, before) if before else None
        if before and (
            cursor is None or cursor["submitted_at"] is None
            or (canonical_id is not None and cursor["set_id"] not in (canonical_id, legacy_id))
        ):
            raise HTTPException(404, "Completed attempt not found.")
        rows = read_completed_attempts(
            connection, user.username, limit + 1, cursor, set_id=canonical_id, legacy_set_id=legacy_id,
        )
    attempts = [TestAttemptSummary.model_validate(dict(row)) for row in rows[:limit]]
    return TestHistoryPage(attempts=attempts, next_before=attempts[-1].attempt_id if len(rows) > limit else None)


@router.get("/{attempt_id}", response_model_exclude_none=True)
def get_test_attempt(
    attempt_id: UUID, request: Request, response: Response, user: Annotated[User, Depends(require_user)],
) -> TestResult:
    """Read a completed result from its saved snapshot."""
    response.headers["Cache-Control"] = "no-store"
    attempt = require_completed_attempt(request, user, attempt_id)
    return TestResult.model_validate_json(attempt["result_json"])


def require_completed_attempt(request: Request, user: User, attempt_id: UUID) -> sqlite3.Row:
    with closing(connect(request.app.state.database_path)) as connection:
        attempt = read_attempt(connection, user.username, attempt_id)
    if attempt is None or attempt["result_json"] is None:
        raise HTTPException(404, "Completed attempt not found.")
    return attempt


@router.put(
    "/{attempt_id}/pdf",
    responses={
        413: {"model": AuthError, "description": "Report exceeds the export size limit."},
        415: {"model": AuthError, "description": "Request content type is not application/pdf."},
        400: {"model": AuthError, "description": "The upload is not a readable PDF report."},
        503: {"model": AuthError, "description": "The export directory is unavailable."},
    },
    openapi_extra={"requestBody": {"required": True, "content": {
        "application/pdf": {"schema": {"type": "string", "format": "binary"}},
    }}},
)
async def archive_test_pdf(
    attempt_id: UUID, request: Request, response: Response, user: Annotated[User, Depends(require_user)],
) -> PdfExportStatus:
    """Store the exported PDF for a completed attempt owned by this account."""
    response.headers["Cache-Control"] = "no-store"
    await run_in_threadpool(require_completed_attempt, request, user, attempt_id)
    directory = request.app.state.pdf_export_dir
    if directory is None:
        return PdfExportStatus(saved=False)
    data = await read_pdf_upload(request)
    try:
        await run_in_threadpool(save_pdf_export, directory, attempt_id, data)
    except OSError as error:
        raise HTTPException(503, "Could not save the PDF export.") from error
    return PdfExportStatus(saved=True)
