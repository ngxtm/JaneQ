# JaneQ database

## Location and source of truth

JaneQ uses SQLite through Python's `sqlite3` module. The default file is `backend/data/janeq.sqlite3`. `JANEQ_DB_PATH` can point to another file. Relative values are resolved from `backend/`. [App configuration](../backend/app/main.py)

`SCHEMA` in [database.py](../backend/app/database.py) defines the tables. `connect()` enables foreign key enforcement on each application connection. During FastAPI startup, `initialize_database()` creates missing tables and seeds the built-in sets. Changes to an existing table will require an explicit migration because startup uses `CREATE TABLE IF NOT EXISTS`.

## Tables and relationships

```text
study_sets 1 ──── * questions 1 ──── * answer_options
study_sets 1 ──── * learn_progress
seed_history tracks completed seed runs independently.
```

| Table | Columns | Constraints and purpose |
| --- | --- | --- |
| `study_sets` | `id TEXT`, `title TEXT`, `description TEXT`, `source_kind TEXT`, `revision INTEGER` | `id` is the primary key. `title`, `description`, `source_kind`, and `revision` are required. `description` defaults to `''`, `revision` to `1`. `source_kind` accepts `builtin` or `custom`. |
| `questions` | `id TEXT`, `study_set_id TEXT`, `prompt TEXT`, `position INTEGER` | `id` is the primary key. The other columns are required. `study_set_id` references `study_sets.id` with `ON DELETE CASCADE`. A position is unique within a study set. |
| `answer_options` | `id TEXT`, `question_id TEXT`, `text TEXT`, `position INTEGER`, `is_correct INTEGER` | `id` is the primary key. The other columns are required. `question_id` references `questions.id` with `ON DELETE CASCADE`. A position is unique within a question. `is_correct` accepts `0` or `1` and defaults to `0`. |
| `seed_history` | `name TEXT` | `name` is the primary key. `builtin_questions_v2` marks completion of the current built-in seed. Upgraded files can also contain `builtin_questions_v1`. |
| `learn_progress` | `username TEXT`, `study_set_id TEXT`, `revision INTEGER`, `state_json TEXT` | All columns are required. The composite primary key is `(username, study_set_id)`. `study_set_id` references `study_sets.id` with `ON DELETE CASCADE`. |

Deleting a study set cascades to its questions and their answer options when foreign keys are enabled. The schema allows several options for a question to be marked correct.

## Built-in data and startup

- JaneQ groups the 41 reviewed questions in [questions_en.json](../backend/app/questions_en.json) by `type` into six built-in sets. Set IDs are slugs of the topic titles. Question IDs follow source order (`q01`, `q02`, …) and option IDs follow option order (`q01-a`, `q01-b`, …).
- The [expanded catalog](../backend/app/builtin_sets) adds 12 sets with 20 questions each. Each file supplies its set and question IDs. Option IDs join the question ID and its local choice ID. Both sources list the correct choices in `correctOptionIds`. The seed sets the matching `answer_options.is_correct` flags, so all 18 sets start Ready.
- Startup acquires a write lock before checking `seed_history`. The seed rows and completion marker commit in the same transaction. On an existing v1 database, the upgrade updates the original prompts, options, and keys in place. It increments the revision once for each existing set whose content or key changed. Subsequent startups skip the completed seed. [Built-in study sets](features/builtin-sets.md)

## Study set status on Home

[Home](features/login-home.md) calls `GET /api/study-sets`. The [router](../backend/app/study_sets.py) requires a session and calls `list_study_sets()` in [database.py](../backend/app/database.py). The query reads `study_sets`, `questions`, and `answer_options` to compute the response fields below.

| Response field | How it is computed |
| --- | --- |
| `question_count` | Number of questions in the set. |
| `configured_count` | Number of questions with a nonblank prompt, at least two nonblank options, and at least one nonblank option marked correct. The SQL uses `trim()` to check for blank text. |
| `status` | `ready` when the set has at least one question and every question is configured. Otherwise it is `draft`. |

These fields are calculated when Home requests the list. The Learn and preview endpoints use the same question readiness query.

## Learn progress

Startup creates `learn_progress` on both fresh and existing databases. A Learn command stores one snapshot for the signed-in username and set. The JSON records the current round, queue, phase, answers in the current round, studied question IDs, mastery levels (`1` for Familiar and `2` for Mastered), shuffle setting, and a step version. Correct answers come from `answer_options` at request time.

A write transaction checks both the study set revision and the saved step version before it updates the snapshot. When a study set revision changes, Learn presents a fresh session and replaces the previous snapshot on the next successful command. Study set authoring must increment the revision when the question or answer content changes. [Learn flow and API](features/learn.md)

## Inspect a local database

After the first backend startup, open a Python prompt from `backend/`. Use the path configured by `JANEQ_DB_PATH` if you changed it.

```powershell
uv run --locked --no-sync python
```

```python
import sqlite3
from pathlib import Path

uri = Path("data/janeq.sqlite3").resolve().as_uri() + "?mode=ro"
db = sqlite3.connect(uri, uri=True)
db.execute("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").fetchall()
db.execute("PRAGMA table_info(answer_options)").fetchall()
db.execute("PRAGMA foreign_key_list(answer_options)").fetchall()
db.execute("PRAGMA foreign_key_check").fetchall()
db.execute("SELECT COUNT(*) FROM study_sets WHERE source_kind = 'builtin'").fetchone()
db.execute("SELECT COUNT(*) FROM questions JOIN study_sets ON study_sets.id = questions.study_set_id WHERE source_kind = 'builtin'").fetchone()
db.close()
```

For a fresh seeded database, expect the five tables above, an empty list from `foreign_key_check`, 18 built-in sets, and 281 built-in questions. Run `uv run --locked --no-sync python -m unittest discover -s tests` from `backend/` to verify the fresh seed and the effect of reopening an existing database with saved keys and progress. Both cases passed using disposable SQLite files. [Built-in catalog acceptance checks](features/builtin-sets.md#acceptance-checks)
