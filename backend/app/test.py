import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from hashlib import sha256
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from .auth import AuthError, SESSION_REQUIRED_RESPONSES, User, require_user
from .database import connect
from .question_bank import Question, QuestionBank, read_question_bank
from .test_attempt_store import read_attempt_by_key, save_standard_result
from .test_results import GradedQuestion, TestResult, build_result, grade_question


class TestPaper(BaseModel):
    set_id: str
    title: str
    revision: int
    questions: list[Question]


class TestAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: str
    selected_ids: list[str] = Field(min_length=1)


class TestSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(strict=True, examples=[1])
    submission_id: UUID | None = Field(default=None, description="Reuse this UUID when retrying the same submission.")
    answers: list[TestAnswer] = Field(min_length=1, examples=[[
        {"question_id": "q15", "selected_ids": ["q15-a"]},
        {"question_id": "q16", "selected_ids": ["q16-a"]},
        {"question_id": "q24", "selected_ids": ["q24-a"]},
    ]])


class DraftTest(BaseModel):
    code: Literal["draft"]
    remaining_questions: int


class StaleTest(BaseModel):
    code: Literal["revision_changed"]


class SubmissionKeyConflict(BaseModel):
    code: Literal["submission_id_reused"]


class DraftError(BaseModel):
    detail: DraftTest


class SubmissionConflict(BaseModel):
    detail: Annotated[DraftTest | StaleTest | SubmissionKeyConflict, Field(discriminator="code")]


router = APIRouter(
    prefix="/api/study-sets/{set_id}/test",
    tags=["test"],
    responses={
        **SESSION_REQUIRED_RESPONSES,
        404: {"model": AuthError, "description": "Study set not found."},
    },
)


def ready_bank(connection: sqlite3.Connection, set_id: str, username: str) -> QuestionBank:
    bank = read_question_bank(connection, set_id, username)
    if bank is None:
        raise HTTPException(404, "Study set not found.")
    if not bank.ready:
        detail = DraftTest(code="draft", remaining_questions=bank.remaining_questions)
        raise HTTPException(409, detail.model_dump())
    return bank


def invalid_answer(message: str, *location: str | int) -> HTTPException:
    return HTTPException(422, [{"type": "value_error", "loc": ["body", "answers", *location], "msg": message}])


def grade_test(bank: QuestionBank, submission: TestSubmission) -> list[GradedQuestion]:
    selections: dict[str, list[str]] = {}
    for index, answer in enumerate(submission.answers):
        question = bank.questions.get(answer.question_id)
        if question is None or answer.question_id in selections:
            raise invalid_answer("Submit each question exactly once.", index, "question_id")
        if not question.accepts(answer.selected_ids):
            raise invalid_answer("Choose valid options for this question.", index, "selected_ids")
        selections[answer.question_id] = answer.selected_ids
    if len(selections) != len(bank.questions):
        raise invalid_answer("Answer every question before submitting.")

    return [
        grade_question(question, selections[question_id], bank.correct_ids[question_id])
        for question_id, question in bank.questions.items()
    ]


def submission_hash(set_id: str, submission: TestSubmission) -> str:
    # Grading accepts either question order or selection order.
    answers = sorted((answer.question_id, sorted(answer.selected_ids)) for answer in submission.answers)
    payload = json.dumps([set_id, submission.revision, answers], separators=(",", ":"))
    return sha256(payload.encode("utf-8")).hexdigest()


@router.get(
    "",
    responses={409: {"model": DraftError, "description": "The study set is Draft."}},
)
def get_test(
    set_id: str, request: Request, response: Response, user: Annotated[User, Depends(require_user)],
) -> TestPaper:
    """Load the ordered questions and selection types for a Ready study set."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        # Keep the revision and ordered question rows in the same SQLite snapshot.
        connection.execute("BEGIN")
        bank = ready_bank(connection, set_id, user.username)
    return TestPaper(set_id=set_id, title=bank.title, revision=bank.revision, questions=list(bank.questions.values()))


@router.post(
    "",
    response_model_exclude_none=True,
    responses={409: {"model": SubmissionConflict, "description": "Draft set, stale revision, or reused submission ID."}},
)
def submit_test(
    set_id: str, submission: TestSubmission, request: Request, response: Response,
    user: Annotated[User, Depends(require_user)],
) -> TestResult:
    """Grade the submitted revision and save the complete review in Test history."""
    response.headers["Cache-Control"] = "no-store"
    submitted_at = datetime.now(UTC)
    request_hash = submission_hash(set_id, submission) if submission.submission_id else None
    with closing(connect(request.app.state.database_path)) as connection, connection:
        # Keep replay, revision validation, and the history write in one transaction.
        connection.execute("BEGIN IMMEDIATE")
        if submission.submission_id is not None:
            saved = read_attempt_by_key(connection, user.username, "standard", submission.submission_id)
            if saved is not None:
                if saved["request_hash"] != request_hash:
                    raise HTTPException(409, SubmissionKeyConflict(code="submission_id_reused").model_dump())
                return TestResult.model_validate_json(saved["result_json"])
        bank = ready_bank(connection, set_id, user.username)
        if submission.revision != bank.revision:
            raise HTTPException(409, StaleTest(code="revision_changed").model_dump())
        result = build_result(
            attempt_id=uuid4(), mode="standard", set_id=set_id, title=bank.title, revision=bank.revision,
            username=user.username, submitted_at=submitted_at, questions=grade_test(bank, submission),
        )
        save_standard_result(connection, result, submission.submission_id, request_hash)
    return result
