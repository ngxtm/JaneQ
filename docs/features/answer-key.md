# Set answer key

## Scope

Open a built-in Draft from Home to set its answer key. Each question can have one or more correct options. Save a partial key to return to it later. Once every question is configured, open the Ready set and start [Learn](learn.md). Use **Edit answer key** from a Ready study set to revise its key. The editor preserves the source questions, option text, and order.

## Review with a fresh database

1. Follow [local development](../../README.md#local-development). Set `JANEQ_DB_PATH` to a new SQLite file before starting FastAPI. In PowerShell, use `$env:JANEQ_DB_PATH = Join-Path $env:TEMP "janeq-key-$([guid]::NewGuid()).sqlite3"`.
2. Sign in and open **HTML / CSS** from **Built-in sets**. The editor opens with **Draft** and `0 of 3 answer keys set`.
3. Select `<ul>` and click **Save answer key**. Reload the editor. It still shows **Draft** and `1 of 3 answer keys set`.
4. Select `color` for the CSS question and `<img src='image.jpg' alt='Image description'>` for the image question. Save again. Select **Open study set**, then **Learn**.

These selections are the existing HTML / CSS review examples. On a fresh database, the seed leaves answer keys empty for the author to configure.

## Design references

The editor has a sticky action bar and stacked cards. The prompt and answer choices sit side by side on desktop and stack on mobile, adapting Quizlet's term and definition grouping to JaneQ's MCQs. JaneQ uses explicit save and checkboxes because a question may have several correct answers. [Quizlet flashcard sets](https://help.quizlet.com/hc/en-ca/articles/360029780752-Creating-flashcard-sets)

## API and storage

The [editor screen](../../frontend/src/features/study-sets/AnswerKeyEditor.tsx) calls the [feature client](../../frontend/src/features/study-sets/answer-key-api.ts) through the shared Axios instance. Both routes use the demo session cookie and appear in [Swagger UI](http://127.0.0.1:8000/docs) and [OpenAPI JSON](http://127.0.0.1:8000/openapi.json).

| Request | Trigger and result |
| --- | --- |
| `GET /api/study-sets/{set_id}/editor` | Opening the editor loads the saved `revision`, Draft or Ready status, configured count, and ordered questions with their saved selections. |
| `PUT /api/study-sets/{set_id}/editor` | Saving submits the revision and a map of every question ID to its selected option IDs. Use an empty array for a question with no selected answer. The response returns the updated editor view and refreshes the set's status in Home. |

For example, the first save in the fresh HTML / CSS review uses `{"revision":1,"answers":{"q15":["q15-a"],"q16":[],"q24":[]}}`. The response returns revision `2` and `draft` with one configured question. A stale revision returns `409` and the UI offers to reload the saved key. A `422` rejects missing question entries, duplicate option IDs, or options from a different question. The editor keeps selections after a request failure. A `401` returns to Sign in. Unknown sets return `404`. Custom sets use a separate authoring flow.

The [study set router](../../backend/app/study_sets.py) validates selections and updates `answer_options.is_correct` and `study_sets.revision` in one SQLite transaction. A save with identical selections retains its revision. Learn compares the current revision with saved progress and starts a fresh session when the key changed. [Database rules](../database.md#saving-built-in-answer-keys)

## Acceptance checks

| Check | How to reproduce | Observed result |
| --- | --- | --- |
| Fresh database to Learn | Follow the review steps, answer all three questions correctly in both rounds, and click **Finish Learn**. | Pass · Chromium through Vite, FastAPI, and fresh SQLite. The set became Ready after saving all answers and the session returned to the study set after reaching `3 Mastered`. |
| Partial save and reload | Save only `<ul>` and reload the editor. | Pass · browser and API. The selection and Draft status persisted. Learn rejected the partial key. |
| Multiple selections and validation | Save two valid options on one question. Try duplicate IDs, foreign IDs, missing question entries, and an older revision. | Pass · API. Learn recognized the multi-select question. Invalid input left the key unchanged. A stale write returned `409`. |
| Revision and persistence | Open Learn, change the key, and reopen Learn. Reopen the backend against the same database. | Pass · API. An unchanged save kept its revision. A changed key invalidated earlier progress, and reopening SQLite preserved the saved key. |
| Keyboard, mobile, and retry | Use Space on a checkbox. At 360 px, save while offline, reconnect, and save again. | Pass · browser. The editor fit without horizontal overflow. The failed save kept both new selections. |
| Automated checks | Run `uv run --locked --no-sync python -m unittest discover -s tests -v` in `backend/`, then `npm run lint` and `npm run build` in `frontend/`. | Pass · CLI. Eight backend tests, lint, and build passed. |
