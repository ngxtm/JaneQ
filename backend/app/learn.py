import sqlite3
from contextlib import closing
from random import shuffle
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from .auth import AuthError, SESSION_REQUIRED_RESPONSES, User, require_user
from .database import connect, read_learn_progress, save_learn_progress
from .question_bank import Question, QuestionBank, read_question_bank

router = APIRouter(
    prefix="/api/study-sets/{set_id}",
    tags=["learn"],
    responses={
        **SESSION_REQUIRED_RESPONSES,
        404: {"model": AuthError, "description": "Study set not found."},
        409: {"model": AuthError, "description": "The set is Draft or this Learn step has changed."},
    },
)

Phase = Literal["question", "feedback", "summary", "complete"]


class StudyCard(BaseModel):
    id: str
    prompt: str
    answers: list[str]


class Answer(BaseModel):
    question_id: str
    selected_ids: list[str]
    correct: bool


class LearnProgress(BaseModel):
    round: int = 1
    version: str | None = None
    phase: Phase = "question"
    queue: list[str]
    answers: list[Answer] = Field(default_factory=list)
    studied_ids: set[str] = Field(default_factory=set)
    mastery: dict[str, Literal[1, 2]] = Field(default_factory=dict)
    shuffle: bool = False


class Feedback(BaseModel):
    correct: bool
    selected_ids: list[str]
    correct_ids: list[str]


class RoundReview(StudyCard):
    correct: bool


class LearnView(BaseModel):
    revision: int
    version: str | None
    revision_changed: bool
    phase: Phase
    round: int
    round_size: int
    round_answered: int
    total_questions: int
    studied: int
    familiar: int
    mastered: int
    shuffle: bool
    question: Question | None
    feedback: Feedback | None
    review: list[RoundReview]


class LearnAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(examples=[1])
    version: str | None = Field(examples=[None])


class CheckAnswer(LearnAction):
    action: Literal["check"]
    selected_ids: list[str] = Field(min_length=1, examples=[["q15-a"]])


class Advance(LearnAction):
    action: Literal["advance"]


class Reset(LearnAction):
    action: Literal["reset"]


class ChangeSettings(LearnAction):
    action: Literal["settings"]
    shuffle: bool


Command = Annotated[CheckAnswer | Advance | Reset | ChangeSettings, Field(discriminator="action")]


def ready_bank(
    connection: sqlite3.Connection, set_id: str
) -> QuestionBank:
    bank = read_question_bank(connection, set_id)
    if bank is None:
        raise HTTPException(404, "Study set not found.")
    if not bank.ready:
        raise HTTPException(409, "This set is a draft. Finish setting it up before studying.")
    return bank


def study_card(question: Question, correct_ids: list[str]) -> StudyCard:
    return StudyCard(
        id=question.id, prompt=question.prompt,
        answers=[option.text for option in question.options if option.id in correct_ids],
    )


def start_round(question_ids: list[str], shuffle_questions: bool) -> list[str]:
    if shuffle_questions:
        shuffle(question_ids)
    return question_ids


def apply_command(
    progress: LearnProgress, command: Command, questions: dict[str, Question], correct_ids: dict[str, list[str]]
) -> LearnProgress:
    if isinstance(command, Reset):
        return LearnProgress(queue=start_round(list(questions), progress.shuffle), shuffle=progress.shuffle)
    if isinstance(command, ChangeSettings):
        progress.shuffle = command.shuffle
        return progress
    if isinstance(command, CheckAnswer) and progress.phase == "question":
        question_id = progress.queue[len(progress.answers)]
        question = questions[question_id]
        if not question.accepts(command.selected_ids):
            raise HTTPException(422, [{
                "type": "value_error", "loc": ["body", "selected_ids"],
                "msg": "Choose valid options for the current question.",
            }])
        correct = set(command.selected_ids) == set(correct_ids[question_id])
        if correct:
            progress.mastery[question_id] = 2 if question_id in progress.mastery else 1
        progress.studied_ids.add(question_id)
        progress.answers.append(Answer(question_id=question_id, selected_ids=command.selected_ids, correct=correct))
        progress.phase = "feedback"
        return progress
    if isinstance(command, Advance) and progress.phase == "feedback":
        if len(progress.answers) < len(progress.queue):
            progress.phase = "question"
        elif all(progress.mastery.get(question_id) == 2 for question_id in questions):
            progress.phase = "complete"
        else:
            progress.phase = "summary"
        return progress
    if isinstance(command, Advance) and progress.phase == "summary":
        remaining = [question_id for question_id in questions if progress.mastery.get(question_id) != 2]
        progress.queue = start_round(remaining, progress.shuffle)
        progress.answers = []
        progress.round += 1
        progress.phase = "question"
        return progress
    raise HTTPException(409, "This Learn step has changed. Reload your progress.")


def learn_view(
    progress: LearnProgress, revision: int, revision_changed: bool,
    questions: dict[str, Question], correct_ids: dict[str, list[str]],
) -> LearnView:
    question = None
    feedback = None
    review = []
    if progress.phase == "question":
        question = questions[progress.queue[len(progress.answers)]]
    elif progress.phase == "feedback":
        answer = progress.answers[-1]
        question = questions[answer.question_id]
        feedback = Feedback(
            correct=answer.correct, selected_ids=answer.selected_ids, correct_ids=correct_ids[answer.question_id],
        )
    elif progress.phase == "summary":
        for answer in progress.answers:
            card = study_card(questions[answer.question_id], correct_ids[answer.question_id])
            review.append(RoundReview(**card.model_dump(), correct=answer.correct))

    return LearnView(
        revision=revision, version=progress.version, revision_changed=revision_changed,
        phase=progress.phase, round=progress.round, round_size=len(progress.queue),
        round_answered=len(progress.answers), total_questions=len(questions),
        studied=len(progress.studied_ids),
        familiar=sum(value == 1 for value in progress.mastery.values()),
        mastered=sum(value == 2 for value in progress.mastery.values()),
        shuffle=progress.shuffle, question=question, feedback=feedback, review=review,
    )


@router.get("/preview")
def get_preview(
    set_id: str, request: Request, response: Response, user: Annotated[User, Depends(require_user)],
) -> list[StudyCard]:
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        connection.execute("BEGIN")
        bank = ready_bank(connection, set_id)
        return [study_card(question, bank.correct_ids[question.id]) for question in bank.questions.values()]


def load_progress(
    connection: sqlite3.Connection, username: str, set_id: str, revision: int, questions: dict[str, Question],
) -> tuple[LearnProgress, bool]:
    saved = read_learn_progress(connection, username, set_id)
    if saved is not None and saved["revision"] == revision:
        return LearnProgress.model_validate_json(saved["state_json"]), False
    return LearnProgress(queue=list(questions)), saved is not None


@router.get("/learn")
def get_learn(
    set_id: str, request: Request, response: Response, user: Annotated[User, Depends(require_user)],
) -> LearnView:
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        connection.execute("BEGIN")
        bank = ready_bank(connection, set_id)
        progress, changed = load_progress(connection, user.username, bank.id, bank.revision, bank.questions)
        return learn_view(progress, bank.revision, changed, bank.questions, bank.correct_ids)


@router.post("/learn")
def update_learn(
    set_id: str, command: Command, request: Request, response: Response, user: Annotated[User, Depends(require_user)],
) -> LearnView:
    """Check an answer, continue, update settings, or reset the saved Learn session."""
    response.headers["Cache-Control"] = "no-store"
    with closing(connect(request.app.state.database_path)) as connection, connection:
        # Check the revision and step under the same write lock as the progress update.
        connection.execute("BEGIN IMMEDIATE")
        bank = ready_bank(connection, set_id)
        progress, _ = load_progress(connection, user.username, bank.id, bank.revision, bank.questions)
        if command.revision != bank.revision or command.version != progress.version:
            raise HTTPException(409, "This Learn step has changed. Reload your progress.")
        progress = apply_command(progress, command, bank.questions, bank.correct_ids)
        progress.version = uuid4().hex
        save_learn_progress(connection, user.username, bank.id, bank.revision, progress.model_dump_json())
        return learn_view(progress, bank.revision, False, bank.questions, bank.correct_ids)
