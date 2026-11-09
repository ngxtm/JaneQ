import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal, Self
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from .auth import AuthError, SESSION_REQUIRED_RESPONSES, User, require_user
from .database import connect
from .question_bank import Question
from .test import DraftTest, TestPaper, ready_bank
from .test_attempt_store import (
    complete_timed_attempt, create_timed_attempt, read_attempt, read_attempt_by_key, save_timed_progress,
)
from .test_results import TestResult, build_result, grade_question

PaperDuration = Annotated[int, Field(strict=True, ge=1, le=1440)]
AnswerVersion = Annotated[int, Field(strict=True, ge=0)]


class TimedStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_id: UUID = Field(description="Reuse this UUID when retrying to start the same attempt.")
    time_per_question: int | None = Field(
        default=None, ge=10, le=600, description="Seconds per question in sequential mode. Defaults to 60.",
    )
    duration_minutes: PaperDuration | None = Field(
        default=None, description="Minutes for the entire paper. Omit time_per_question when using it.", examples=[30],
    )

    @model_validator(mode="after")
    def check_clock(self) -> Self:
        if self.duration_minutes is not None and self.time_per_question is not None:
            raise ValueError("Choose either a paper duration or a per-question duration.")
        return self


class TimedAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: str
    selected_ids: list[str] = Field(default_factory=list, description="An expired question can be advanced without selections.")


class TimedPaperAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: str
    selected_ids: list[str] = Field(description="Send an empty list to clear the answer.", examples=[["q15-a"]])
    expected_version: AnswerVersion = Field(description="Last known version of this question's answer. Starts at zero.")
    write_id: UUID | None = Field(default=None, description="Identifies this save if its response is lost.")


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
    time_per_question: int = Field(default=60, ge=10, le=600)
    duration_minutes: PaperDuration | None = None
    answers: dict[str, list[str]] = Field(default_factory=dict)
    answer_versions: dict[str, AnswerVersion] = Field(default_factory=dict)
    answer_write_ids: dict[str, UUID] = Field(default_factory=dict)


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
    time_per_question: int = 60


class CompletedTimedTest(BaseModel):
    status: Literal["completed"] = "completed"
    result: TestResult


class ActiveTimedPaper(TestPaper):
    status: Literal["paper"] = "paper"
    attempt_id: UUID
    server_now: AwareDatetime
    deadline_at: AwareDatetime
    duration_minutes: PaperDuration
    answers: dict[str, list[str]]
    answer_versions: dict[str, AnswerVersion]


TimedTestState = Annotated[ActiveTimedTest | ActiveTimedPaper | CompletedTimedTest, Field(discriminator="status")]


class StartKeyConflict(BaseModel):
    code: Literal["start_id_reused"]


class TimedStartConflict(BaseModel):
    detail: Annotated[DraftTest | StartKeyConflict, Field(discriminator="code")]


class QuestionChanged(BaseModel):
    code: Literal["question_changed"]


class TimedAdvanceConflict(BaseModel):
    detail: QuestionChanged


class TimeRemaining(BaseModel):
    code: Literal["time_remaining"] = "time_remaining"
    server_now: AwareDatetime


class TimedFinishConflict(BaseModel):
    detail: TimeRemaining


class AnswerVersionChanged(BaseModel):
    code: Literal["answer_version_changed"] = "answer_version_changed"
    version: AnswerVersion
    selected_ids: list[str]
    write_id: UUID | None = None


class TimedPaperAnswerConflict(BaseModel):
    detail: AnswerVersionChanged


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
        time_per_question=progress.time_per_question,
    )


def paper_state(attempt: sqlite3.Row, progress: TimedProgress, duration: int, now: datetime) -> ActiveTimedPaper:
    return ActiveTimedPaper(
        attempt_id=UUID(attempt["id"]), set_id=attempt["set_id"], title=attempt["title"], revision=attempt["revision"],
        questions=[entry.question for entry in progress.questions], answers=progress.answers,
        answer_versions=progress.answer_versions,
        server_now=now, deadline_at=progress.deadline_at, duration_minutes=duration,
    )


def read_state(attempt: sqlite3.Row) -> TimedTestState:
    if attempt["result_json"] is not None:
        return CompletedTimedTest(result=TestResult.model_validate_json(attempt["result_json"]))
    progress = TimedProgress.model_validate_json(attempt["state_json"])
    if progress.duration_minutes is not None:
        return paper_state(attempt, progress, progress.duration_minutes, now_utc())
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
        seconds = command.time_per_question or 60
        duration = (
            timedelta(seconds=seconds) if command.duration_minutes is None else timedelta(minutes=command.duration_minutes)
        )
        progress = TimedProgress(
            questions=questions, deadline_at=now_utc() + duration,
            time_per_question=seconds, duration_minutes=command.duration_minutes,
        )
        create_timed_attempt(
            connection, attempt_id=attempt_id, username=user.username, start_id=command.start_id,
            set_id=set_id, title=bank.title, revision=bank.revision, total=len(questions),
            state_json=progress.model_dump_json(),
            timing_kind="sequential" if command.duration_minutes is None else "paper",
            time_per_question=seconds if command.duration_minutes is None else None,
        )
        return read_state(timed_attempt(connection, user.username, attempt_id))


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
        if attempt["timing_kind"] == "paper":
            raise question_changed()
        if attempt["result_json"] is not None:
            result = TestResult.model_validate_json(attempt["result_json"])
            if not any(question.id == answer.question_id for question in result.questions):
                raise question_changed()
            return CompletedTimedTest(result=result)

        if attempt["timing_kind"] != "sequential":
            raise question_changed()
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
            progress.deadline_at = now + timedelta(seconds=progress.time_per_question)
            save_timed_progress(connection, attempt_id, progress.model_dump_json())
            return active_state(attempt_id, attempt["title"], progress, now)

        graded = [
            grade_question(entry.question, selection.selected_ids, entry.correct_ids, timed_out=selection.timed_out)
            for entry, selection in zip(progress.questions, progress.selections, strict=True)
        ]
        result = build_result(
            attempt_id=attempt_id, mode="timed", set_id=attempt["set_id"], title=attempt["title"],
            revision=attempt["revision"], username=user.username, submitted_at=now, questions=graded,
            time_per_question=progress.time_per_question,
        )
        complete_timed_attempt(connection, result)
    return CompletedTimedTest(result=result)


def finish_paper(
    connection: sqlite3.Connection, attempt: sqlite3.Row, progress: TimedProgress, now: datetime,
) -> TestResult:
    expired = now >= progress.deadline_at
    graded = [
        grade_question(
            entry.question, progress.answers.get(entry.question.id, []), entry.correct_ids,
            timed_out=expired and entry.question.id not in progress.answers,
        )
        for entry in progress.questions
    ]
    result = build_result(
        attempt_id=UUID(attempt["id"]), mode="timed", set_id=attempt["set_id"], title=attempt["title"],
        revision=attempt["revision"], username=attempt["username"], submitted_at=now, questions=graded,
    )
    complete_timed_attempt(connection, result)
    return result


def read_paper_attempt(
    connection: sqlite3.Connection, username: str, attempt_id: UUID,
) -> tuple[sqlite3.Row, TimedProgress | TestResult]:
    attempt = timed_attempt(connection, username, attempt_id)
    if attempt["timing_kind"] != "paper":
        raise HTTPException(404, "Timed paper not found.")
    if attempt["result_json"] is not None:
        return attempt, TestResult.model_validate_json(attempt["result_json"])
    return attempt, TimedProgress.model_validate_json(attempt["state_json"])


@router.put(
    "/api/test-attempts/{attempt_id}/answer",
    responses={409: {"model": TimedPaperAnswerConflict, "description": "The answer has changed since the supplied version."}},
)
def save_timed_paper_answer(
    attempt_id: UUID, answer: TimedPaperAnswer, request: Request, response: Response,
    user: Annotated[User, Depends(require_user)],
) -> TestResult | None:
    """Save or clear any paper answer. Return the result if the paper has closed."""
    response.headers["Cache-Control"] = "no-store"
    received_at = now_utc()
    with closing(connect(request.app.state.database_path)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        attempt, progress = read_paper_attempt(connection, user.username, attempt_id)
        if isinstance(progress, TestResult):
            return progress
        if received_at >= progress.deadline_at:
            return finish_paper(connection, attempt, progress, now_utc())
        question = next(
            (entry.question for entry in progress.questions if entry.question.id == answer.question_id), None,
        )
        if question is None or (answer.selected_ids and not question.accepts(answer.selected_ids)):
            raise HTTPException(422, [{
                "type": "value_error", "loc": ["body", "selected_ids"], "msg": "Choose valid options for this question.",
            }])
        version = progress.answer_versions.get(answer.question_id, 0)
        if version != answer.expected_version:
            detail = AnswerVersionChanged(
                version=version, selected_ids=progress.answers.get(answer.question_id, []),
                write_id=progress.answer_write_ids.get(answer.question_id),
            )
            raise HTTPException(409, detail.model_dump(mode="json", exclude_none=True), headers={"Cache-Control": "no-store"})
        if answer.selected_ids:
            progress.answers[answer.question_id] = answer.selected_ids
        else:
            progress.answers.pop(answer.question_id, None)
        # Preserve the version of a cleared answer so delayed writes cannot bring it back.
        progress.answer_versions[answer.question_id] = version + 1
        if answer.write_id is None:
            progress.answer_write_ids.pop(answer.question_id, None)
        else:
            progress.answer_write_ids[answer.question_id] = answer.write_id
        save_timed_progress(connection, attempt_id, progress.model_dump_json())
    return None


@router.post(
    "/api/test-attempts/{attempt_id}/finish",
    responses={409: {"model": TimedFinishConflict, "description": "The requested automatic submission is early."}},
)
def finish_timed_paper(
    attempt_id: UUID, request: Request, response: Response, user: Annotated[User, Depends(require_user)],
    only_if_expired: Annotated[bool, Query(description="Keep the paper open if the server deadline has not passed.")] = False,
) -> TestResult:
    """Grade the saved answers and persist the timed result. Retries return the same result."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        attempt, progress = read_paper_attempt(connection, user.username, attempt_id)
        if isinstance(progress, TestResult):
            return progress
        now = now_utc()
        if only_if_expired and now < progress.deadline_at:
            raise HTTPException(
                409, TimeRemaining(server_now=now).model_dump(mode="json"), headers={"Cache-Control": "no-store"},
            )
        return finish_paper(connection, attempt, progress, now)
