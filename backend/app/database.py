import json
import re
import sqlite3
from contextlib import closing
from pathlib import Path
from string import ascii_lowercase

SOURCE_FILE = Path(__file__).with_name("questions_en.json")
SEED_NAME = "builtin_questions_v1"

SCHEMA = """
CREATE TABLE IF NOT EXISTS study_sets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    source_kind TEXT NOT NULL CHECK (source_kind IN ('builtin', 'custom')),
    revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    study_set_id TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    position INTEGER NOT NULL,
    UNIQUE (study_set_id, position)
);
CREATE TABLE IF NOT EXISTS answer_options (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    position INTEGER NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
    UNIQUE (question_id, position)
);
CREATE TABLE IF NOT EXISTS seed_history (name TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS learn_progress (
    username TEXT NOT NULL,
    study_set_id TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    state_json TEXT NOT NULL,
    PRIMARY KEY (username, study_set_id)
);
"""

QUESTION_STATUS = """
    SELECT q.id, q.study_set_id,
        CASE
            WHEN trim(q.prompt) <> ''
                AND COUNT(CASE WHEN trim(o.text) <> '' THEN 1 END) >= 2
                AND COUNT(CASE WHEN trim(o.text) <> '' AND o.is_correct = 1 THEN 1 END) > 0
            THEN 1 ELSE 0
        END AS configured
    FROM questions AS q
    LEFT JOIN answer_options AS o ON o.question_id = q.id
    GROUP BY q.id
"""


def connect(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect(path)) as connection, connection:
        # Acquire the write lock before checking the seed marker.
        connection.executescript("BEGIN IMMEDIATE;\n" + SCHEMA)
        already_seeded = connection.execute(
            "SELECT 1 FROM seed_history WHERE name = ?", (SEED_NAME,)
        ).fetchone()
        if already_seeded:
            return

        rows = json.loads(SOURCE_FILE.read_text(encoding="utf-8-sig"))["questions"]
        set_ids = {}
        for index, row in enumerate(rows, start=1):
            title = row["type"]
            if title not in set_ids:
                set_ids[title] = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
                connection.execute(
                    "INSERT INTO study_sets (id, title, source_kind) VALUES (?, ?, 'builtin')",
                    (set_ids[title], title),
                )

            # The answer review refers to the original positions of questions and options.
            question_id = f"q{index:02d}"
            connection.execute(
                "INSERT INTO questions (id, study_set_id, prompt, position) VALUES (?, ?, ?, ?)",
                (question_id, set_ids[title], row["question"], index),
            )
            connection.executemany(
                """
                INSERT INTO answer_options (id, question_id, text, position)
                VALUES (?, ?, ?, ?)
                """,
                (
                    (f"{question_id}-{ascii_lowercase[position]}", question_id, option, position)
                    for position, option in enumerate(row["options"])
                ),
            )

        connection.execute("INSERT INTO seed_history (name) VALUES (?)", (SEED_NAME,))


def list_study_sets(path: Path) -> list[sqlite3.Row]:
    with closing(connect(path)) as connection:
        return connection.execute(
            f"""
            WITH question_status AS ({QUESTION_STATUS})
            SELECT s.id, s.title, s.description, s.source_kind,
                COUNT(q.id) AS question_count,
                COALESCE(SUM(q.configured), 0) AS configured_count,
                CASE
                    WHEN COUNT(q.id) > 0 AND COUNT(q.id) = SUM(q.configured) THEN 'ready'
                    ELSE 'draft'
                END AS status
            FROM study_sets AS s
            LEFT JOIN question_status AS q ON q.study_set_id = s.id
            GROUP BY s.id
            ORDER BY s.title COLLATE NOCASE, s.id
            """
        ).fetchall()


def read_study_set(connection: sqlite3.Connection, set_id: str) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT id, title, source_kind, revision FROM study_sets WHERE id = ?", (set_id,)
    ).fetchone()


def read_study_questions(connection: sqlite3.Connection, set_id: str) -> list[sqlite3.Row]:
    return connection.execute(
        f"""
        WITH question_status AS ({QUESTION_STATUS})
        SELECT q.id, q.prompt, qs.configured, o.id AS option_id, o.text, o.is_correct
        FROM questions AS q
        JOIN question_status AS qs ON qs.id = q.id
        LEFT JOIN answer_options AS o ON o.question_id = q.id AND trim(o.text) <> ''
        WHERE q.study_set_id = ?
        ORDER BY q.position, o.position
        """,
        (set_id,),
    ).fetchall()


def read_learn_progress(connection: sqlite3.Connection, username: str, set_id: str) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT revision, state_json FROM learn_progress WHERE username = ? AND study_set_id = ?",
        (username, set_id),
    ).fetchone()


def write_answer_key(
    connection: sqlite3.Connection, set_id: str, changes: list[tuple[bool, str]],
) -> None:
    connection.executemany("UPDATE answer_options SET is_correct = ? WHERE id = ?", changes)
    connection.execute("UPDATE study_sets SET revision = revision + 1 WHERE id = ?", (set_id,))


def save_learn_progress(
    connection: sqlite3.Connection, username: str, set_id: str, revision: int, state_json: str
) -> None:
    connection.execute(
        """
        INSERT INTO learn_progress (username, study_set_id, revision, state_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (username, study_set_id) DO UPDATE
        SET revision = excluded.revision, state_json = excluded.state_json
        """,
        (username, set_id, revision, state_json),
    )
