# Study Set and Learn

## Scope and order

The flow is **Home → Study Set → Learn → round review → finish → Study Set**. Study Set has an active **Learn** entry and a working flashcard preview. The standalone **Flashcards** card is reserved. **Test** opens the [Test, Results, and PDF download flow](test-results.md) on Ready sets.

## Study set URLs and preview loading

Home opens at `/`. An overview opens at `/<id>`, with `/learn` and `/test` appended for those modes. JaneQ uses the ID returned by `GET /api/study-sets`, which is the primary key in SQLite. For example, the .NET set opens at `/dotnet`. A future user-created set can have its own stable ID and share a title with another set. Legacy `#home`, `#set/<id>`, and `#card/<id>` links are replaced in browser history with their corresponding paths. Old editor links open the overview. When hosting the frontend, serve the SPA entry point for direct document requests to set paths and route `/api` to FastAPI. [API and storage](#api-and-storage)

A 3 px yellow-orange bar at the top of the viewport uses BProgress in indeterminate mode while the flashcard preview is pending. The title, study modes, and shared header stay visible. The bar appears after 180 ms, disappears on completion, error, or leaving the preview, and stays still with reduced motion. The preview announces its pending state to assistive technology. [BProgress configuration](https://bprogress.vercel.app/docs/configure)

Hover or focus a Ready card to start `GET /api/study-sets/{set_id}/preview` early. Opening the set uses the same request if it is still pending. The signed-in library keeps one successful response in memory for up to 30 seconds. A failed request can be retried and a Draft set skips the preview. The MCQ research report separates session and question reads from answer submissions. The speculative request only reads the preview and leaves Learn and Test actions to their respective screens. [MCQ research report](../../../interview/docs/MCQ_RESEARCH_REPORT.md) · [Database reference](../database.md)

| Check | How to reproduce | Expected result | Verification |
| --- | --- | --- | --- |
| Set URLs and history | Open .NET from Home, use browser Back and Forward, then enter Learn and Test. Reload Test. | Home and the modes use path URLs. Back and Forward restore the set or catalog. The header stays mounted across Home and the set, and Test reloads at its direct URL. | Pass · Chromium at 1440 px |
| Bookmarks and missing pages | Open `/#home`, `/#card/dotnet`, `/#set/html-css/editor`, and `/#set/dotnet/test`. Open `/no-such-set` while signed in and `/no/such/page`. | Each bookmark opens its corresponding path. The two invalid paths show the study set and general 404 screens respectively. | Pass · Chromium |
| Hover and quick return | Hold the .NET preview request, hover the card, then open it. Release the request, return Home and reopen the set. | Hover starts one request and opening reuses it. The yellow bar animates while waiting and goes away after completion. Reopening with the cached preview skips the bar. | Pass · Chromium at 1440 px against FastAPI and SQLite |
| Keyboard, reduced motion, and retry | At 390 px with reduced motion, hold the .NET preview request, focus its card, then press Enter. Fail the held request, unblock it, and choose **Try again**. | Focus starts one request. The bar stays still during the wait, clears on failure, and the retry loads the preview. Home and the set fit the viewport. | Pass · Chromium at 390 px against FastAPI and SQLite |

## Study Set reference


| Area | JaneQ design target |
| --- | --- |
| Header | Use a 48 px bold title on desktop and 36 px on mobile. Ready metadata uses the MCQ question count. JaneQ retains a compact **Back to Home** above the title. |
| Mode cards | Desktop uses 160 × 59 px cards with a 3 px bottom border and a two-layer shadow. The 24 px Tabler icons use 2 px strokes, a `#4b83ff` foreground, and an offset `#1a5fff` copy blurred by 2 px at 30% opacity. Hover and keyboard focus move the icon layers, with stationary feedback under reduced motion. Disabled cards expose their unavailable state to assistive technology. |
| Responsive layout | The desktop preview sits between two 160 px columns with 32 px gaps. At tablet widths the three mode cards form one row. Mobile uses two columns and moves the outline controls and a Settings icon below the preview. JaneQ's three modes occupy two rows above the preview. |
| Flashcard preview | Match the 500 px height, 12 px corner radius, two-layer shadow, orange progress stripe, and 48 px previous and next controls. Show MCQ prompts and answers, position, and a star action. Use `#0036b4` for outline controls. |


### Flashcard preview interactions

The preview shows the question position, star, and navigation controls. JaneQ uses separate vertical flip and horizontal slide animations, with horizontal swipes for touchscreens. Motion runs the animations. Pointer Events distinguish a tap, a horizontal swipe, and a vertical scroll. [Quizzy flashcards](https://github.com/sztephen/Quizzy/blob/main/app/flashcards/page.tsx)

Open any Ready set from Home. Tap the card or press Space or Enter with the card focused to flip it in place. Swipe left for the next card and right for the previous card. The arrow buttons and keys use the same navigation. Each swipe moves at most one card, and the first and last cards stop at the ends of the set. Each new card opens on its question by default. **Show the answer first** reverses that preference. With reduced motion enabled, both changes happen immediately.

When the focused card has more text than fits, Up, Down, Page Up, Page Down, Home, and End scroll the visible face. Pressing the card stops Autoplay so the current question stays in place during a gesture. A drag back to its starting point leaves the current face visible.

The preview reads prompts and correct answer text from `GET /api/study-sets/{set_id}/preview` using the signed-in session. It flips and navigates the loaded cards locally. [API and storage](#api-and-storage)

| Check | How to reproduce | Expected result | Verification |
| --- | --- | --- | --- |
| Desktop flip and navigation | At 1440 px, click the first HTML / CSS card, drag left while on the answer, then focus the card and press Left and Space. | The card rotates vertically. The drag slides to question 2 without flipping it. Left returns to question 1 and Space flips it with visible focus. | Pass · Chromium |
| Touch gestures | At 390 px with touch emulation, tap the card, swipe left and right, swipe right again on question 1, then try a short drag and a vertical swipe. | Tap flips the card. Horizontal swipes move one card each. The boundary, short drag, and vertical swipe leave the card on question 1. The page fits the viewport. | Pass · Chromium with touch emulation |
| Reduced motion and settings | Enable reduced motion, flip a card, and select Next. Set **Show the answer first** and run Autoplay. | Flip and navigation update without a transition. Each new card honors the chosen face, and Autoplay advances. | Pass · Chromium |
| Reduced motion while open | With HTML / CSS open, enable reduced motion and flip the card, then select Next. | The same preview responds without any intermediate rotation or horizontal slide. | Pass · Chromium |
| Keyboard scrolling | At 320 px, focus the card and open the answer to question 20 of HTTP and API Design. Press Page Down, End, and Tab. | Page Down and End scroll the answer, while the page stays in place. Tab moves to **Previous card**. | Pass · Chromium |
| Cancel a drag and hold during Autoplay | Drag the first card to the left, move back to the starting point, and release. Then turn on Autoplay, wait for the answer, and hold a left drag for more than 2.5 seconds before releasing. | The canceled drag leaves the question visible. The hold keeps the current answer visible and the release moves from card 1 to card 2. | Pass · Chromium |
| Preview retry | Block the preview request, reload, unblock it, and select **Try again**. | The error clears and the first card loads from the API. | Pass · Chromium |

## Learn milestone

Learn has a round header with Back and Settings, a progress bar, and one prompt at a time. Answer choices use two columns at wider widths and one on narrow screens. Learners can acknowledge an incorrect answer or continue after the round summary. The completion screen returns to the set and can offer review of missed items.


### Confirmed behavior

- **Draft and Ready.** Every built-in set starts Ready and opens its overview with Learn available. The Learn API rejects direct requests for Draft sets. [Built-in study sets](builtin-sets.md)
- **Answer feedback.** A single-choice selection checks immediately. For multi-select, the learner presses **Check answer**. After a correct answer, mark it on the question card and advance after about one second. After a wrong answer, mark the learner's choice and show the correct answer in the same card. Wait for **Continue** before advancing.
- **Resume.** Save the current round, question or review step, and each question's learning status by signed-in account, study set, and revision. Reopening Learn resumes at the saved step. If the revision has changed, explain why and start a fresh session for the updated set if it is Ready. If it became Draft, apply the Draft behavior.
- **Review data.** Use the three seeded HTML / CSS questions in a fresh disposable database. The Draft API test clears a key directly in its disposable fixture.

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

Start with a fresh database, open the Ready HTML / CSS study set, and select **Learn**. The answers are seeded on startup. [Built-in study sets](builtin-sets.md)

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
| Draft entry | Clear a question's key in a disposable fixture and request Learn directly. | The request returns `409`. | Pass · API |
| Feedback and rounds | Answer two of three questions correctly and one incorrectly in round 1. Answer all three correctly in round 2. Complete the last Familiar question in a later round. | Correct feedback advances automatically. Wrong feedback waits for **Continue**. Round 1 shows `1 Learning`, `2 Familiar`, `0 Mastered`, and three reviewed rows. **Finish Learn** appears at `3 Mastered` and returns to the set. | Pass · browser. Pass · API for the same flow with a wrong review answer retaining Familiar. |
| Resume and revision change | Reload during wrong feedback. Then increment the set revision and reopen Learn. | Reload restores the feedback. Opening the changed Ready set shows an explanation and starts round 1. A command from the previous revision is rejected. | Pass · browser and API |
| Multi-select and retry | Set a second correct option on `q15` and increment the revision in the disposable fixture. Select both, go offline, press **Check answer**, reconnect, and retry. | The failed request preserves both selections. Retry advances after correct feedback. Missing or extra valid choices are incorrect. Duplicate or foreign option IDs return `422`. | Pass · browser and API |
| Settings and reset | Open Settings during a round summary and dismiss it. Turn on shuffle and reopen Settings after a reload. After completion, select **Reset progress** and confirm. | Settings opens and closes. Shuffle stays enabled after reload. Reset returns to question 1 in a new round 1. | Pass · browser |
| Keyboard, mobile, and motion | Select options with number keys, continue with Enter, view the round summary at 360 px, and emulate reduced motion. | Keyboard actions work. The summary fits with no horizontal overflow. The progress bar stops animating with reduced motion. | Pass · browser |
| Database restart | Reopen an MVP database with saved Learn feedback. | The same set and feedback are available after restart. | Pass · API |
| Automated checks | Run backend `uv run --locked --no-sync python -m unittest discover -s tests -v`, then frontend `npm run lint` and `npm run build`. | Backend tests pass. Lint and build complete. | Pass · CLI |

Browser checks used Chromium through Vite, FastAPI, and a disposable SQLite file.

### Settings and Continue controls

JaneQ uses the same Chakra switch for preview answer order and Learn shuffle. The preview keeps a single on/off setting for MCQ cards.

| Check | How to reproduce | Observed result |
| --- | --- | --- |
| Continue hover | In Learn, answer incorrectly and hover **Continue**. Press Enter to advance, finish the round, and hover **Continue to round 2**. | Pass · Chromium. Both buttons kept white text as their background changed from `#1858f5` to `#144bd2`. Enter advanced from incorrect feedback. |
| Preview settings | Open Settings at 1440 px. Use Tab and Space to change the switch, then click **Done**. Reopen Settings at 360 px with reduced motion enabled and press Escape. | Pass · Chromium. The preview showed the answer first. The dialog fit at 360 px with no horizontal overflow, the switch showed visible keyboard focus, and Escape returned focus to Settings. The dialog skipped its animation with reduced motion. |
| Learn settings | Open Settings during the round summary, use Space to toggle shuffle, and close with **Done**. Reload and open Settings again. | Pass · Chromium through FastAPI and disposable SQLite. The switch kept the saved value after reload. |
