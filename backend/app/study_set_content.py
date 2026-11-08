from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

TrimmedText = Annotated[str, StringConstraints(strip_whitespace=True)]
RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Revision = Annotated[int, Field(strict=True, ge=1, examples=[1])]


class OptionContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: TrimmedText
    is_correct: bool = Field(strict=True)


class QuestionContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: TrimmedText
    options: list[OptionContent]


class StudySetContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: RequiredText = Field(examples=["HTTP practice"])
    description: TrimmedText = ""
    questions: list[QuestionContent]


class CompleteOption(OptionContent):
    text: RequiredText


class CompleteQuestion(QuestionContent):
    prompt: RequiredText
    options: list[CompleteOption] = Field(min_length=1, description="At least one option must be marked correct.")

    @model_validator(mode="after")
    def require_correct_answer(self) -> "CompleteQuestion":
        if not any(option.is_correct for option in self.options):
            raise ValueError("Mark at least one option correct.")
        return self


class CompleteStudySet(StudySetContent):
    questions: list[CompleteQuestion] = Field(min_length=1)


class StudySetRevision(CompleteStudySet):
    revision: Revision


class StudySetEditor(StudySetContent):
    revision: Revision
    saved_at: datetime | None
