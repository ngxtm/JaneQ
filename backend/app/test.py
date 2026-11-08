import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from .auth import AuthError, SESSION_REQUIRED_RESPONSES, User, require_user
from .database import connect
from .question_bank import Question, QuestionBank, read_question_bank


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
    answers: list[TestAnswer] = Field(min_length=1, examples=[[
        {"question_id": "q15", "selected_ids": ["q15-a"]},
        {"question_id": "q16", "selected_ids": ["q16-a"]},
        {"question_id": "q24", "selected_ids": ["q24-a"]},
    ]])


class GradedQuestion(Question):
    selected_ids: list[str]
    correct_ids: list[str]
    correct: bool


class TestResult(BaseModel):
    set_id: str
    title: str
    revision: int
    score: int
    total: int
    submitted_by: str = Field(description="Username from the signed session.", examples=["review"])
    submitted_at: AwareDatetime = Field(
        description="Server time when the successful submission was received, in UTC.",
        examples=["2026-11-08T09:30:00Z"],
    )
    questions: list[GradedQuestion]


class DraftTest(BaseModel):
    code: Literal["draft"]
    remaining_questions: int


class StaleTest(BaseModel):
    code: Literal["revision_changed"]


class DraftError(BaseModel):
    detail: DraftTest


class SubmissionConflict(BaseModel):
    detail: Annotated[DraftTest | StaleTest, Field(discriminator="code")]


router = APIRouter(
    prefix="/api/study-sets/{set_id}/test",
    tags=["test"],
    responses={
        **SESSION_REQUIRED_RESPONSES,
        404: {"model": AuthError, "description": "Study set not found."},
    },
)


def ready_bank(connection: sqlite3.Connection, set_id: str) -> QuestionBank:
    bank = read_question_bank(connection, set_id)
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

    results = []
    for question_id, question in bank.questions.items():
        selected = set(selections[question_id])
        correct_ids = bank.correct_ids[question_id]
        results.append(GradedQuestion(
            **question.model_dump(),
            selected_ids=[option.id for option in question.options if option.id in selected],
            correct_ids=correct_ids,
            correct=selected == set(correct_ids),
        ))
    return results


@router.get(
    "",
    dependencies=[Depends(require_user)],
    responses={409: {"model": DraftError, "description": "The study set is Draft."}},
)
def get_test(set_id: str, request: Request, response: Response) -> TestPaper:
    """Load the ordered questions and selection types for a Ready study set."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        # Keep the revision and ordered question rows in the same SQLite snapshot.
        connection.execute("BEGIN")
        bank = ready_bank(connection, set_id)
    return TestPaper(set_id=set_id, title=bank.title, revision=bank.revision, questions=list(bank.questions.values()))


@router.post("", responses={409: {"model": SubmissionConflict, "description": "The set is Draft or the revision changed."}})
def submit_test(
    set_id: str, submission: TestSubmission, request: Request, response: Response,
    user: Annotated[User, Depends(require_user)],
) -> TestResult:
    """Grade every question against the submitted revision and return the complete review."""
    response.headers["Cache-Control"] = "no-store"
    submitted_at = datetime.now(UTC)
    with closing(connect(request.app.state.database_path)) as connection, connection:
        connection.execute("BEGIN")
        bank = ready_bank(connection, set_id)
        if submission.revision != bank.revision:
            raise HTTPException(409, StaleTest(code="revision_changed").model_dump())
        questions = grade_test(bank, submission)
    return TestResult(
        set_id=set_id, title=bank.title, revision=bank.revision,
        score=sum(question.correct for question in questions), total=len(questions), questions=questions,
        submitted_by=user.username, submitted_at=submitted_at,
    )
