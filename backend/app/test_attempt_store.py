import sqlite3
from typing import Literal
from uuid import UUID

from .test_results import TestMode, TestResult


def read_attempt(connection: sqlite3.Connection, username: str, attempt_id: UUID) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM test_attempts WHERE username = ? AND id = ?",
        (username, str(attempt_id)),
    ).fetchone()


def read_attempt_by_key(
    connection: sqlite3.Connection, username: str, mode: TestMode, request_key: UUID,
) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM test_attempts WHERE username = ? AND mode = ? AND request_key = ?",
        (username, mode, str(request_key)),
    ).fetchone()


def read_completed_attempts(
    connection: sqlite3.Connection, username: str, limit: int, before: sqlite3.Row | None, *,
    set_id: str | None = None, legacy_set_id: str | None = None,
) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT id AS attempt_id, username AS submitted_by, mode, set_id, title, revision,
            submitted_at, score, total, time_per_question
        FROM test_attempts
        WHERE username = :username AND submitted_at IS NOT NULL
            AND (:set_id IS NULL OR set_id IN (:set_id, :legacy_set_id))
            AND (:before_time IS NULL OR (submitted_at, id) < (:before_time, :before_id))
        ORDER BY submitted_at DESC, id DESC
        LIMIT :limit
        """,
        {
            "username": username, "limit": limit,
            "set_id": set_id, "legacy_set_id": legacy_set_id,
            "before_time": before["submitted_at"] if before else None,
            "before_id": before["id"] if before else None,
        },
    ).fetchall()


def save_standard_result(
    connection: sqlite3.Connection, result: TestResult, request_key: UUID | None, request_hash: str | None,
) -> None:
    connection.execute(
        """
        INSERT INTO test_attempts (
            id, username, mode, request_key, request_hash, set_id, title, revision,
            total, submitted_at, score, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(result.attempt_id), result.submitted_by, result.mode, str(request_key) if request_key else None,
            request_hash, result.set_id, result.title, result.revision, result.total,
            result.submitted_at.isoformat(timespec="microseconds"), result.score,
            result.model_dump_json(exclude_none=True),
        ),
    )


def create_timed_attempt(
    connection: sqlite3.Connection, *, attempt_id: UUID, username: str, start_id: UUID,
    set_id: str, title: str, revision: int, total: int, state_json: str,
    timing_kind: Literal["sequential", "paper"], time_per_question: int | None,
) -> None:
    connection.execute(
        """
        INSERT INTO test_attempts (
            id, username, mode, request_key, set_id, title, revision, total, state_json, timing_kind, time_per_question
        )
        VALUES (?, ?, 'timed', ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (str(attempt_id), username, str(start_id), set_id, title, revision, total, state_json, timing_kind, time_per_question),
    )


def save_timed_progress(connection: sqlite3.Connection, attempt_id: UUID, state_json: str) -> None:
    connection.execute("UPDATE test_attempts SET state_json = ? WHERE id = ?", (state_json, str(attempt_id)))


def complete_timed_attempt(connection: sqlite3.Connection, result: TestResult) -> None:
    connection.execute(
        """
        UPDATE test_attempts SET state_json = NULL, submitted_at = ?, score = ?, result_json = ?
        WHERE id = ?
        """,
        (
            result.submitted_at.isoformat(timespec="microseconds"), result.score,
            result.model_dump_json(exclude_none=True), str(result.attempt_id),
        ),
    )
