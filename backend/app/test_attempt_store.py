import sqlite3
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
    connection: sqlite3.Connection, username: str, limit: int, before: sqlite3.Row | None,
) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT id AS attempt_id, username AS submitted_by, mode, set_id, title, revision,
            submitted_at, score, total
        FROM test_attempts
        WHERE username = :username AND submitted_at IS NOT NULL
            AND (:before_time IS NULL OR (submitted_at, id) < (:before_time, :before_id))
        ORDER BY submitted_at DESC, id DESC
        LIMIT :limit
        """,
        {
            "username": username, "limit": limit,
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
