import sqlite3
from dataclasses import dataclass
from random import Random
from unicodedata import normalize
from uuid import NAMESPACE_URL, uuid5

from pydantic import BaseModel, Field

from .database import read_study_questions, read_study_set


class Option(BaseModel):
    id: str
    text: str


def normalize_answer(text: str) -> str:
    return " ".join(normalize("NFC", text).split()).casefold()


class AnswerInput(BaseModel):
    selected_ids: list[str] | None = Field(default=None, min_length=1)
    answer_text: str | None = Field(default=None, description="Typed response for a question with no published options.")


class Question(BaseModel):
    id: str
    prompt: str
    options: list[Option] = Field(description="An empty list indicates a typed-answer question.")
    multiple: bool

    @property
    def written(self) -> bool:
        return len(self.options) == 1

    def for_study(self) -> "Question":
        return self.model_copy(update={"options": []}) if self.written else self

    def grade(self, answer: AnswerInput, correct_ids: list[str]) -> bool | None:
        if self.written:
            typed = normalize_answer(answer.answer_text or "")
            if answer.selected_ids is not None or not typed:
                return None
            return typed == normalize_answer(self.options[0].text)
        if answer.answer_text is not None or answer.selected_ids is None or not self.accepts(answer.selected_ids):
            return None
        return set(answer.selected_ids) == set(correct_ids)

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


def answer_kind(text: str) -> str:
    try:
        float(text)
    except ValueError:
        return "phrase" if any(char.isspace() for char in text) else "word"
    return "number"


def fill_choices(bank: QuestionBank) -> None:
    written_questions = [question for question in bank.questions.values() if question.written]
    if not written_questions:
        return
    candidates: dict[str, dict[str, str]] = {}
    answers_by_prompt: dict[str, set[str]] = {}
    for question in bank.questions.values():
        key = bank.correct_ids[question.id]
        answers = [option.text for option in question.options if option.id in key]
        answers_by_prompt.setdefault(normalize_answer(question.prompt), set()).update(map(normalize_answer, answers))
        if len(answers) == 1:
            answer = answers[0]
            candidates.setdefault(answer_kind(answer), {}).setdefault(normalize_answer(answer), answer)

    for question in written_questions:
        answer = question.options[0].text
        pool = candidates.get(answer_kind(answer), {})
        known_correct = answers_by_prompt[normalize_answer(question.prompt)]
        alternatives = [text for normalized, text in pool.items() if normalized not in known_correct]
        if not alternatives:
            continue
        # GET, grading and resumed Learn steps must reconstruct the same choices for a revision.
        seed = f"janeq:{bank.id}:{bank.revision}:{question.id}"
        random = Random(seed)
        choices = [answer, *random.sample(alternatives, min(3, len(alternatives)))]
        random.shuffle(choices)
        question.options = [Option(id=str(uuid5(NAMESPACE_URL, f"{seed}:{index}")), text=text) for index, text in enumerate(choices)]
        bank.correct_ids[question.id] = [option.id for option in question.options if option.text == answer]


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
    bank = QuestionBank(study_set["id"], study_set["title"], study_set["revision"], questions, correct_ids, len(remaining))
    if bank.ready and study_set["source_kind"] == "custom":
        fill_choices(bank)
    return bank
