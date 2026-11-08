import sqlite3
from dataclasses import dataclass

from pydantic import BaseModel

from .database import read_study_questions, read_study_set


class Option(BaseModel):
    id: str
    text: str


class Question(BaseModel):
    id: str
    prompt: str
    options: list[Option]
    multiple: bool

    def accepts(self, selected_ids: list[str]) -> bool:
        selected = set(selected_ids)
        return (
            bool(selected)
            and len(selected) == len(selected_ids)
            and (self.multiple or len(selected) == 1)
            and selected.issubset(option.id for option in self.options)
        )


@dataclass
class QuestionBank:
    id: str
    title: str
    revision: int
    questions: dict[str, Question]
    correct_ids: dict[str, list[str]]
    remaining_questions: int

    @property
    def ready(self) -> bool:
        return bool(self.questions) and self.remaining_questions == 0


def read_question_bank(connection: sqlite3.Connection, set_id: str, username: str) -> QuestionBank | None:
    study_set = read_study_set(connection, set_id, username)
    if study_set is None:
        return None

    rows = read_study_questions(connection, study_set["id"])
    remaining = {row["id"] for row in rows if not row["configured"]}
    questions: dict[str, Question] = {}
    correct_ids: dict[str, list[str]] = {}
    for row in rows:
        question_id = row["id"]
        if question_id not in questions:
            questions[question_id] = Question(id=question_id, prompt=row["prompt"], options=[], multiple=False)
            correct_ids[question_id] = []
        if row["option_id"] is not None:
            questions[question_id].options.append(Option(id=row["option_id"], text=row["text"]))
            if row["is_correct"]:
                correct_ids[question_id].append(row["option_id"])

    for question_id, question in questions.items():
        question.multiple = len(correct_ids[question_id]) > 1
    return QuestionBank(study_set["id"], study_set["title"], study_set["revision"], questions, correct_ids, len(remaining))
