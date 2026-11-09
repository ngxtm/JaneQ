from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field

from .question_bank import Question

TestMode = Literal["standard", "timed"]


class GradedQuestion(Question):
    selected_ids: list[str]
    correct_ids: list[str]
    correct: bool
    timed_out: bool | None = Field(default=None, description="Present for Timed Test questions.")


class TestAttemptSummary(BaseModel):
    attempt_id: UUID
    mode: TestMode
    set_id: str
    title: str
    revision: int
    score: int
    total: int
    submitted_by: str = Field(description="Username from the signed session.", examples=["review"])
    submitted_at: AwareDatetime = Field(
        description="Server time when the attempt was completed, in UTC.",
        examples=["2026-11-08T09:30:00Z"],
    )


class TestResult(TestAttemptSummary):
    questions: list[GradedQuestion]


def grade_question(
    question: Question, selected_ids: list[str], correct_ids: list[str], *, timed_out: bool | None = None,
) -> GradedQuestion:
    selected = set(selected_ids)
    return GradedQuestion(
        **question.model_dump(),
        selected_ids=[option.id for option in question.options if option.id in selected],
        correct_ids=correct_ids,
        correct=not timed_out and selected == set(correct_ids),
        timed_out=timed_out,
    )


def build_result(
    attempt_id: UUID, mode: TestMode, set_id: str, title: str, revision: int,
    username: str, submitted_at: datetime, questions: list[GradedQuestion],
) -> TestResult:
    return TestResult(
        attempt_id=attempt_id, mode=mode, set_id=set_id, title=title, revision=revision,
        score=sum(question.correct for question in questions), total=len(questions),
        submitted_by=username, submitted_at=submitted_at, questions=questions,
    )
