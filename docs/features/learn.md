# Study Set and Learn

## Scope and order

The flow is **Home → Study Set → Learn → round review → finish → Study Set**. Study Set has an active **Learn** entry and a working flashcard preview. **Flashcards** and **Test** are visible entries reserved for their standalone flows. Test includes Results and JSON export when implemented.

## Study Set reference


| Area | JaneQ design target |
| --- | --- |
| Header | Use a 48 px bold title on desktop and 36 px on mobile. Ready metadata uses the MCQ question count, with the built-in edit action as an 18 px icon in a 32 px control. JaneQ retains a compact **Back to Home** above the title. |
| Mode cards | Desktop uses 160 × 59 px cards with a 3 px bottom border and a two-layer shadow. The 24 px Tabler icons use 2 px strokes, a `#4b83ff` foreground, and an offset `#1a5fff` copy blurred by 2 px at 30% opacity. Hover and keyboard focus move the icon layers, with stationary feedback under reduced motion. Flashcards and Test keep the same visual treatment and expose their unavailable state to assistive technology. |
| Responsive layout | The desktop preview sits between two 160 px columns with 32 px gaps. At tablet widths the three mode cards form one row. Mobile uses two columns and moves the outline controls and a Settings icon below the preview. JaneQ's three modes occupy two rows above the preview. |
| Flashcard preview | Match the 500 px height, 12 px corner radius, two-layer shadow, orange progress stripe, and 48 px previous and next controls. Show MCQ prompts and answers, position, and a star action. Use `#0036b4` for outline controls. |


## Learn milestone

Learn has a round header with Back and Settings, a progress bar, and one prompt at a time. Answer choices use two columns at wider widths and one on narrow screens. Learners can acknowledge an incorrect answer or continue after the round summary. The completion screen returns to the set and can offer review of missed items.


### Confirmed behavior

- **Draft and Ready.** A Ready set opens its overview and can enter Learn. Selecting a built-in Draft set from Home opens the answer-key editor. The Learn API still blocks direct requests for Draft sets. [Set answer key](answer-key.md)
- **Answer feedback.** A single-choice selection checks immediately. For multi-select, the learner presses **Check answer**. After a correct answer, mark it on the question card and advance after about one second. After a wrong answer, mark the learner's choice and show the correct answer in the same card. Wait for **Continue** before advancing.
- **Resume.** Save the current round, question or review step, and each question's learning status by signed-in account, study set, and revision. Reopening Learn resumes at the saved step. If the revision has changed, explain why and start a fresh session for the updated set if it is Ready. If it became Draft, apply the Draft behavior.
- **Review data.** Use the answer-key editor to prepare the three HTML / CSS answers in a fresh disposable database. Use a separate Draft set to verify the entry behavior.

### How the reference apps handle practice

| App | Observed behavior | Application to JaneQ |
| --- | --- | --- |
| **Quizlet Learn** | The study path adapts to the learner's goal and familiarity. Quizlet describes drilling difficult terms, advancing from multiple-choice to written questions, and resuming saved progress. | Use missed questions to decide what comes back in a later round. Preserve progress when the learner leaves. [Quizlet Learn](https://quizlet.com/gb/features/learn) · [Study paths](https://help.quizlet.com/hc/en-us/articles/360048314692-Setting-up-a-study-path) |
| **ClassQuiz live quiz** | Its check question allows multiple selections. The server compares the selected options with all correct options. The host controls the live question and results, and correct answers earn points based on time. | Use server-side validation for multiple selections. [Multi-select UI](https://github.com/mawoka-myblock/ClassQuiz/blob/49dca859dee1a1821b056abf95c2df501eda98e1/frontend/src/lib/play/questions/check.svelte) · [Answer checking](https://github.com/mawoka-myblock/ClassQuiz/blob/49dca859dee1a1821b056abf95c2df501eda98e1/classquiz/socket_server/helpers.py#L117) · [Live submissions](https://github.com/mawoka-myblock/ClassQuiz/blob/49dca859dee1a1821b056abf95c2df501eda98e1/classquiz/socket_server/__init__.py#L261) |

### Round rules for JaneQ

1. Show one original MCQ at a time. FastAPI checks the full set of selected option IDs and returns feedback. Missing or extra selections count as incorrect.
2. The first correct answer marks a question **Familiar**. A correct answer in a later round marks it **Mastered**. A wrong answer keeps the current status and schedules another try in a later round. A question can advance at most one stage per round.
3. For the three-question review set, present every question once in the first round. In later rounds, include questions still working toward their first correct answer and **Familiar** questions due for review. Finish when all three questions are **Mastered**.

### Learn screen design

The round summary shows the round number, progress, three status cards, and the items studied this round. The bottom action bar shows a keyboard hint and **Continue to round 2**.

| Screen | Design target |
| --- | --- |
| Answer and feedback | Use a round header, progress, question card, and feedback states. Use labels or icons alongside color on the options. Show **Check answer** for multi-select and **Continue** after a wrong answer. |
| Round summary | Keep the header, count and progress bar, three status cards, reviewed question rows, and bottom action bar. Rows show the question, correct answers, and the learner's result. **Learning** includes unseen questions and questions awaiting a first correct answer. The action bar uses Enter as its keyboard shortcut so other keys remain available for navigation. |
| Completion and Settings | The completion screen shows the three status cards, a completion message, **Finish Learn**, and **Reset progress**. The Settings dialog provides shuffle for future rounds and reset with confirmation. JaneQ uses its source MCQ format for each pass. The preview has a separate setting for which card side appears first. |

For the HTML / CSS review case, two correct answers and one wrong answer in round 1 yield `3 / 3 questions` studied, with `1 Learning`, `2 Familiar`, and `0 Mastered`. If all three answers are correct in round 2, the two **Familiar** questions become **Mastered** and the remaining question becomes **Familiar**. The last question needs a correct answer in round 3 to finish Learn.

## Review locally

Follow [Review with a fresh database](answer-key.md#review-with-a-fresh-database) to save the three HTML / CSS answers in JaneQ. Open the Ready study set and select **Learn**. Use a different built-in set for the Draft check.

## API and storage

Use the generated [Swagger UI](http://127.0.0.1:8000/docs) or [OpenAPI JSON](http://127.0.0.1:8000/openapi.json). All three requests require the signed session cookie. The UI returns to sign-in on `401`.

| Request | Trigger and result |
| --- | --- |
| `GET /api/study-sets/{set_id}/preview` | Opening a Ready set loads preview questions and the answer side for each card. |
| `GET /api/study-sets/{set_id}/learn` | Opening Learn loads the active question, feedback, round summary, or completion. Current questions include option IDs and text. Correct IDs are included in the feedback step. A new revision starts a fresh session and the UI shows an explanation. |
| `POST /api/study-sets/{set_id}/learn` | Checking, continuing, changing shuffle, and resetting send an `action` with the current `revision` and `version`. A check also sends `selected_ids`, such as `["q15-a"]` on the first question of the review set. Success returns the next view. Invalid selections return `422`. After a stale-step `409`, the UI reloads the saved view. |

Unknown sets return `404` and Draft sets return `409`. Preview and Learn calls go through the [shared Axios client](../../frontend/src/http.ts). The [Learn router](../../backend/app/learn.py) reads the set and answer options from SQLite and stores progress by username and set. [Database reference](../database.md#learn-progress)

## Acceptance checks

| Check | How to reproduce | Expected result | Verification |
| --- | --- | --- | --- |
| Study Set appearance | Open the Ready HTML / CSS set and inspect the layout at 1440 and 390 px. Check the mode and preview styles in DevTools. | The desktop mode card measures 160 × 59 px and the preview measures 832 × 500 px. At 390 and 320 px the page has no horizontal overflow. | Pass · browser |
| Study Set interactions | Hover Learn, enable reduced motion, flip the preview, press Right Arrow, toggle Autoplay, open mobile Settings, and use Enter on Learn. | The icon layers move on hover and stay still under reduced motion. The preview flips and advances. Autoplay shows its active color. Settings opens and Learn enters Round 1. | Pass · browser |
| Learn entry and return | Open Learn, use Back, and open Learn again. | Learn opens for the selected set. Back returns to its overview. | Pass · browser |
| Draft entry | Select a built-in Draft from Home and try its Learn URL directly. | Home opens the editor. The direct Learn request returns `409`. | Pass · browser and API |
| Feedback and rounds | Answer two of three questions correctly and one incorrectly in round 1. Answer all three correctly in round 2. Complete the last Familiar question in a later round. | Correct feedback advances automatically. Wrong feedback waits for **Continue**. Round 1 shows `1 Learning`, `2 Familiar`, `0 Mastered`, and three reviewed rows. **Finish Learn** appears at `3 Mastered` and returns to the set. | Pass · browser. Pass · API for the same flow with a wrong review answer retaining Familiar. |
| Resume and revision change | Reload during wrong feedback. Then increment the set revision and reopen Learn. | Reload restores the feedback. Opening the changed Ready set shows an explanation and starts round 1. A command from the previous revision is rejected. | Pass · browser and API |
| Multi-select and retry | Set a second correct option on `q15` and increment the revision in the disposable fixture. Select both, go offline, press **Check answer**, reconnect, and retry. | The failed request preserves both selections. Retry advances after correct feedback. Missing or extra valid choices are incorrect. Duplicate or foreign option IDs return `422`. | Pass · browser and API |
| Settings and reset | Open Settings during a round summary and dismiss it. Turn on shuffle and reopen Settings after a reload. After completion, select **Reset progress** and confirm. | Settings opens and closes. Shuffle stays enabled after reload. Reset returns to question 1 in a new round 1. | Pass · browser |
| Keyboard, mobile, and motion | Select options with number keys, continue with Enter, view the round summary at 360 px, and emulate reduced motion. | Keyboard actions work. The summary fits with no horizontal overflow. The progress bar stops animating with reduced motion. | Pass · browser |
| Existing database | Reopen a disposable seeded database with a saved answer key and no Learn table. | Startup creates the table, preserves the key, and retains 41 built-in questions. | Pass · API |
| Automated checks | Run backend `uv run --locked --no-sync python -m unittest discover -s tests -v`, then frontend `npm run lint` and `npm run build`. | Backend tests pass. Lint and build complete. | Pass · CLI |

Browser checks used Chromium through Vite, FastAPI, and a disposable SQLite file.
