# Built-in study sets

Home opens each built-in set in **Ready** state. Choose a card, then select **Learn**. The overview also lets you flip a preview card to see its answer. Existing answer-editor bookmarks open the overview for the same set.

## Question bank

The rewritten catalog has **18 English sets, 281 questions, and 52 multiple-select questions**. The six overview sets contain 41 questions in total. The 12 focused sets have 20 questions each, including four multiple-select questions per set. Set IDs stay stable for existing links.

| Area | Focused sets |
| --- | --- |
| Frontend | JavaScript, TypeScript, React, Next.js App Router |
| Languages and backend | Java, .NET and C#, Python, Django, FastAPI |
| Data, APIs, and security | SQL and Relational Databases, HTTP and API Design, Cybersecurity |

Each set uses the same JSON format. Give every question a unique ID, four distinct choices, the complete answer key in `correctOptionIds`, and a short explanation. Use **Select all that apply** when a question has several correct choices. Each set has a topic, and questions can use either selection type. Learn uses the stored options for feedback. The explanations live in the source files. [Built-in set files](../../backend/app/builtin_sets)

Prompts specify the context when it affects the answer. For example, the comment question specifies JavaScript modules, and SQL questions name PostgreSQL where the dialect matters. [ECMAScript Annex B](https://tc39.es/ecma262/multipage/additional-ecmascript-features-for-web-browsers.html#sec-html-like-comments) · [React rules](https://react.dev/reference/rules) · [Next.js App Router](https://nextjs.org/docs/app) · [Django querysets](https://docs.djangoproject.com/en/6.0/ref/models/querysets/) · [FastAPI tutorial](https://fastapi.tiangolo.com/tutorial/) · [HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html) · [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## UI, API, and data

Home lists each built-in set as a linked card with its title, question count, and Ready or Draft status. The set overview shows study modes and, for Ready sets, a flashcard preview. [Home layout](login-home.md#home-design) · [Study Set layout](learn.md#study-set-design)

Home uses the signed session to request `GET /api/study-sets`. The [study-set router](../../backend/app/study_sets.py) reads catalog summaries through [database.py](../../backend/app/database.py). Study Set requests `GET /api/study-sets/{set_id}/preview`, and Learn reads and updates progress through `GET` and `POST /api/study-sets/{set_id}/learn`. The old editor endpoint is retired. [OpenAPI](http://127.0.0.1:8000/docs) · [Learn API and storage](learn.md#api-and-storage)

On first startup, the seed stores the built-in prompts, options, and correct flags in a fresh SQLite file. Use a new file path to reset the demo catalog. Reopening an MVP database preserves its catalog and saved Learn progress. [Database reference](../database.md#built-in-data-and-startup)

## Acceptance checks

| Check | How to reproduce | Expected result | Verification |
| --- | --- | --- | --- |
| Fresh catalog | Start JaneQ with a disposable database, sign in, and open Home. | 18 Ready cards, 12 with 20 questions each. Learn opens for all 18 sets. | Pass · API and browser for the catalog count. Pass · API for all Learn entries. |
| Study and resume | Open a Ready set, flip the first preview card, and enter Learn. In a disposable database, submit an answer and reopen the app with the same file. | The preview reveals the seeded answer. Learn restores the saved feedback. | Pass · browser for preview and Learn entry. Pass · API for saved feedback after reopening the database. |
| Multiple correct answers | Open Python in Learn and reach question 5. Submit both correct options. | Learn accepts the complete selection regardless of option order. | Pass · API. |
| Old editor bookmark | Open `#set/html-css/editor` at 390 px, then return Home. | The Ready HTML / CSS overview opens with Learn available. The overview and Home fit without horizontal overflow. | Pass · browser in the previous catalog milestone. |
| Catalog retry | Block the catalog request and reload Home. Unblock it and select **Try again**. | Home reports the error and restores all 18 cards on retry. | Pass · browser in the previous catalog milestone. |
| Restart | Start with a disposable MVP database, save an answer in Learn, and reopen the file twice. | The catalog stays at 18 sets and 281 questions, saved feedback returns, and the foreign key check finds no violations. | Pass · API and SQLite. |
| Previous demo file | Point `JANEQ_DB_PATH` at a populated file with the previous seed marker. | Startup reports that a new path is required. The existing question count and marker are preserved. | Pass · SQLite. |
