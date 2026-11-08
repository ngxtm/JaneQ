# Demo sign-in and Home

## Scope

A user signs in with the configured demo account and sees the study sets available in JaneQ. Reloading the page restores a valid session. Signing out returns the user to the sign-in form.

Home lists the six built-in study sets from SQLite. Cards show the question count and Draft or Ready status. Opening a card shows a read-only overview with answer-key coverage and records the visit under Recent. Creating and editing sets belong to the authoring flow.

## Run the flow

1. Follow the [local setup](../../README.md#local-development) to configure the demo account and start both servers.
2. Open [JaneQ](http://127.0.0.1:5173/) and sign in with the username and password from `backend/.env`.
3. Open a card from **Built-in sets**. Select **Back to Home** to see it under **Recent**. Reload, then choose **Sign out** from the account menu.

## Follow the code

| Action | Frontend | Backend |
| --- | --- | --- |
| Submit the sign-in form | [Login](../../frontend/src/features/auth/Login.tsx) calls `signIn` in the [auth client](../../frontend/src/features/auth/api.ts). | `POST /api/auth/login` in [auth.py](../../backend/app/auth.py) checks the credentials and writes the signed session. It returns the username or `401`. |
| Open or reload JaneQ | [App](../../frontend/src/App.tsx) calls `getUser` to choose the screen. | `GET /api/auth/me` returns the username for a valid cookie or `401` for a missing or invalid session. |
| Load Home | [Home](../../frontend/src/features/study-sets/Home.tsx) calls `getStudySets` in the [study sets client](../../frontend/src/features/study-sets/api.ts). | `GET /api/study-sets` in [study_sets.py](../../backend/app/study_sets.py) checks the session and reads set summaries from SQLite. |
| Sign out | `handleSignOut` in App calls `signOut` and returns to the sign-in screen on success. | `POST /api/auth/logout` clears the session cookie and returns `204`. |

Both clients use the shared [Axios instance](../../frontend/src/http.ts) for same-origin `/api` requests. Each client reads `response.data` and validates its response shape. The app shell owns the session, and Home owns the list loading and retry state.

[main.py](../../backend/app/main.py) wires up the routers and initializes SQLite on startup. The [database reference](../database.md#study-set-status-on-home) explains how `list_study_sets()` reads the tables to compute the counts and status shown on Home.

## API contract

FastAPI generates the endpoint and schema reference from the backend. With the backend running, use [ReDoc](http://127.0.0.1:8000/redoc) for reading, [Swagger UI](http://127.0.0.1:8000/docs) for trying requests, and [OpenAPI JSON](http://127.0.0.1:8000/openapi.json) for tooling.

| Request | Session or input | Success | Failure and UI behavior |
| --- | --- | --- | --- |
| `POST /api/auth/login` | JSON with `username` and `password` | `200` with the configured username, such as `{ "username": "demo" }`. Sets the signed session cookie. | `401` for incorrect credentials. The form shows the invalid-credentials message. |
| `GET /api/auth/me` | Valid session cookie | `200` with the signed-in username. The app opens Home. | `401` for a missing or invalid session. The app shows Sign in. |
| `GET /api/study-sets` | Valid session cookie | `200` with a list of study set summaries. Home renders the cards from that list. | `401` for a missing or invalid session. Home returns to Sign in. Other load errors show **Try again**. |
| `POST /api/auth/logout` | The UI calls this from the signed-in account menu. | `204` with an empty body. The response clears the session cookie if present. | A failed request keeps the current screen and shows a sign-out error. |

Here is a one-item excerpt from the `GET /api/study-sets` response on a fresh database.

```json
[
  {
    "id": "html-css",
    "title": "HTML / CSS",
    "description": "",
    "source_kind": "builtin",
    "question_count": 3,
    "configured_count": 0,
    "status": "draft"
  }
]
```

The backend declares this shape in `StudySetSummary` and the frontend checks it in `getStudySets()`. The `401` responses above describe observed runtime behavior. The generated schema currently covers the success responses, and the authentication errors are documented here alongside their UI effects. [FastAPI study sets router](../../backend/app/study_sets.py) · [React study sets client](../../frontend/src/features/study-sets/api.ts)

## Design references

The [frontend UI guide](../frontend.md) covers shared actions, states, and accessibility checks used across screens.

The MCQ research report informed JaneQ's card-based Home and feature-specific FastAPI router with a shared authentication check. See [ClassQuiz's protected results router](https://github.com/mawoka-myblock/ClassQuiz/blob/master/classquiz/routers/results.py).

For the later Test and Results flow, JaneQ's backend will own grading. The research report points to [react-quiz-component's hook](https://github.com/wingkwong/react-quiz-component/blob/develop/src/lib/engine/use-quiz.ts) for separating quiz state from presentation.

### Login design

JaneQ's Vite sign-in uses a centered layout, outlined inputs, Outfit headings, Open Sans body text, blue accents, and a demo username and password form.

[The JaneQ theme](../../frontend/src/ui/theme.ts) defines the outline input. On keyboard focus, Chakra uses the same color on the field border and the adjacent ring with zero gap. The sign-in route loads the Chakra components and bundled fonts on demand.

Verified in Chromium with Tab navigation on both fields, a 360 px viewport, and a sign-in, session restore, and sign-out pass.

## Acceptance checks

| Check | How to reproduce | Expected result | Verification |
| --- | --- | --- | --- |
| Missing session | Open JaneQ in a fresh browser session and request `/api/study-sets`. | JaneQ shows Sign in. The API returns `401` with `{"detail":"Sign in first."}`. | **Pass · API** for the endpoint response. |
| Credentials and Home data | Submit an incorrect password, then sign in with the configured credentials. | The form shows the credential error. A valid sign-in opens Home with six built-in sets and 41 questions on a fresh database. | **Pass · API** for both login responses and the returned set counts. **Pass · browser (earlier milestone)** for valid sign-in. |
| Session restore and sign-out | Reload Home, sign out, then reload again. | The first reload restores Home. Sign-out clears the session and the final reload shows Sign in. | **Pass · API** for session lookup and cookie clearing. **Pass · browser (earlier milestone)** for reload and sign-out. |
| Login on a narrow screen | At 360 px, use Tab to focus the username and password fields. | The form fits, the fields have accessible names, and each focused field shows a continuous blue ring. | **Pass · browser (Login design verification)**. |
| Home retry | Block `/api/study-sets`, unblock it, then select **Try again**. | Home shows a load error and then restores the cards. | **Pass · browser (Home design verification)** for retry after a network failure. |
| Home navigation and Recent | With a fresh browser profile, select **Browse study sets**, open two different cards, return Home, and reload. | Both visits appear under Recent, newest first, and persist after reload. | **Pass · browser (Home design verification)** for browser Back and Recent ordering after reload. |
| Home on a narrow screen | Open Home at 360 px. Focus the account menu, press Enter, press Escape to return focus to the trigger, then reopen it and use End and Enter to sign out. | The menu fits the viewport, Escape restores focus, and keyboard selection returns to Sign in. | **Pass · browser** in Chromium. |
| Seed and answer-key persistence | Start with a fresh disposable database. Set `answer_options.is_correct` to `1` for `q15-a`, `q16-c`, and `q24-a`, then restart FastAPI with the same file. | Fresh sets are Draft. HTML / CSS stays Ready with three configured questions, and the source total stays at 41. | **Pass · API** for fresh seeded data. **Pass · persistence (earlier milestone)** for restart and seed concurrency checks. |
| Frontend lint and build | Run `npm run lint` and `npm run build` from `frontend/`. | Both commands exit successfully. | **Pass · CLI (Motion verification)**. |

The API checks above were rerun with FastAPI's `TestClient` and a fresh in-memory SQLite database. Browser and Vite proxy checks are separate from that run.

### Local proxy regression

During verification on Windows, rapid requests through Vite sometimes failed with a connection reset. [Vite's proxy](../../frontend/vite.config.ts) now reuses its upstream connections to FastAPI. With both servers running, exercise the proxy from PowerShell 7 in a fresh HTTP session:

```powershell
1..120 | ForEach-Object {
    (Invoke-WebRequest 'http://127.0.0.1:5173/api/auth/me' -SkipHttpErrorCheck).StatusCode
} | Group-Object -NoElement
```

Expect 120 responses with status `401` because the requests carry no session cookie.

## Home design

The Home layout includes shared navigation, a recent-set grid, study set cards, and an empty dashboard.

| Surface | JaneQ adaptation |
| --- | --- |
| Empty dashboard | The illustration uses the JaneQ mark with the same staggered floating motion. The primary action scrolls to Built-in sets because the question bank is already available. |
| Recent, classes, and news | Recent uses real sets opened by the signed-in demo user. Built-in sets replace What's new. My sets appears when custom sets are available. Classes are outside the JaneQ feature plan. |
| Study set cards | Cards keep the 156 px height, 256 px minimum grid column, matching loading placeholders, and 150 ms hover lift. Metadata uses question counts and Draft or Ready status. Cards open the read-only overview, with editing and testing assigned to their own flows. |
| Navigation and footer | The header uses JaneQ branding and an account trigger with avatar, username, and chevron at desktop and mobile widths. The menu offers Home and Sign out. Create and import belong to authoring. Profile, settings, and theme controls belong to separate features. |
| Navigation state | [library-navigation.ts](../../frontend/src/features/study-sets/library-navigation.ts) handles browser history with hash URLs and stores up to 16 recent set IDs locally per demo username. The current API list supplies the displayed records. |

[LibraryLayout](../../frontend/src/features/study-sets/LibraryLayout.tsx) owns the shell and renders [AccountMenu](../../frontend/src/features/study-sets/AccountMenu.tsx). [StudySetGrid](../../frontend/src/features/study-sets/StudySetGrid.tsx) renders both grids and their loading placeholders. [Home](../../frontend/src/features/study-sets/Home.tsx) loads the study sets and selects the current view. Reduced-motion preferences disable the floating illustration and card movement.

To verify Home, sign in with a fresh browser profile and check the animated empty dashboard. Select **Browse study sets**, open two different cards, and use browser Back and **Back to Home**. Recent should be ordered newest first and survive reload. At 360 px the cards fit in one column and the account menu supports keyboard navigation and sign-out. Enable reduced motion to verify that the illustration and hover lift stay still.

Verified in Chromium at 1320 px and 360 px. Checks covered card dimensions and hover motion, reduced motion, overview focus, browser Back, Recent ordering after reload, an unknown study-set link, retry after a network failure, and sign-out from the account menu.

### Account menu

The JaneQ account menu groups the avatar, name, and rotating chevron above a right-aligned dropdown. It uses a 32 px avatar, 18 px icons, and 40 px rows for Home and Sign out. The demo account uses initials, and the same trigger works on desktop and mobile.

The compact menu measured 224 px wide with 40 px rows in Chromium at 1320 px and 320 px. It fit the narrow viewport without horizontal overflow. Escape returned focus to the trigger and keyboard sign-out returned to the login screen. The earlier menu check confirmed reduced-motion behavior. Frontend lint and build passed.

### Floating illustration with Motion

[EmptyLibrary](../../frontend/src/features/study-sets/EmptyLibrary.tsx) uses Motion's `LazyMotion` with `domAnimation` for the three floating icons. It uses `backInOut` easing, 20 px travel, and staggered timing.

| Icon | Loop | Initial delay | Midpoint rotation |
| --- | --- | --- | --- |
| Books | 4 s | 0.2 s | -25° |
| JaneQ mark | 5 s | 0 s | 0° |
| Folder | 4.5 s | 0.4 s | 20° |

JaneQ observes changes to the browser's reduced-motion media query and renders static icons while reduction is active. Card hover and account chevron transitions use Chakra.

| Check | Expected result | Observed outcome |
| --- | --- | --- |
| Sign in with reduced motion enabled in a fresh browser profile. Switch the setting off and back on with Home open. | All three icons start still, move with default preferences, and stop as soon as reduced motion is restored. | **Pass · browser** in Chromium. |
| Switch to 360 px, restore default motion, open HTML / CSS, and return to Home. | The layout fits, the illustration runs before opening the set, and the visited set appears under Recent. | **Pass · browser** in Chromium. |
| Run `npm run lint` and `npm run build` from `frontend/`. | Both checks pass. | **Pass · CLI**. |

### Quiet loading and the study-set skeleton

[App](../../frontend/src/App.tsx) leaves the screen blank during the session check and lazy screen imports. Sign-in keeps its action label while the submit button is busy. [Home](../../frontend/src/features/study-sets/Home.tsx) shows the ready shell and first-visit panel while the list is pending. The Built-in sets region stays blank for the first 200 ms and then uses the static [Boneyard skeleton](../../frontend/src/features/study-sets/bones/built-in-study-sets.bones.json). The section exposes busy state and hides decorative placeholders from assistive technology.

Regenerate the bones when the built-in card layout changes. Start JaneQ and sign in with a dedicated Chromium test profile that exposes a CDP port. From `frontend/`, run the following using that port and the same origin used to sign in:

```sh
npm exec -- boneyard-js build http://127.0.0.1:5173/ --out ./src/features/study-sets/bones --breakpoints 360,592,864,1136 --no-scan --wait 1200 --force --cdp 9222
```

The captured widths follow the built-in grid's one-, two-, three-, and four-column layouts. The [registry](../../frontend/src/features/study-sets/bones/registry.ts) loads with the Home grid module.

| Check | Expected result | Observed outcome |
| --- | --- | --- |
| Hold the session and study-set API responses in a Chromium test profile. | The session starts blank. The ready Home shell appears with a skeleton after the list wait reaches 200 ms. | **Pass · browser**. |
| Release the study-set response at 360, 768, 900, and 1280 px. | The six cards replace the skeleton at the same top position and height. | **Pass · browser** at all four widths. |
| Reload with the local API responding promptly. | The six cards appear without a skeleton flash. | **Pass · browser**. |
| Delay sign-in, send an invalid password, then retry a failed study-set request. | Sign-in keeps its label while pending. Errors remain visible and retry restores the six cards. | **Pass · browser**. |
| Run `npm run lint` and `npm run build` from `frontend/`. | Both checks pass. | **Pass · CLI**. |
