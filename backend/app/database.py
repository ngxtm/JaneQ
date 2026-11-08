import json
import sqlite3
from contextlib import closing
from pathlib import Path
from uuid import UUID, uuid4, uuid5

from .study_set_content import OptionContent, QuestionContent, StudySetContent, StudySetEditor, StudySetRevision

BUILTIN_SETS_DIR = Path(__file__).with_name("builtin_sets")
SEED_NAME = "builtin_catalog"
STUDY_SET_NAMESPACE = UUID("9bcc275f-37db-4835-998b-ea87df42f6f7")
CUSTOM_SET_NAMESPACE = UUID("f4b41117-0ff5-4df8-9146-fce50f20eac0")

SCHEMA = """
CREATE TABLE IF NOT EXISTS study_sets (
    id TEXT PRIMARY KEY,
    legacy_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    saved_at TEXT,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('builtin', 'custom')),
    owner_username TEXT,
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
                AND COUNT(CASE WHEN trim(o.text) <> '' AND o.is_correct = 1 THEN 1 END) > 0
            THEN 1 ELSE 0
        END AS configured
    FROM questions AS q
    LEFT JOIN answer_options AS o ON o.question_id = q.id
    GROUP BY q.id
"""

VISIBLE_STUDY_SETS = "(source_kind = 'builtin' OR owner_username = :username)"


def connect(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def upgrade_study_sets(connection: sqlite3.Connection) -> None:
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(study_sets)")}
    if "owner_username" not in columns:
        connection.execute("ALTER TABLE study_sets ADD COLUMN owner_username TEXT")
    if "saved_at" not in columns:
        connection.execute("ALTER TABLE study_sets ADD COLUMN saved_at TEXT")
    if "legacy_id" not in columns:
        connection.execute("ALTER TABLE study_sets ADD COLUMN legacy_id TEXT")
        # The parent and both referencing tables must change in the same transaction.
        connection.execute("PRAGMA defer_foreign_keys = ON")
        for row in connection.execute("SELECT id FROM study_sets").fetchall():
            old_id = row["id"]
            new_id = str(uuid5(STUDY_SET_NAMESPACE, old_id))
            connection.execute("UPDATE study_sets SET id = ?, legacy_id = ? WHERE id = ?", (new_id, old_id, old_id))
            connection.execute("UPDATE questions SET study_set_id = ? WHERE study_set_id = ?", (new_id, old_id))
            connection.execute("UPDATE learn_progress SET study_set_id = ? WHERE study_set_id = ?", (new_id, old_id))
    connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS study_sets_legacy_id ON study_sets(legacy_id)")


def initialize_database(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect(path)) as connection, connection:
        # Acquire the write lock before checking the seed marker.
        connection.executescript("BEGIN IMMEDIATE;\n" + SCHEMA)
        upgrade_study_sets(connection)
        already_seeded = connection.execute(
            "SELECT 1 FROM seed_history WHERE name = ?", (SEED_NAME,)
        ).fetchone()
        if already_seeded:
            return

        if connection.execute("SELECT 1 FROM study_sets LIMIT 1").fetchone():
            raise RuntimeError("The MVP catalog requires a fresh SQLite file. Set JANEQ_DB_PATH to a new path.")

        source_paths = sorted(BUILTIN_SETS_DIR.glob("*.json"))
        if not source_paths:
            raise RuntimeError("The built-in question bank is missing.")

        for source_path in source_paths:
            study_set = json.loads(source_path.read_text(encoding="utf-8"))
            legacy_id = study_set["id"]
            set_id = str(uuid5(STUDY_SET_NAMESPACE, legacy_id))
            connection.execute(
                "INSERT INTO study_sets (id, legacy_id, title, source_kind) VALUES (?, ?, ?, 'builtin')",
                (set_id, legacy_id, study_set["title"]),
            )
            for position, row in enumerate(study_set["questions"], start=1):
                seed_question(connection, set_id, position, row)
        connection.execute("INSERT INTO seed_history (name) VALUES (?)", (SEED_NAME,))


def seed_question(
    connection: sqlite3.Connection, set_id: str, position: int, row: dict,
) -> None:
    question_id = row["id"]
    prompt = row["question"]
    options = row["options"]
    correct_ids = set(row["correctOptionIds"])
    if (
        not prompt.strip() or len(options) < 2 or any(not text.strip() for text in options.values())
        or not correct_ids or not correct_ids.issubset(options)
    ):
        raise ValueError(f"Invalid built-in question: {question_id}")
    connection.execute(
        "INSERT INTO questions (id, study_set_id, prompt, position) VALUES (?, ?, ?, ?)",
        (question_id, set_id, prompt, position),
    )
    connection.executemany(
        """
        INSERT INTO answer_options (id, question_id, text, position, is_correct)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            (f"{question_id}-{option_id}", question_id, text, index, option_id in correct_ids)
            for index, (option_id, text) in enumerate(options.items())
        ),
    )


def read_study_set_summaries(
    connection: sqlite3.Connection, username: str, set_id: str | None = None,
) -> list[sqlite3.Row]:
    return connection.execute(
        f"""
        WITH question_status AS ({QUESTION_STATUS})
        SELECT s.id, s.legacy_id, s.title, s.description, s.source_kind, s.revision,
            COUNT(q.id) AS question_count,
            COALESCE(SUM(q.configured), 0) AS configured_count,
            CASE
                WHEN COUNT(q.id) > 0 AND COUNT(q.id) = SUM(q.configured) THEN 'ready'
                ELSE 'draft'
            END AS status
        FROM study_sets AS s
        LEFT JOIN question_status AS q ON q.study_set_id = s.id
        WHERE {VISIBLE_STUDY_SETS} AND (:id IS NULL OR s.id = :id)
        GROUP BY s.id
        ORDER BY s.title COLLATE NOCASE, s.id
        """,
        {"username": username, "id": set_id},
    ).fetchall()


def read_study_set(connection: sqlite3.Connection, set_id: str, username: str) -> sqlite3.Row | None:
    return connection.execute(
        f"""
        SELECT id, title, description, saved_at, source_kind, revision FROM study_sets
        WHERE (id = :id OR legacy_id = :id) AND {VISIBLE_STUDY_SETS}
        ORDER BY id = :id DESC LIMIT 1
        """,
        {"id": set_id, "username": username},
    ).fetchone()


def read_study_set_editor(connection: sqlite3.Connection, study_set: sqlite3.Row) -> StudySetEditor:
    rows = connection.execute(
        """
        SELECT q.id, q.prompt, o.id AS option_id, o.text, o.is_correct
        FROM questions AS q
        LEFT JOIN answer_options AS o ON o.question_id = q.id
        WHERE q.study_set_id = ?
        ORDER BY q.position, o.position
        """,
        (study_set["id"],),
    )
    questions: dict[str, QuestionContent] = {}
    for row in rows:
        if row["id"] not in questions:
            questions[row["id"]] = QuestionContent(prompt=row["prompt"], options=[])
        if row["option_id"] is not None:
            questions[row["id"]].options.append(OptionContent(text=row["text"], is_correct=bool(row["is_correct"])))
    return StudySetEditor(
        title=study_set["title"], description=study_set["description"],
        saved_at=study_set["saved_at"],
        revision=study_set["revision"], questions=list(questions.values()),
    )


def create_study_set(
    connection: sqlite3.Connection, username: str, content: StudySetContent, idempotency_key: UUID | None,
) -> str | None:
    set_id = str(uuid4())
    if idempotency_key is not None:
        # A retry from the same editor and account resolves to the same set.
        set_id = str(uuid5(CUSTOM_SET_NAMESPACE, json.dumps([username, str(idempotency_key)])))
        existing = read_study_set(connection, set_id, username)
        if existing is not None:
            saved = read_study_set_editor(connection, existing)
            return set_id if saved.model_dump(exclude={"revision", "saved_at"}) == content.model_dump() else None
    connection.execute(
        """
        INSERT INTO study_sets (id, title, description, source_kind, owner_username, saved_at)
        VALUES (?, ?, ?, 'custom', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        """,
        (set_id, content.title, content.description, username),
    )
    write_study_questions(connection, set_id, content.questions)
    return set_id


def update_study_set(
    connection: sqlite3.Connection, set_id: str, current: StudySetEditor, updated: StudySetRevision,
) -> None:
    previous_content = current.model_dump(exclude={"saved_at"})
    next_content = updated.model_dump()
    if previous_content == next_content:
        return
    connection.execute(
        """
        UPDATE study_sets SET title = ?, description = ?, revision = revision + 1,
            saved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
        """,
        (updated.title, updated.description, set_id),
    )
    if previous_content["questions"] != next_content["questions"]:
        # Replacing the question tree is atomic and the new revision invalidates older papers.
        connection.execute("DELETE FROM questions WHERE study_set_id = ?", (set_id,))
        write_study_questions(connection, set_id, updated.questions)


def delete_study_set(connection: sqlite3.Connection, set_id: str) -> None:
    connection.execute("DELETE FROM study_sets WHERE id = ?", (set_id,))


def write_study_questions(connection: sqlite3.Connection, set_id: str, questions: list[QuestionContent]) -> None:
    for position, question in enumerate(questions, start=1):
        question_id = str(uuid4())
        connection.execute(
            "INSERT INTO questions (id, study_set_id, prompt, position) VALUES (?, ?, ?, ?)",
            (question_id, set_id, question.prompt, position),
        )
        connection.executemany(
            "INSERT INTO answer_options (id, question_id, text, position, is_correct) VALUES (?, ?, ?, ?, ?)",
            (
                (str(uuid4()), question_id, option.text, index, option.is_correct)
                for index, option in enumerate(question.options, start=1)
            ),
        )


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
