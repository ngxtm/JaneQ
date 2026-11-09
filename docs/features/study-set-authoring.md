# My sets and Create/Edit

## Run the flow

Use the [local setup](../../README.md#local-development) with `JANEQ_DB_PATH` pointing to a disposable SQLite file. Sign in with the configured demo account.

1. Select **Create** beside **My sets** in the header, or open **My sets** and select **Create set**. Enter **HTTP methods** as the title and add one question with the prompt **Which HTTP methods are safe?**. Enter **GET** and **HEAD** in the initial options. Use **Add answer option** to add **POST**.
2. Select **Save set** with the three options unmarked. The editor stays open, highlights the question, focuses its first **Correct** checkbox, and shows a Chakra error toast.
3. Mark **GET** and **HEAD** as correct, then select **Save set**. The set opens as **Ready**. Reopen it from **My sets** or choose **Test**, select **GET** and **HEAD**, and submit to see **1 / 1**.
4. To delete the disposable set from its overview, select **More actions** beside the **Edit set** icon, choose **Delete set**, and confirm. My sets opens with the set removed. The editor also offers the same menu beside **Done**.

Only the owner can open an editor or study a custom set. The signed-in library also includes the seeded catalog. Home shows recently opened sets. Previously saved custom Drafts open directly in the editor from My sets, Recent, or an old overview or study-mode URL. Their content can be completed or deleted from the editor.

In **My sets**, click anywhere on a Ready set card to open its overview. The row uses the same Chakra link overlay as Home and shows a focus outline when reached with Tab. **Edit** has its own link and Tab stop.

## Editor design

The Edit page has a floating action bar with the saved count and time, a **Done** button, and a three-dot **Delete set** menu. Below it are the large editable title, question count, full-width description, and toolbar. The numbered white cards put the prompt beside its answer choices on desktop and stack them on mobile. Drag the grip on desktop or choose **Move up** or **Move down** from the grip menu. The toolbar shows private visibility, reverses the question order, and lists keyboard shortcuts.

The supplied Quizlet reference puts the add-choice action below the definition. Each new question starts with two answer rows. Fill at least two options and mark at least one correct before saving. **Add answer option** adds a row and focuses its input. Each choice has its own **Correct** checkbox and remove action. If an older set has a question with only one option, open it from **My sets**, add a second option, and save to make it Ready for study.

The [shared theme](../../frontend/src/ui/theme.ts) supplies typography and focus styling. The editor keeps **Save set** and **Done** available so a save attempt can surface validation. It highlights incomplete question cards and fields, shows inline instructions, and scrolls and focuses the first invalid control. A brief horizontal shake runs on invalid submit. Reduced motion skips the shake and smooth scrolling. One Chakra toast summarizes the attempt, and inline errors clear as fields are corrected. The catalog and editor keep headings and navigation visible while loading. A static Boneyard placeholder appears in the pending region after 200 ms.

The title, prompt, and answer fields use the shared `flushed` variant, and the description uses `subtle`. The lighter borders keep the title legible as the page heading and separate editable rows inside each card. Tab through the fields to check focus and submit an invalid question to check the error styling.

**Done** saves the full editor form, refreshes the catalog summary, clears the cached preview, and opens the set overview. **Delete set** opens a confirmation dialog with initial focus on **Cancel**. The confirmation button keeps its label while the request runs. After deletion, My sets opens if the user is still on the screen that started the delete. If the user has moved on, the catalog updates in place. A failed save or delete keeps the editor open. A revision conflict offers the latest editor in a new tab. If the session expires, sign in in a new tab before retrying. The shared navigation shows a discard dialog when leaving an edited form. The browser supplies its confirmation for a reload or tab close.

## API and storage

Use [Swagger UI](http://127.0.0.1:8000/docs) or [OpenAPI JSON](http://127.0.0.1:8000/openapi.json). Requests require the signed `janeq_session` cookie. The [feature client](../../frontend/src/features/authoring/api.ts) uses the shared Axios instance and validates the responses before rendering.

| Request | Input and outcome |
| --- | --- |
| `GET /api/study-sets` | Returns summary rows for built-in sets and sets owned by the signed-in user. My sets displays the custom rows. Each summary includes the current `revision`. |
| `POST /api/study-sets` | Creates a private set from `title`, `description`, and ordered `questions`. The response is `201` with the current summary. The browser sends an `Idempotency-Key` UUID when available. Replaying the original content returns the same set ID even after edits, or `410` if the set was deleted. A different payload or a legacy key without a recorded fingerprint returns `409`. The editor keeps the form and links to My sets in a new tab for either error. |
| `GET /api/study-sets/{set_id}/editor` | Returns the saved editor content, `revision`, and nullable UTC `saved_at`. It includes options with `text` and `is_correct`, including empty rows. |
| `PUT /api/study-sets/{set_id}/editor` | Accepts `title`, `description`, `questions`, and the loaded integer `revision`. Returns `200` with the saved summary. A stale revision returns `409` and leaves the saved set intact. |
| `DELETE /api/study-sets/{set_id}?revision=1` | Uses the revision from the displayed summary or the open editor. Returns `204` on success, `409` for a stale revision, or `404` for a missing, built-in, or foreign-owned set. |

Both write endpoints return `422` unless the set has a nonblank title and at least one question. Every question needs a nonblank prompt and at least two nonblank options, with at least one marked correct. Blank option rows must be filled or removed. Options with identical trimmed text must agree on whether they are correct. An option has `text` and a Boolean `is_correct`. The read model accepts incomplete legacy questions so the editor can display and repair them. Missing sessions return `401`. The editor returns `404` for missing sets, built-in sets, and sets owned by another account.

The [router](../../backend/app/study_sets.py) sends reads and writes through [SQLite persistence](../../backend/app/database.py). The set, question, and option writes share a transaction. The editor, Learn, and Test use the set revision to detect changes. A save with identical content keeps the revision. [Database rules](../database.md#custom-study-set-writes)

## Acceptance checks

| Check | Reproduce and expect | Observed |
| --- | --- | --- |
| My sets card navigation | Click the blank center of a Ready card to open its overview. Go Back and click **Edit** to open the editor. Tab to the card and press Enter. | Pass · Chromium. Center click and Edit opened their respective views at 1440 px and 360 px. The border highlighted on hover, and the header stayed mounted during overview navigation and Back. At 360 px, the card showed a focus outline, Edit had a separate Tab stop, and Enter on the card opened the overview. |
| Quick Create | From Home, select **Create**. Go Back and use Enter on the link at a narrow viewport. | Pass · Chromium at 1440 px and 320 px. Both actions opened `/my-sets/new`. The header stayed mounted, fit the viewport, and the account menu opened. |
| Invalid save | Try an empty form, then try saving with two incomplete questions. Repeat at 360 px with reduced motion. | Pass · Chromium. The first invalid control got focus. The two cards turned red, the editor shook once, one toast appeared, and the browser sent no create request. The reduced-motion branch kept focus and inline errors without running the shake. |
| Complete save and grade | Create a set with a complete answer key and submit a Test with all correct options selected. | Pass · Chromium at 360 px and API. The complete set opened as Ready and the multi-answer Test scored 1/1. |
| Previously saved Draft | Open an old custom Draft's Test URL, attempt to save with no correct answer, and then mark one and save. | Pass · Chromium and API. The URL opened the editor, **Done** required an answer key, and the repaired set opened its Ready overview. |
| Server validation | Submit incomplete payloads directly to both write endpoints. | Pass · API. Both returned 422 for empty sets, blank prompts, missing or blank options, and a question missing a correct answer. The existing set and revision stayed intact. |
| Minimum answer options | Fill only the first option, mark it correct, and try saving. Fill the second option and try again. Send a one-option payload to each write endpoint. | Pass · Chromium at 360 px and 1440 px and API. The editor highlighted the incomplete question and focused the second option. After it was filled, the set opened as Ready. In Edit, removing the second row blocked Done. Adding it back let Done save, and reopening Edit showed the new text. Both write endpoints rejected the one-option payload. The API accepted a second option on a previously saved one-option set. |
| Repair a one-option set | In a disposable database, seed an older set with one option. Open Preview, Learn, and Test, then add a second option in the editor and save. | Pass · API. The catalog listed the set as Draft and all three study endpoints returned `409`. Saving the second option made the set Ready, and both Learn and Test returned the saved choices. |
| Edit layout and Done | Open an owned set at 1720 px and 360 px. Edit the description and select **Done**. Reopen the set. | Pass · Chromium. The description used the full form width. The overview and reopened editor showed the saved description. The 360 px layout fit without horizontal scrolling. |
| Overview management | Open an owned set at 1440 px and 360 px. Open Edit from its icon, then open and dismiss the delete dialog with the keyboard. Change the set through the API, try deleting from the old overview, and retry after reloading. | Pass · Chromium and API. Edit opened the editor. Escape restored focus to **More actions**. The stale deletion returned `409`, and a fresh confirmation returned `204` and opened My sets. The built-in overview displayed only study actions. |
| Delete confirmation and retry | Select **More actions** and **Delete set**. Cancel once, then confirm. Abort a delete request and retry after restoring the connection. | Pass · Chromium and API. Cancel preserved the set. The failed request showed an inline error and the retry returned `204`. My sets opened without the deleted set. The API also rejected stale revisions and verified cascading deletion. |
| Ownership and built-in catalog | Submit a valid editor request for a built-in set and repeat against another username's custom set. Check the other account's catalog, preview, Learn, and Test. | Pass · API. Editor requests returned 404. The other account could access the built-in Test and received 404 for private study routes. |
| Stale revisions | Open the same editor in two tabs and save one before the other. Open a Test paper, then edit an answer key and submit the original paper. | Pass · Chromium and API. The editor showed the conflict, retained the first tab's form, and opened the saved version in a new tab. The original Test revision was rejected in the API suite. |
| Save retry | Abort the editor save request in Chromium, then retry with the request restored. At the API, repeat a create with the same creation key. | Pass · Chromium and API. The failed editor save kept the entered description and retry persisted it. The create retry returned the original set ID and one list row. |
| Editor loading | Delay the editor GET and open a set from My sets. Expect the shared header to stay mounted while the form loads. | Pass · Chromium. The same header remained mounted and the metadata placeholder appeared before the form. |
| Keyboard and responsive design | At 1440 px and 360 px, inspect the cards, use Tab and Space on **Correct**, add an option, and press browser Back with changes pending. | Pass · Chromium. Desktop showed two columns. Mobile stacked the fields within the viewport. Adding an option focused its input. Tab focused the checkbox and Space selected it. Browser Back showed the discard dialog and Escape preserved the form. |
| Create replay after edit and delete | Create with a key, edit the title, replay the original and edited payloads, then delete and replay the original payload. | Pass · API. The original payload returned the current summary after the edit and `410` after deletion. The edited payload returned `409`. |
| Metadata-only edit | Open a Test paper, edit only the description, then fetch a new paper. | Pass · API. The set revision increased and question and option IDs stayed the same. |
| Conflicting answer choices | Give two options identical text after trimming, mark only one correct, and try to save. Correct the duplicate and save again. | Pass · API and Chromium at 360 px. Both write endpoints rejected the conflict. The editor highlighted both rows, focused the first option, and saved after the text was corrected. |
| Delete while navigating | Delay the overview's delete response, return to another set's editor, and type into its description before the response arrives. | Pass · Chromium at 1440 px. The pending button kept its label and was disabled. The editor stayed open with the new description and the deleted set disappeared from My sets. At 360 px, confirming a deletion while staying on the overview returned to My sets and showed the updated empty-state instructions. |
| Focus during My sets loading | Delay the My sets module, follow the header link, and Tab to the account menu before it loads. | Pass · Chromium at 1440 px. The account menu kept focus after My sets loaded. |
| Backend, lint, and build | Run the commands below. | Pass · CLI. All 22 backend tests, lint, and the production build passed. |

From `backend/`:

```powershell
uv run --locked --no-sync python -m unittest discover -s tests -v
```

From `frontend/`:

```powershell
npm run lint
npm run build
```
