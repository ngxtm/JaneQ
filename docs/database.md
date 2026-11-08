# JaneQ database

## Location and source of truth

JaneQ uses SQLite through Python's `sqlite3` module. The default file is `backend/data/janeq-mvp.sqlite3`. `JANEQ_DB_PATH` can point to another file. Relative values are resolved from `backend/`. [App configuration](../backend/app/main.py)

`SCHEMA` in [database.py](../backend/app/database.py) defines the tables. `connect()` enables foreign key enforcement on each application connection. During FastAPI startup, `initialize_database()` creates missing tables and seeds the built-in sets in a fresh file.

## Tables and relationships

```text
study_sets 1 ──── * questions 1 ──── * answer_options
study_sets 1 ──── * learn_progress
seed_history tracks completed seed runs independently.
```

| Table | Columns | Constraints and purpose |
| --- | --- | --- |
| `study_sets` | `id TEXT`, `legacy_id TEXT`, `title TEXT`, `description TEXT`, `source_kind TEXT`, `owner_username TEXT`, `revision INTEGER` | `id` is the canonical UUID primary key. `legacy_id` is nullable and unique when present. `title` is required and may repeat. `description` defaults to `''`, `revision` to `1`. `source_kind` accepts `builtin` or `custom`. `owner_username` is nullable and set from the signed session when creating a custom set. |
| `questions` | `id TEXT`, `study_set_id TEXT`, `prompt TEXT`, `position INTEGER` | `id` is the primary key. The other columns are required. `study_set_id` references `study_sets.id` with `ON DELETE CASCADE`. A position is unique within a study set. |
| `answer_options` | `id TEXT`, `question_id TEXT`, `text TEXT`, `position INTEGER`, `is_correct INTEGER` | `id` is the primary key. The other columns are required. `question_id` references `questions.id` with `ON DELETE CASCADE`. A position is unique within a question. `is_correct` accepts `0` or `1` and defaults to `0`. |
| `seed_history` | `name TEXT` | `name` is the primary key. `builtin_catalog` marks completion of the MVP seed. |
| `learn_progress` | `username TEXT`, `study_set_id TEXT`, `revision INTEGER`, `state_json TEXT` | All columns are required. The composite primary key is `(username, study_set_id)`. `study_set_id` references `study_sets.id` with `ON DELETE CASCADE`. |

Deleting a study set cascades to its questions and their answer options when foreign keys are enabled. The schema allows several options for a question to be marked correct.

## Built-in data and startup

- The [catalog](../backend/app/builtin_sets) has one JSON file per set. Each file supplies its set and question IDs. Question and option positions follow source order. Option IDs join the question ID and its local choice ID. The seed sets `answer_options.is_correct` for each choice listed in `correctOptionIds`, so all 18 sets start Ready.
- Startup acquires a write lock before checking `seed_history`. The seed inserts the catalog and records completion in the same transaction. Subsequent startups skip the completed seed and preserve saved progress.
- The MVP uses a fresh file for a catalog reset. If startup finds study sets in a file without the MVP seed marker, it asks for a new `JANEQ_DB_PATH`. The previous demo database stays available as a separate file. [Built-in study sets](features/builtin-sets.md)

## Study set identity and upgrade

A fresh database assigns stable UUIDv5 IDs to the built-in sets using a fixed namespace and their source keys. The source keys become `legacy_id` aliases. Editing a title has no effect on identity. The server assigns a UUID to each new custom set and leaves `legacy_id` null. When create includes an `Idempotency-Key`, the server derives the UUID from a separate namespace, the session username, and that key. A create without the header uses UUIDv4.

On startup, a database with the previous `builtin_catalog` schema adds `legacy_id` and updates the set IDs and their references in `questions` and `learn_progress` in one SQLite write transaction. The original keys become aliases. Question and option IDs, revision numbers, and saved Learn state keep their values. Restarting again keeps the same UUIDs. A database from an earlier catalog with a different seed marker still requires its own database path.

The same startup transaction adds `owner_username` when upgrading a database created before authoring. Existing built-in sets keep a null owner. Any custom rows previously inserted outside the app without an owner stay in the database and are inaccessible through the app until assigned an owner. The catalog and the preview, Learn, and Test readers scope custom sets to the session username. The editor requires an owned custom set. Keep `JANEQ_DEMO_USERNAME` stable when reopening a database with private sets.

The catalog returns `id` as a UUID and `legacy_id` as a nullable string. The preview, Learn, and Test routes accept either key. Learn reads and writes progress under the UUID. The frontend uses the UUID in new links and requests. [OpenAPI](http://127.0.0.1:8000/docs) · [Study set navigation](features/learn.md#study-set-urls-and-preview-loading)

Run `uv run --locked --no-sync python -m unittest discover -s tests -v` from `backend/`. The migration test opens a disposable database with the previous schema and saved Learn feedback, then restarts it twice. It verifies identical catalog UUIDs, unchanged feedback through both keys, a working UUID Test route, a clean foreign key check, and two sets with the same title. **Pass · API and SQLite**.

## Study set status on Home

[Home](features/login-home.md) and [My sets](features/study-set-authoring.md) use `GET /api/study-sets`. The [router](../backend/app/study_sets.py) requires a session and calls `read_study_set_summaries()` in [database.py](../backend/app/database.py). The query reads `study_sets`, `questions`, and `answer_options` to compute the response fields below.

| Response field | How it is computed |
| --- | --- |
| `question_count` | Number of questions in the set. |
| `configured_count` | Number of questions with a nonblank prompt, at least two nonblank options, and at least one nonblank option marked correct. The SQL uses `trim()` to check for blank text. |
| `status` | `ready` when the set has at least one question and every question is configured. Otherwise it is `draft`. |

These fields are calculated when Home requests the list. Learn, preview, and Test use the same question readiness query.

## Custom study set writes

Create writes the set, ordered questions, and ordered options in one transaction. Edit locks the database for writing before reading the current revision. An effective edit increments the set revision once. When questions or options change, the same transaction replaces the question tree with new server-generated UUIDs in form order. A title or description edit retains the question tree. A save with identical normalized content keeps the revision and IDs. Editor input trims outer whitespace and preserves blank unmarked options for later editing. The study modes omit blank options.

Run `uv run --locked --no-sync python -m unittest discover -s tests -v` from `backend/`. The authoring checks create a Draft in a disposable file, reopen it, save it as Ready, and verify grading and an empty `PRAGMA foreign_key_check` result. They also verify a retry with the same creation key and ownership isolation across two configured demo usernames. The legacy upgrade test reopens a database with saved Learn feedback and verifies that the feedback persists. **Pass · API and SQLite**. [Authoring acceptance checks](features/study-set-authoring.md#acceptance-checks)

## Learn progress

Startup creates `learn_progress` on both fresh and existing databases. A Learn command stores one snapshot for the signed-in username and set. The JSON records the current round, queue, phase, answers in the current round, studied question IDs, mastery levels (`1` for Familiar and `2` for Mastered), shuffle setting, and a step version. Correct answers come from `answer_options` at request time.

A write transaction checks both the study set revision and the saved step version before it updates the snapshot. When a study set revision changes, Learn presents a fresh session and replaces the previous snapshot on the next successful command. This applies to every effective edit, including metadata changes. [Learn flow and API](features/learn.md)

## Test read snapshot

Test reads `study_sets.revision`, the ordered questions, and their answer options in one SQLite read transaction per request. Both requests require a Ready set. The submission revision must match the revision read in the grading transaction. Test attempts and exports live in the browser during the flow, and the Test endpoints write no SQLite rows. [Test flow and API](features/test-results.md#api-and-storage)

## Inspect a local database

After the first backend startup, open a Python prompt from `backend/`. Use the path configured by `JANEQ_DB_PATH` if you changed it.

```powershell
uv run --locked --no-sync python
```

```python
import sqlite3
from pathlib import Path

uri = Path("data/janeq-mvp.sqlite3").resolve().as_uri() + "?mode=ro"
db = sqlite3.connect(uri, uri=True)
db.execute("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").fetchall()
db.execute("PRAGMA table_info(answer_options)").fetchall()
db.execute("PRAGMA foreign_key_list(answer_options)").fetchall()
db.execute("PRAGMA foreign_key_check").fetchall()
db.execute("SELECT COUNT(*) FROM study_sets WHERE source_kind = 'builtin'").fetchone()
db.execute("SELECT COUNT(*) FROM questions JOIN study_sets ON study_sets.id = questions.study_set_id WHERE source_kind = 'builtin'").fetchone()
db.close()
```

For a fresh seeded database, expect the five tables above, an empty list from `foreign_key_check`, 18 built-in sets, and 281 built-in questions. Run `uv run --locked --no-sync python -m unittest discover -s tests` from `backend/` to verify the fresh seed and reopen an MVP database with saved Learn progress. Both cases passed using disposable SQLite files. [Built-in catalog acceptance checks](features/builtin-sets.md#acceptance-checks)
