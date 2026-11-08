# Test, Results, and PDF download

## Run the flow

Use the [local development setup](../../README.md#local-development). Set `JANEQ_DB_PATH` to a fresh, disposable SQLite path before starting FastAPI. Start Vite, open [JaneQ](http://127.0.0.1:5173/), and sign in with the configured demo account.

1. From **Home**, open **HTML / CSS**, then select **Test**. The direct browser route is [`/#set/html-css/test`](http://127.0.0.1:5173/#set/html-css/test).
2. Select `<ul>`, `background-color: navy`, and **The img element's alt attribute**, in order. Each answered question increases the counter once, even when it has several checked options. **Submit test** becomes available at `3/3 answered`.
3. Submit and check **Your results**. The score is **2 / 3 (67%)**, with question 2 marked incorrect. The review labels each selected option and each correct answer.
4. Select **Download PDF** and open `html-css-test-results.pdf`. Verify the score, all three question reviews, signed-in username, and submission time. **New test** loads a fresh paper. **Back** returns to the Study Set. [PDF downloaded during mobile review](test-results.sample.pdf)

| Question | Selected option | Correct option | Outcome |
| --- | --- | --- | --- |
| `q15` | `q15-a` · `<ul>` | `q15-a` · `<ul>` | Correct |
| `q16` | `q16-a` · `background-color: navy` | `q16-c` · `color: navy` | Incorrect |
| `q24` | `q24-a` · alt attribute | `q24-a` · alt attribute | Correct |

Results stay on the Test route and live in the current browser view. Leaving the route or reloading starts a new paper when Test is opened again. Results and the PDF share the percentage and option labels derived from the grading response. Each **Download PDF** click starts a Web Worker that loads React PDF and generates the file locally. If the worker cannot load or render the report, the inline error leaves the existing Results ready for another click. The sample uses the seeded catalog and a disposable demo account. [Shared review data](../../frontend/src/features/test/result-review.ts)

## Report layout

The report uses A4 portrait, an 18 pt title, and 10.5–11 pt body text. The header repeats the JaneQ name and existing SVG mark as vector artwork. The first page shows the study set and score, **Submitted by**, and **Submitted at** with seconds and the browser's time zone offset. The footer gives the export date and page number. Question prompts stay in the original language and order. Each review uses the same English labels as Results and lists the selected and correct answers separately. Short reviews stay together across page breaks. Review dividers follow each question except the last, so continuation pages have only the header rule above the first review.

The template embeds static Open Sans fonts, including Vietnamese glyphs. It loads the Noto Sans TC fallback only when Open Sans lacks a glyph in a title, name, question, or answer. Noto Sans TC is a separate 4.3 MB asset. The report keeps mixed-script text selectable and shows an inline error if the available fonts cannot display a character.

Open Sans comes from commit `8e14d710`. The Noto Sans TC asset comes from the regional `NotoSansTC-VF.ttf` at commit `f8d1575`. To regenerate it, use FontTools `varLib.instancer` with `wght=400 --static`, then use `pyftsubset` with `--unicodes=* --layout-features=* --name-IDs=* --flavor=woff`. [Report template](../../frontend/src/features/test/result-pdf.worker.tsx) · [Open Sans license](../../frontend/src/features/test/fonts/OFL.txt) · [Noto Sans TC source](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/Variable/TTF/Subset/NotoSansTC-VF.ttf) · [Noto license](../../frontend/src/features/test/fonts/NotoSansTC-OFL.txt)

## Test and Results design


**Test and Results layout.** The design uses a centered column, timeline markers, two-column answer choices at wider widths, and a score ring that scales down on narrow screens. Results switches from a horizontal summary to stacked sections and shows status icons in the timeline.

JaneQ carries those dimensions and the Outfit, Open Sans, and Tabler treatments into its shared library shell. The paper presents the original MCQs in catalog order, with Chakra radios, checkboxes, an answered counter, and visible keyboard focus. All questions require a selection, so the footer uses a disabled **Submit test** until the paper is complete. The review reuses the paper cards and adds text labels beside the green and red marks. The Results header wraps **Download PDF**, **New test**, and **Back** at 360 px. The score card groups single-choice and multiple-select questions. The layout shows the ready paper or review immediately, with a static Boneyard placeholder after 200 ms during paper loading and an inline recovery panel for failures.

The local [MCQ research report](../../../interview/docs/MCQ_RESEARCH_REPORT.md) informed the split between answer selection, server grading, and review. The report's comparison with ClassQuiz informed the exact-set scoring and validation at the API boundary.

## API and storage

Use the generated [Swagger UI](http://127.0.0.1:8000/docs) or [OpenAPI JSON](http://127.0.0.1:8000/openapi.json). Both calls use the signed `janeq_session` cookie and go through the [shared Axios client](../../frontend/src/http.ts). The [feature client](../../frontend/src/features/test/api.ts) validates the response before rendering. A `401` returns the app to sign-in.

| Request | Contract |
| --- | --- |
| `GET /api/study-sets/{set_id}/test` | Opening Test loads `set_id`, `title`, `revision`, and ordered `questions`. Each question has `id`, `prompt`, `options` containing `id` and `text`, and a `multiple` boolean. |
| `POST /api/study-sets/{set_id}/test` | Submit the paper's integer `revision` and an `answers` list containing one `{question_id, selected_ids}` entry per question. The response gives `score`, `total`, paper metadata, and graded questions. Each graded question adds `selected_ids`, `correct_ids`, and `correct`. The response also includes `submitted_by` from the signed session and `submitted_at` as a server-generated UTC date-time, such as `2026-11-08T09:30:00Z`. |

For the sample, send `revision: 1` and selections `["q15-a"]`, `["q16-a"]`, and `["q24-a"]` on their corresponding questions. The server checks for missing, unknown, or duplicate question IDs, empty or duplicate selections, choices from another question, and extra choices on single-answer questions. Invalid submissions return `422`. A question earns one point only when the selected and correct ID sets match exactly. The server returns questions and selected IDs in catalog order for review and export.

Both calls return `404` for a missing set and `409` with `detail.code: "draft"` and `detail.remaining_questions` for a Draft set. A Draft set with zero questions reports zero remaining and the UI asks the learner to add a configured question. A stale Ready submission returns `409` with `detail.code: "revision_changed"`. **Open a new test** clears the old choices and requests the current paper. A failed connection during submit leaves the choices available for another **Submit test**.

The [Test router](../../backend/app/test.py) checks readiness and revision with the shared [question bank reader](../../backend/app/question_bank.py). Each request reads the set, question order, and option keys from one SQLite snapshot. [Database reference](../database.md#test-read-snapshot)

## Reproduce failure checks

Use the disposable database from setup. Before changing it, open the HTML / CSS paper at revision 1 and answer all three questions. Then apply the following SQL to that database.

```sql
BEGIN;
UPDATE answer_options SET is_correct = 1 WHERE id = 'q15-b';
UPDATE study_sets SET revision = revision + 1 WHERE id = 'html-css';
COMMIT;
```

Submit the open paper to exercise the revision conflict. Select **Open a new test** and use the checkboxes on question 1. Try both `<ul>` and `<ol>`, then use **New test** to try only `<ul>`. To make the set Draft, clear both keys for question 1 and refresh the Study Set.

```sql
BEGIN;
UPDATE answer_options SET is_correct = 0 WHERE question_id = 'q15';
UPDATE study_sets SET revision = revision + 1 WHERE id = 'html-css';
COMMIT;
```

## Acceptance checks

Browser checks used Chromium with Vite, FastAPI, and disposable SQLite databases at 1440 and 360 px. The worker retry, font, layout, and CLI checks were repeated after the export fixes. The remaining passing checks carry forward from the Test and PDF milestones.

| Check | Reproduce and expect | Observed |
| --- | --- | --- |
| Ready flow and PDF | Complete the sample from Home at both widths, then download from Results. Expect 2/3 and matching question reviews. | Pass · Chromium and PDF. Both downloads showed 2/3. PDF text matched the graded prompts, correctness, selections, correct answers, demo username, and submission timestamp. |
| Report layout | Download the HTML / CSS sample and the 20-question .NET and C# report. Render all pages and check the headings, logo, font, and footer. | Pass · Chromium and PDF on the production build. At 360 px the HTML / CSS report was one A4 page with 2/3. At 1440 px the .NET report was four A4 pages with 4/20. Extracted text matched the grading response for every prompt and review. The vector logo and page numbering appeared on every page. |
| Report dividers | Complete the 20-question .NET and C# test and select **Download PDF**. Expect one rule above the first review on each continuation page and one rule between adjacent reviews. Repeat with the one-page HTML / CSS report and check the rule under **Question review**. | Pass · Chromium and PDF. Captured the generated PDFs at 1440 px and 360 px, respectively. The four-page report had one rule above the first review on pages 2–4, and both reports retained the first-page review heading rule, separators between questions, and page numbering. |
| PDF retry | In Chromium, make the first PDF Blob URL creation throw, then select **Download PDF** again. | Pass · Chromium. Results displayed the inline error, retained the score, and downloaded the PDF on retry. |
| Worker retry | On the production build, block `/assets/result-pdf.worker-*.js`, click **Download PDF**, unblock the script, then click again on the same screen. Repeat a normal download through the Vite dev server. | Pass · Chromium and PDF at 360 px. Two worker requests were observed in the production build. The first failed and the second downloaded the report with the original score and submission time. The dev server also downloaded the report. |
| Report glyph coverage | Sign in as a disposable `王小明 Nguyễn` account and export. Extract PDF text and compare the name to `submitted_by`. Send a worker test request with an unsupported character such as `𐰀`. | Pass · Chromium and PDF. The mixed-script name rendered and extracted exactly. The worker returned the unsupported-text result for `𐰀` and produced no PDF. |
| Responsive layout and navigation | Inspect the paper and Results at both widths. Use **Back** and **New test**. | Pass · Chromium. The paper used two columns at 1440 px and one at 360 px, with no horizontal overflow. The score ring measured 140 px and 100 px respectively. Back returned to the overview and New test cleared progress. |
| Keyboard and reduced motion | Use arrows on radios and Tab and Space on checkboxes. Enable reduced motion before submitting. | Pass · Chromium. Both controls had a visible 2 px focus outline. Results moved focus to its heading. The score ring had a 0 s transition under reduced motion. |
| Missing, duplicate, or invalid selections | Stop at two answers, then send an incomplete POST through the signed-in browser. Exercise duplicate question IDs, empty choices, duplicate choices, foreign choices, and multiple IDs on a radio question in the backend tests. | Pass · Chromium and API. The button stayed disabled at 2/3 and the incomplete POST returned 422. The backend rejected the other invalid submissions with 422. |
| Revision and exact-set grading | Apply the first SQL fixture while a paper is open. Submit the stale paper, open the new one, and test complete and partial selections. | Pass · Chromium and API. The stale paper offered **Open a new test**. Both checked options earned the point. A partial selection lost it at 360 px. The API also verified that an extra option loses the point. |
| Draft and session | Apply the second fixture and refresh the set, then navigate directly to its Test URL. Run the unsigned GET and POST tests. | Pass · Chromium and API. The disabled card explained that one question needed configuration. The direct route rendered zero questions and returned 409. Both unsigned calls returned 401. |
| Loading and network retry | Delay the paper request, then let it finish. Abort a load and retry. Abort a submit after all questions are answered, then restore the request and submit again. | Pass · Chromium. The Test header was visible immediately and the skeleton appeared during the delayed response. Both retries succeeded. The failed submit retained all three choices and the answered count. |
| Read-only grading | Inspect the disposable database in read-only mode after Test runs. | Pass · SQLite. It had the five catalog and Learn tables and zero Learn progress rows. Test introduced no attempt or export table. |
| Backend, lint, and build | Run the checks below from the indicated directories. | Pass · CLI. All 13 backend tests passed. Lint and build completed. Vite emitted the PDF worker as a separate asset. |

From `backend/`:

```powershell
uv run --locked --no-sync python -m unittest discover -s tests -v
```

From `frontend/`:

```powershell
npm run lint
npm run build
```
