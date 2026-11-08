from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

TrimmedText = Annotated[str, StringConstraints(strip_whitespace=True)]


class OptionContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: TrimmedText
    is_correct: bool = Field(strict=True)

    @model_validator(mode="after")
    def validate_correct_option(self) -> "OptionContent":
        if self.is_correct and not self.text:
            raise ValueError("Enter text before marking an option correct.")
        return self


class QuestionContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: TrimmedText
    options: list[OptionContent]


class StudySetContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)] = Field(examples=["HTTP practice"])
    description: TrimmedText = ""
    questions: list[QuestionContent]


class StudySetRevision(StudySetContent):
    revision: int = Field(strict=True, ge=1, examples=[1])


class StudySetEditor(StudySetRevision):
    saved_at: datetime | None
