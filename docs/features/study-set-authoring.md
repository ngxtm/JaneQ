# My sets and Create/Edit

## Run the flow

Use the [local setup](../../README.md#local-development) with `JANEQ_DB_PATH` pointing to a disposable SQLite file. Sign in with the configured demo account.

1. Open **My sets** from the header, then select **Create set**. Enter **HTTP methods** as the title and add one question with the prompt **Which HTTP methods are safe?**. Enter **GET** in the initial option. Use **Add answer option** twice to add **HEAD** and **POST**.
2. Select **Save set** with the three options unmarked. The editor stays open, highlights the question, focuses its first **Correct** checkbox, and shows a Chakra error toast.
3. Mark **GET** and **HEAD** as correct, then select **Save set**. The set opens as **Ready**. Reopen it from **My sets** or choose **Test**, select **GET** and **HEAD**, and submit to see **1 / 1**.
4. To delete the disposable set from its overview, select **More actions** beside the **Edit set** icon, choose **Delete set**, and confirm. My sets opens with the set removed. The editor also offers the same menu beside **Done**.

Only the owner can open an editor or study a custom set. The signed-in library also includes the seeded catalog. Home shows recently opened sets. Previously saved custom Drafts open directly in the editor from My sets, Recent, or an old overview or study-mode URL. Their content can be completed or deleted from the editor.

## Editor design

The Edit page has a floating action bar with the saved count and time, a **Done** button, and a three-dot **Delete set** menu. Below it are the large editable title, question count, full-width description, and toolbar. The numbered white cards put the prompt beside its answer choices on desktop and stack them on mobile. Drag the grip on desktop or choose **Move up** or **Move down** from the grip menu. The toolbar shows private visibility, reverses the question order, and lists keyboard shortcuts.

The supplied Quizlet reference puts the add-choice action below the definition. Each new question in JaneQ starts with one answer option. **Add answer option** sits below the current choices, adds a row, and focuses its input. Each choice has its own **Correct** checkbox and remove action.

The [shared theme](../../frontend/src/ui/theme.ts) supplies typography and focus styling. The editor keeps **Save set** and **Done** available so a save attempt can surface validation. It highlights incomplete question cards and fields, shows inline instructions, and scrolls and focuses the first invalid control. A brief horizontal shake runs on invalid submit. Reduced motion skips the shake and smooth scrolling. One Chakra toast summarizes the attempt, and inline errors clear as fields are corrected. The catalog and editor keep headings and navigation visible while loading. A static Boneyard placeholder appears in the pending region after 200 ms.

**Done** saves the full editor form, refreshes the catalog summary, clears the cached preview, and opens the set overview. **Delete set** opens a confirmation dialog with initial focus on **Cancel**. Confirming deletes the saved set and returns to My sets. A failed save or delete keeps the editor open. A revision conflict offers the latest editor in a new tab. If the session expires, sign in in a new tab before retrying. The shared navigation shows a discard dialog when leaving an edited form. The browser supplies its confirmation for a reload or tab close.

## API and storage

Use [Swagger UI](http://127.0.0.1:8000/docs) or [OpenAPI JSON](http://127.0.0.1:8000/openapi.json). Requests require the signed `janeq_session` cookie. The [feature client](../../frontend/src/features/authoring/api.ts) uses the shared Axios instance and validates the responses before rendering.

| Request | Input and outcome |
| --- | --- |
| `GET /api/study-sets` | Returns summary rows for built-in sets and sets owned by the signed-in user. My sets displays the custom rows. Each summary includes the current `revision`. |
| `POST /api/study-sets` | Creates a private set from `title`, `description`, and ordered `questions`. The response is `201` with the saved summary, including `id`, `question_count`, `configured_count`, and `status`. The browser sends an `Idempotency-Key` UUID when available. Replaying the same content with the same key returns the same set. A key that already belongs to a set with different content returns `409`. |
| `GET /api/study-sets/{set_id}/editor` | Returns the saved editor content, `revision`, and nullable UTC `saved_at`. It includes options with `text` and `is_correct`, including empty rows. |
| `PUT /api/study-sets/{set_id}/editor` | Accepts `title`, `description`, `questions`, and the loaded integer `revision`. Returns `200` with the saved summary. A stale revision returns `409` and leaves the saved set intact. |
| `DELETE /api/study-sets/{set_id}?revision=1` | Uses the revision from the displayed summary or the open editor. Returns `204` on success, `409` for a stale revision, or `404` for a missing, built-in, or foreign-owned set. |

Both write endpoints return `422` unless the set has a nonblank title and at least one question. Every question needs a nonblank prompt, two or more nonblank options, and at least one option marked correct. Blank option rows must be filled or removed. An option has `text` and a Boolean `is_correct`. The read model accepts incomplete legacy questions so the editor can display and repair them. Missing sessions return `401`. The editor returns `404` for missing sets, built-in sets, and sets owned by another account.

The [router](../../backend/app/study_sets.py) sends reads and writes through [SQLite persistence](../../backend/app/database.py). The set, question, and option writes share a transaction. The editor, Learn, and Test use the set revision to detect changes. A save with identical content keeps the revision. [Database rules](../database.md#custom-study-set-writes)

## Acceptance checks

| Check | Reproduce and expect | Observed |
| --- | --- | --- |
| Invalid save | Try an empty form, then try saving with two incomplete questions. Repeat at 360 px with reduced motion. | Pass · Chromium. The first invalid control got focus. The two cards turned red, the editor shook once, one toast appeared, and the browser sent no create request. The reduced-motion branch kept focus and inline errors without running the shake. |
| Complete save and grade | Create a set with a complete answer key and submit a Test with all correct options selected. | Pass · Chromium at 360 px and API. The complete set opened as Ready and the multi-answer Test scored 1/1. |
| Previously saved Draft | Open an old custom Draft's Test URL, attempt to save with no correct answer, and then mark one and save. | Pass · Chromium and API. The URL opened the editor, **Done** required an answer key, and the repaired set opened its Ready overview. |
| Server validation | Submit incomplete payloads directly to both write endpoints. | Pass · API. Both returned 422 for empty sets, blank prompts, insufficient or blank options, and a question missing a correct answer. The existing set and revision stayed intact. |
| Edit layout and Done | Open an owned set at 1720 px and 360 px. Edit the description and select **Done**. Reopen the set. | Pass · Chromium. The description used the full form width. The overview and reopened editor showed the saved description. The 360 px layout fit without horizontal scrolling. |
| Overview management | Open an owned set at 1440 px and 360 px. Open Edit from its icon, then open and dismiss the delete dialog with the keyboard. Change the set through the API, try deleting from the old overview, and retry after reloading. | Pass · Chromium and API. Edit opened the editor. Escape restored focus to **More actions**. The stale deletion returned `409`, and a fresh confirmation returned `204` and opened My sets. The built-in overview displayed only study actions. |
| Delete confirmation and retry | Select **More actions** and **Delete set**. Cancel once, then confirm. Abort a delete request and retry after restoring the connection. | Pass · Chromium and API. Cancel preserved the set. The failed request showed an inline error and the retry returned `204`. My sets opened without the deleted set. The API also rejected stale revisions and verified cascading deletion. |
| Ownership and built-in catalog | Submit a valid editor request for a built-in set and repeat against another username's custom set. Check the other account's catalog, preview, Learn, and Test. | Pass · API. Editor requests returned 404. The other account could access the built-in Test and received 404 for private study routes. |
| Stale revisions | Open the same editor in two tabs and save one before the other. Open a Test paper, then edit an answer key and submit the original paper. | Pass · Chromium and API. The editor showed the conflict, retained the first tab's form, and opened the saved version in a new tab. The original Test revision was rejected in the API suite. |
| Save retry | Abort the editor save request in Chromium, then retry with the request restored. At the API, repeat a create with the same creation key. | Pass · Chromium and API. The failed editor save kept the entered description and retry persisted it. The create retry returned the original set ID and one list row. |
| Editor loading | Delay the editor GET and open a set from My sets. Expect the shared header to stay mounted while the form loads. | Pass · Chromium. The same header remained mounted and the metadata placeholder appeared before the form. |
| Keyboard and responsive design | At 1440 px and 360 px, inspect the cards, use Tab and Space on **Correct**, add an option, and press browser Back with changes pending. | Pass · Chromium. Desktop showed two columns. Mobile stacked the fields within the viewport. Adding an option focused its input. Tab focused the checkbox and Space selected it. Browser Back showed the discard dialog and Escape preserved the form. |
| Backend, lint, and build | Run the commands below. | Pass · CLI. All 20 backend tests, lint, and the production build passed. |

From `backend/`:

```powershell
uv run --locked --no-sync python -m unittest discover -s tests -v
```

From `frontend/`:

```powershell
npm run lint
npm run build
```
