import sqlite3
from contextlib import closing
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from .auth import AuthError, SESSION_REQUIRED_RESPONSES, require_user
from .database import connect, list_study_sets, read_study_questions, read_study_set, write_answer_key

router = APIRouter(
    prefix="/api/study-sets",
    tags=["study sets"],
    dependencies=[Depends(require_user)],
    responses=SESSION_REQUIRED_RESPONSES,
)


class StudySetSummary(BaseModel):
    id: str
    title: str
    description: str
    source_kind: Literal["builtin", "custom"]
    question_count: int
    configured_count: int
    status: Literal["draft", "ready"]


class AnswerKeyOption(BaseModel):
    id: str
    text: str
    is_correct: bool


class AnswerKeyQuestion(BaseModel):
    id: str
    prompt: str
    configured: bool
    options: list[AnswerKeyOption] = Field(default_factory=list)


class AnswerKeyEditor(BaseModel):
    title: str
    revision: int
    status: Literal["draft", "ready"]
    configured_count: int
    questions: list[AnswerKeyQuestion]


class SaveAnswerKey(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1, examples=[1])
    answers: dict[str, list[str]] = Field(examples=[{"q15": ["q15-a"], "q16": [], "q24": []}])


EDITOR_RESPONSES = {
    404: {"model": AuthError, "description": "Study set not found."},
    409: {"model": AuthError, "description": "The key changed since loading, or the set uses another editor."},
}


def read_editor(connection: sqlite3.Connection, set_id: str) -> AnswerKeyEditor:
    study_set = read_study_set(connection, set_id)
    if study_set is None:
        raise HTTPException(404, "Study set not found.")
    if study_set["source_kind"] != "builtin":
        raise HTTPException(409, "This editor is for built-in sets.")
    questions: dict[str, AnswerKeyQuestion] = {}
    for row in read_study_questions(connection, set_id):
        question_id = row["id"]
        if question_id not in questions:
            questions[question_id] = AnswerKeyQuestion(
                id=question_id, prompt=row["prompt"], configured=bool(row["configured"]),
            )
        if row["option_id"] is not None:
            questions[question_id].options.append(AnswerKeyOption(
                id=row["option_id"], text=row["text"], is_correct=bool(row["is_correct"]),
            ))
    count = sum(question.configured for question in questions.values())
    return AnswerKeyEditor(
        title=study_set["title"], revision=study_set["revision"],
        configured_count=count, status="ready" if questions and count == len(questions) else "draft",
        questions=list(questions.values()),
    )


def answer_key_changes(editor: AnswerKeyEditor, answers: dict[str, list[str]]) -> list[tuple[bool, str]]:
    def invalid(message: str) -> HTTPException:
        return HTTPException(422, [{"type": "value_error", "loc": ["body", "answers"], "msg": message}])

    if set(answers) != {question.id for question in editor.questions}:
        raise invalid("Include the selections for every question in this set.")
    changes: list[tuple[bool, str]] = []
    for question in editor.questions:
        ids = answers[question.id]
        selected = set(ids)
        if len(selected) != len(ids) or not selected.issubset(option.id for option in question.options):
            raise invalid("Choose unique options from the matching question.")
        changes.extend(
            (option.id in selected, option.id)
            for option in question.options
            if option.is_correct != (option.id in selected)
        )
    return changes


@router.get("")
def get_study_sets(request: Request, response: Response) -> list[StudySetSummary]:
    response.headers["Cache-Control"] = "no-store"
    return [StudySetSummary(**row) for row in list_study_sets(request.app.state.database_path)]


@router.get("/{set_id}/editor", responses=EDITOR_RESPONSES)
def get_answer_key(set_id: str, request: Request, response: Response) -> AnswerKeyEditor:
    """Open the existing answer key for a built-in study set."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        connection.execute("BEGIN")
        return read_editor(connection, set_id)


@router.put("/{set_id}/editor", responses=EDITOR_RESPONSES)
def save_answer_key(set_id: str, body: SaveAnswerKey, request: Request, response: Response) -> AnswerKeyEditor:
    """Save the full answer key, including empty selections for questions still in Draft."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        # Keep revision checking, answer flags, and the new revision in one write transaction.
        connection.execute("BEGIN IMMEDIATE")
        editor = read_editor(connection, set_id)
        if body.revision != editor.revision:
            raise HTTPException(409, "This answer key changed. Reload the saved key before editing it again.")
        changes = answer_key_changes(editor, body.answers)
        if not changes:
            return editor
        write_answer_key(connection, set_id, changes)
        return read_editor(connection, set_id)
