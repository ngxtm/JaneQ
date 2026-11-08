from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from .auth import SESSION_REQUIRED_RESPONSES, require_user
from .database import list_study_sets

router = APIRouter(
    prefix="/api/study-sets",
    tags=["study sets"],
    dependencies=[Depends(require_user)],
    responses=SESSION_REQUIRED_RESPONSES,
)


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
def get_study_sets(request: Request, response: Response) -> list[StudySetSummary]:
    response.headers["Cache-Control"] = "no-store"
    return [StudySetSummary(**row) for row in list_study_sets(request.app.state.database_path)]
