# Built-in study sets

Home opens each built-in set in **Ready** state. Choose a card, then select **Learn**. The overview also lets you flip a preview card to see its answer. Existing answer-editor bookmarks open the overview for the same set.

## Question bank

The catalog has **18 English sets and 281 questions**. The six original sets retain their 41 questions and stable IDs. The other 12 sets have 20 questions each, including four multiple-select questions per set.

| Area | Sets added |
| --- | --- |
| Frontend | JavaScript, TypeScript, React, Next.js App Router |
| Languages and backend | Java, .NET and C#, Python, Django, FastAPI |
| Data, APIs, and security | SQL and Relational Databases, HTTP and API Design, Cybersecurity |

The reviewed legacy bank is in [questions_en.json](../../backend/app/questions_en.json). Ambiguous prompts were clarified, and questions about an unspecified latest Python release or an undocumented name were replaced with stable concepts. The [new set files](../../backend/app/builtin_sets) retain the authored explanations as source material. Learn uses the stored options for its existing correct and incorrect feedback.

The revised legacy questions use the framework references, Python release notes, and the NIST definition of cloud computing. [FastAPI tutorial](https://fastapi.tiangolo.com/tutorial/first-steps/) · [NIST definition](https://csrc.nist.gov/pubs/sp/800/145/final) · [Python 3.11 release notes](https://docs.python.org/3/whatsnew/3.11.html#faster-cpython) · [Pydantic architecture](https://pydantic.dev/docs/validation/latest/internals/architecture/) · [React Server Components](https://react.dev/reference/rsc/server-components) · [React use](https://react.dev/reference/react/use)

## UI, API, and data

The Study Set overview shows the title, question count, Ready status, study modes, and flashcard preview. Home provides a separate catalog section.

Home uses the signed session to request `GET /api/study-sets`. The [study-set router](../../backend/app/study_sets.py) reads catalog summaries through [database.py](../../backend/app/database.py). Study Set requests `GET /api/study-sets/{set_id}/preview`, and Learn reads and updates progress through `GET` and `POST /api/study-sets/{set_id}/learn`. The old editor endpoint is retired. [OpenAPI](http://127.0.0.1:8000/docs) · [Learn API and storage](learn.md#api-and-storage)

On startup, the versioned seed stores the built-in prompts, options, and correct flags in SQLite. The upgrade applies the reviewed keys to existing sets. A changed set starts a fresh Learn session on its new revision. A set with identical content and keys retains its revision and saved progress. [Database reference](../database.md#built-in-data-and-startup)

## Acceptance checks

| Check | How to reproduce | Expected result | Verification |
| --- | --- | --- | --- |
| Fresh catalog | Start JaneQ with a disposable database, sign in, and open Home. | 18 Ready cards, 12 with 20 questions each. Learn opens for all 18 sets. | Pass · API and browser for the catalog count. Pass · API for all Learn entries. |
| Study and resume | Open Python, flip the first preview card, and use Enter on Learn. Select a wrong choice and reload. | The preview reveals the seeded answer. Learn restores the feedback and highlights the correct option. | Pass · browser at 1440 px and after reloading at 390 px. |
| Multiple correct answers | Open Python in Learn and reach question 5. Submit both correct options. | Learn accepts the complete selection regardless of option order. | Pass · API. |
| Old editor bookmark | Open `#set/html-css/editor` at 390 px, then return Home. | The Ready HTML / CSS overview opens with Learn available. The overview and Home fit without horizontal overflow. | Pass · browser. |
| Catalog retry | Block the catalog request and reload Home. Unblock it and select **Try again**. | Home reports the error and restores all 18 cards on retry. | Pass · browser. |
| Existing database | Reopen the v1 fixture twice with a manually edited key, a custom set, and saved Learn progress. | The new catalog appears once. Changed sets use the reviewed content and keys. The custom set and unaffected progress remain available. | Pass · API and SQLite. |
