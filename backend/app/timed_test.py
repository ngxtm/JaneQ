import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from .auth import AuthError, SESSION_REQUIRED_RESPONSES, User, require_user
from .database import connect
from .question_bank import Question
from .test import DraftTest, ready_bank
from .test_attempt_store import (
    complete_timed_attempt, create_timed_attempt, read_attempt, read_attempt_by_key, save_timed_progress,
)
from .test_results import TestResult, build_result, grade_question

QUESTION_TIME = timedelta(seconds=60)


class TimedStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_id: UUID = Field(description="Reuse this UUID when retrying to start the same attempt.")


class TimedAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: str
    selected_ids: list[str] = Field(default_factory=list, description="An expired question can be advanced without selections.")


class KeyedQuestion(BaseModel):
    question: Question
    correct_ids: list[str]


class TimedSelection(BaseModel):
    selected_ids: list[str]
    timed_out: bool


class TimedProgress(BaseModel):
    questions: list[KeyedQuestion]
    selections: list[TimedSelection] = Field(default_factory=list)
    deadline_at: AwareDatetime


class ActiveTimedTest(BaseModel):
    status: Literal["in_progress"] = "in_progress"
    attempt_id: UUID
    title: str
    position: int = Field(description="One-based position of the current question.")
    total: int
    question: Question
    server_now: AwareDatetime
    deadline_at: AwareDatetime
    expired: bool


class CompletedTimedTest(BaseModel):
    status: Literal["completed"] = "completed"
    result: TestResult


TimedTestState = Annotated[ActiveTimedTest | CompletedTimedTest, Field(discriminator="status")]


class StartKeyConflict(BaseModel):
    code: Literal["start_id_reused"]


class TimedStartConflict(BaseModel):
    detail: Annotated[DraftTest | StartKeyConflict, Field(discriminator="code")]


class QuestionChanged(BaseModel):
    code: Literal["question_changed"]


class TimedAdvanceConflict(BaseModel):
    detail: QuestionChanged


router = APIRouter(
    tags=["timed test"],
    responses={
        **SESSION_REQUIRED_RESPONSES,
        404: {"model": AuthError, "description": "Study set or timed attempt not found for this account."},
    },
)


def now_utc() -> datetime:
    return datetime.now(UTC)


def timed_attempt(connection: sqlite3.Connection, username: str, attempt_id: UUID) -> sqlite3.Row:
    attempt = read_attempt(connection, username, attempt_id)
    if attempt is None or attempt["mode"] != "timed":
        raise HTTPException(404, "Timed attempt not found.")
    return attempt


def active_state(attempt_id: UUID, title: str, progress: TimedProgress, now: datetime) -> ActiveTimedTest:
    index = len(progress.selections)
    return ActiveTimedTest(
        attempt_id=attempt_id, title=title, position=index + 1, total=len(progress.questions),
        question=progress.questions[index].question, server_now=now, deadline_at=progress.deadline_at,
        expired=now >= progress.deadline_at,
    )


def read_state(attempt: sqlite3.Row) -> TimedTestState:
    if attempt["result_json"] is not None:
        return CompletedTimedTest(result=TestResult.model_validate_json(attempt["result_json"]))
    progress = TimedProgress.model_validate_json(attempt["state_json"])
    return active_state(UUID(attempt["id"]), attempt["title"], progress, now_utc())


def record_selection(question: Question, answer: TimedAnswer, expired: bool) -> TimedSelection:
    if expired:
        return TimedSelection(selected_ids=[], timed_out=True)
    if not question.accepts(answer.selected_ids):
        raise HTTPException(422, [{
            "type": "value_error", "loc": ["body", "selected_ids"], "msg": "Choose valid options for this question.",
        }])
    return TimedSelection(selected_ids=answer.selected_ids, timed_out=False)


def question_changed() -> HTTPException:
    return HTTPException(409, QuestionChanged(code="question_changed").model_dump())


@router.post(
    "/api/study-sets/{set_id}/timed-test",
    responses={409: {"model": TimedStartConflict, "description": "Draft set or reused start ID."}},
)
def start_timed_test(
    set_id: str, command: TimedStart, request: Request, response: Response, user: Annotated[User, Depends(require_user)],
) -> TimedTestState:
    """Start a timed attempt or resume one previously created with the same start ID."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        saved = read_attempt_by_key(connection, user.username, "timed", command.start_id)
        if saved is not None:
            if saved["set_id"] != set_id:
                raise HTTPException(409, StartKeyConflict(code="start_id_reused").model_dump())
            return read_state(saved)

        bank = ready_bank(connection, set_id, user.username)
        attempt_id = uuid4()
        questions = [
            KeyedQuestion(question=question, correct_ids=bank.correct_ids[question.id])
            for question in bank.questions.values()
        ]
        progress = TimedProgress(questions=questions, deadline_at=now_utc() + QUESTION_TIME)
        create_timed_attempt(
            connection, attempt_id=attempt_id, username=user.username, start_id=command.start_id,
            set_id=set_id, title=bank.title, revision=bank.revision, total=len(questions),
            state_json=progress.model_dump_json(),
        )
    return active_state(attempt_id, bank.title, progress, now_utc())


@router.get("/api/test-attempts/{attempt_id}/state")
def get_timed_test_state(
    attempt_id: UUID, request: Request, response: Response, user: Annotated[User, Depends(require_user)],
) -> TimedTestState:
    """Read the current question without changing its position or deadline."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection:
        attempt = timed_attempt(connection, user.username, attempt_id)
    return read_state(attempt)


@router.post(
    "/api/test-attempts/{attempt_id}/advance",
    responses={409: {"model": TimedAdvanceConflict, "description": "Unknown question or question not yet reached."}},
)
def advance_timed_test(
    attempt_id: UUID, answer: TimedAnswer, request: Request, response: Response,
    user: Annotated[User, Depends(require_user)],
) -> TimedTestState:
    """Record the current answer or timeout, then start the next question or save the result."""
    response.headers["Cache-Control"] = "no-store"
    received_at = now_utc()
    with closing(connect(request.app.state.database_path)) as connection, connection:
        # Serialize advances so retries and overlapping tabs cannot skip a question.
        connection.execute("BEGIN IMMEDIATE")
        attempt = timed_attempt(connection, user.username, attempt_id)
        if attempt["result_json"] is not None:
            result = TestResult.model_validate_json(attempt["result_json"])
            if not any(question.id == answer.question_id for question in result.questions):
                raise question_changed()
            return CompletedTimedTest(result=result)

        progress = TimedProgress.model_validate_json(attempt["state_json"])
        index = len(progress.selections)
        question = progress.questions[index].question
        if answer.question_id != question.id:
            if any(entry.question.id == answer.question_id for entry in progress.questions[:index]):
                return active_state(attempt_id, attempt["title"], progress, now_utc())
            raise question_changed()

        expired = received_at >= progress.deadline_at
        progress.selections.append(record_selection(question, answer, expired))
        now = now_utc()
        if len(progress.selections) < len(progress.questions):
            progress.deadline_at = now + QUESTION_TIME
            save_timed_progress(connection, attempt_id, progress.model_dump_json())
            return active_state(attempt_id, attempt["title"], progress, now)

        graded = [
            grade_question(entry.question, selection.selected_ids, entry.correct_ids, timed_out=selection.timed_out)
            for entry, selection in zip(progress.questions, progress.selections, strict=True)
        ]
        result = build_result(
            attempt_id=attempt_id, mode="timed", set_id=attempt["set_id"], title=attempt["title"],
            revision=attempt["revision"], username=user.username, submitted_at=now, questions=graded,
        )
        complete_timed_attempt(connection, result)
    return CompletedTimedTest(result=result)
