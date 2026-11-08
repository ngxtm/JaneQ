from contextlib import closing
from sqlite3 import Connection, Row
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from .auth import AuthError, SESSION_REQUIRED_RESPONSES, User, require_user
from .database import (
    connect, create_study_set, delete_study_set, read_study_set, read_study_set_editor, read_study_set_summaries,
    update_study_set,
)
from .study_set_content import StudySetContent, StudySetEditor, StudySetRevision

router = APIRouter(
    prefix="/api/study-sets",
    tags=["study sets"],
    responses=SESSION_REQUIRED_RESPONSES,
)

SessionUser = Annotated[User, Depends(require_user)]
EDITOR_NOT_FOUND = {404: {"model": AuthError, "description": "No custom study set with this ID belongs to the session user."}}


class StudySetSummary(BaseModel):
    id: UUID
    legacy_id: str | None = Field(description="Old set identifier for bookmark compatibility, when available.")
    title: str
    description: str
    source_kind: Literal["builtin", "custom"]
    question_count: int
    configured_count: int
    status: Literal["draft", "ready"]


@router.get("")
def get_study_sets(request: Request, response: Response, user: SessionUser) -> list[StudySetSummary]:
    """List the built-in catalog and the signed-in user's study sets."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection:
        return [StudySetSummary(**row) for row in read_study_set_summaries(connection, user.username)]


def owned_custom_set(connection: Connection, set_id: str, username: str) -> Row:
    study_set = read_study_set(connection, set_id, username)
    if study_set is None or study_set["source_kind"] != "custom":
        raise HTTPException(404, "Editable study set not found.")
    return study_set


@router.post("", status_code=201, responses={
    409: {"model": AuthError, "description": "This creation key already belongs to a set with different content."},
})
def post_study_set(
    content: StudySetContent, request: Request, response: Response, user: SessionUser,
    idempotency_key: Annotated[UUID | None, Header(description="Reuse the same UUID to retry a create request.")] = None,
) -> StudySetSummary:
    """Create a private custom set, including a draft with incomplete questions."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        set_id = create_study_set(connection, user.username, content, idempotency_key)
        if set_id is None:
            raise HTTPException(409, "This set was already created. Open My sets to review the saved version.")
        return StudySetSummary(**read_study_set_summaries(connection, user.username, set_id)[0])


@router.get("/{set_id}/editor", responses=EDITOR_NOT_FOUND)
def get_study_set_editor(set_id: str, request: Request, response: Response, user: SessionUser) -> StudySetEditor:
    """Read the current revision and complete form, including the answer key."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        connection.execute("BEGIN")
        study_set = owned_custom_set(connection, set_id, user.username)
        return read_study_set_editor(connection, study_set)


@router.put("/{set_id}/editor", responses={
    **EDITOR_NOT_FOUND,
    409: {"model": AuthError, "description": "The study set changed after the supplied revision was loaded."},
})
def put_study_set_editor(
    set_id: str, content: StudySetRevision, request: Request, response: Response, user: SessionUser,
) -> StudySetSummary:
    """Save the complete editor form if the submitted revision is current."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        # Serialize the revision check and replacement against other saves.
        connection.execute("BEGIN IMMEDIATE")
        study_set = owned_custom_set(connection, set_id, user.username)
        if content.revision != study_set["revision"]:
            raise HTTPException(409, "This set changed since you opened it. Open the latest version to compare.")
        current = read_study_set_editor(connection, study_set)
        update_study_set(connection, study_set["id"], current, content)
        return StudySetSummary(**read_study_set_summaries(connection, user.username, study_set["id"])[0])


@router.delete("/{set_id}", status_code=204, responses={
    **EDITOR_NOT_FOUND,
    409: {"model": AuthError, "description": "The study set changed after the supplied revision was loaded."},
})
def remove_study_set(
    set_id: str, revision: Annotated[int, Query(ge=1)], request: Request, user: SessionUser,
) -> Response:
    """Delete a private custom set and its saved Learn progress."""
    with closing(connect(request.app.state.database_path)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        study_set = owned_custom_set(connection, set_id, user.username)
        if study_set["revision"] != revision:
            raise HTTPException(409, "This set changed since you opened it. Open the latest version before deleting.")
        delete_study_set(connection, study_set["id"])
    return Response(status_code=204, headers={"Cache-Control": "no-store"})
