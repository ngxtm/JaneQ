# My sets and Create/Edit

## Run the flow

Use the [local setup](../../README.md#local-development) with `JANEQ_DB_PATH` pointing to a disposable SQLite file. Sign in with the configured demo account.

1. Open **My sets** from the header, then select **Create set**. Enter **HTTP methods** as the title and add one question with the prompt **Which HTTP methods are safe?**. Enter **GET** in the initial option. Use **Add answer option** twice to add **HEAD** and **POST**.
2. Select **Save draft** with the three options unmarked. The overview shows **Draft**, one question, and a disabled Test action. Select **Back to My sets** and reload. The saved draft appears with its question count and an **Edit** link.
3. Open **Edit**, mark **GET** and **HEAD** as correct, then select **Done**. The same set opens as **Ready**. Select **Test**, choose **GET** and **HEAD**, and submit. Results shows **1 / 1** and marks the two selected answers correct.
4. To delete the disposable set from its overview, select **More actions** beside the **Edit set** icon, choose **Delete set**, and confirm. My sets opens with the set removed. The editor also offers the same menu beside **Done**.

Only the owner can open an editor or study a custom set. The signed-in library still includes the seeded catalog, which is available for study. Home shows recently opened sets. My sets gives the owner a dedicated list of saved Draft and Ready sets.

## Editor design

The Edit page has a floating action bar with the saved count and time, a **Done** button, and a three-dot **Delete set** menu. Below it are the large editable title, question count, full-width description, and toolbar. The numbered white cards put the prompt beside its answer choices on desktop and stack them on mobile. Drag the grip on desktop or choose **Move up** or **Move down** from the grip menu. The toolbar shows private visibility, reverses the question order, and lists keyboard shortcuts.

The supplied Quizlet reference puts the add-choice action below the definition. Each new question in JaneQ starts with one answer option. **Add answer option** sits below the current choices, adds a row, and focuses its input. Each choice has its own **Correct** checkbox and remove action.

The [shared theme](../../frontend/src/ui/theme.ts) supplies JaneQ typography and focus styling. My sets has a dedicated empty panel with a create action. The editor has a question-empty panel inside the form, so a title-only Draft can be saved. The catalog and editor keep headings and navigation visible while loading. A static Boneyard placeholder appears in the pending region after 200 ms. Load failures offer a retry where applicable.

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

For a title-only Draft, send `{"title":"HTTP methods","questions":[]}`. A question takes `prompt` and `options`. A title with only whitespace, a correct option without text, and malformed payloads return `422`. Missing sessions return `401`. The editor returns `404` for missing sets, built-in sets, and sets owned by another account. The account and source kind come from server state.

The [router](../../backend/app/study_sets.py) sends reads and writes through [SQLite persistence](../../backend/app/database.py). The set, question, and option writes share a transaction. The editor, Learn, and Test use the set revision to detect changes. A save with identical content keeps the revision. [Database rules](../database.md#custom-study-set-writes)

## Acceptance checks

| Check | Reproduce and expect | Observed |
| --- | --- | --- |
| Create, reopen, edit, and grade | Run the sample above. Expect Draft after reload, Ready after editing, and a 1/1 Test result. | Pass · Chromium and API on disposable SQLite. Browser creation at 1440 px and editing and grading at 360 px produced 1/1. The API suite reopened the database and verified the saved draft and answer key. |
| Initial answer option | Add a new question. Enter one correct answer, then add and fill a second option. | Pass · Chromium. The new question had one option and offered **Save draft**. **Add answer option** appended and focused the second input. Filling it allowed the set to be saved as Ready. |
| Edit layout and Done | Open an owned set at 1720 px and 360 px. Edit the description and select **Done**. Reopen the set. | Pass · Chromium. The description used the full form width. The overview and reopened editor showed the saved description. The 360 px layout fit without horizontal scrolling. |
| Overview management | Open an owned set at 1440 px and 360 px. Open Edit from its icon, then open and dismiss the delete dialog with the keyboard. Change the set through the API, try deleting from the old overview, and retry after reloading. | Pass · Chromium and API. Edit opened the editor. Escape restored focus to **More actions**. The stale deletion returned `409`, and a fresh confirmation returned `204` and opened My sets. The built-in overview displayed only study actions. |
| Delete confirmation and retry | Select **More actions** and **Delete set**. Cancel once, then confirm. Abort a delete request and retry after restoring the connection. | Pass · Chromium and API. Cancel preserved the set. The failed request showed an inline error and the retry returned `204`. My sets opened without the deleted set. The API also rejected stale revisions and verified cascading deletion. |
| Ownership and built-in catalog | Submit a valid editor request for a built-in set and repeat against another username's custom set. Check the other account's catalog, preview, Learn, and Test. | Pass · API. Editor requests returned 404. The other account could access the built-in Test and received 404 for private study routes. |
| Stale revisions | Open the same editor in two tabs and save one before the other. Open a Test paper, then edit an answer key and submit the original paper. | Pass · Chromium and API. The editor showed the conflict, retained the first tab's form, and opened the saved version in a new tab. The original Test revision was rejected in the API suite. |
| Save retry | Abort the editor save request in Chromium, then retry with the request restored. At the API, repeat a create with the same creation key. | Pass · Chromium and API. The failed editor save kept the entered description and retry persisted it. The create retry returned the original set ID and one list row. |
| Editor loading | Delay the editor GET and open a set from My sets. Expect the shared header to stay mounted while the form loads. | Pass · Chromium. The same header remained mounted and the metadata placeholder appeared before the form. |
| Keyboard and responsive design | At 1440 px and 360 px, inspect the cards, use Tab and Space on **Correct**, add an option, and press browser Back with changes pending. | Pass · Chromium. Desktop showed two columns. Mobile stacked the fields within the viewport. Adding an option focused its input. Tab focused the checkbox and Space selected it. Browser Back showed the discard dialog and Escape preserved the form. |
| Backend, lint, and build | Run the commands below. | Pass · CLI. All 19 backend tests, lint, and the production build passed. |

From `backend/`:

```powershell
uv run --locked --no-sync python -m unittest discover -s tests -v
```

From `frontend/`:

```powershell
npm run lint
npm run build
```
