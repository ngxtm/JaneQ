# Demo sign-in and Home

## Scope

A user signs in with the configured demo account and sees the study sets available in JaneQ. Reloading the page restores a valid session. Signing out returns the user to the sign-in form.

Home lists the 18 built-in study sets from SQLite. Cards show the question count and status. Opening a card records the visit under Recent. Built-in sets are Ready and open to their study modes and flashcard preview. [Built-in study sets](builtin-sets.md)

The overview links to Learn. Flashcards and Test have reserved entries for their own flows. [Study Set and Learn](learn.md)

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
| `GET /api/auth/me` | Valid session cookie | `200` with the signed-in username. The app opens Home. | `401` opens Sign in. Other failures, including a response JaneQ cannot read, show the [connection error screen](../../frontend/src/features/auth/SessionUnavailable.tsx). **Try again** repeats the session check. |
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

The backend declares this shape in `StudySetSummary` and the frontend checks it in `getStudySets()`. OpenAPI describes the `401` responses and lists the `janeq_session` cookie requirement for `/api/auth/me` and `/api/study-sets`. Both routes use the same session dependency, and the session middleware verifies the cookie signature. A sign-out error belongs to the current session. If that session expires during sign-out, the app cancels the pending request before returning to Login. [FastAPI authentication router](../../backend/app/auth.py) · [React study sets client](../../frontend/src/features/study-sets/api.ts)

## Design references

The [frontend UI guide](../frontend.md) covers shared actions, states, and accessibility checks used across screens.

The MCQ research report informed JaneQ's card-based Home and feature-specific FastAPI router with a shared authentication check. See [ClassQuiz's protected results router](https://github.com/mawoka-myblock/ClassQuiz/blob/master/classquiz/routers/results.py).

For the later Test and Results flow, JaneQ's backend will own grading. The research report points to [react-quiz-component's hook](https://github.com/wingkwong/react-quiz-component/blob/develop/src/lib/engine/use-quiz.ts) for separating quiz state from presentation.

### Login design

JaneQ's Vite sign-in uses a centered layout, outlined inputs, Outfit headings, Open Sans body text, blue accents, and a demo username and password form.

[The JaneQ theme](../../frontend/src/ui/theme.ts) defines the outline input. On keyboard focus, Chakra uses the same color on the field border and the adjacent ring with zero gap. The sign-in route loads the Chakra components and bundled fonts on demand.

The Login background fades in over 1.5 s after a 0.2 s delay. The form fades in and moves down 16 px over 0.3 s after a 0.1 s delay. Reduced motion shows the final layout immediately, and keyboard focus brings the form into view immediately if the user tabs in during the entrance. The demo form uses a username and password with JaneQ's logo.

### Session connection error

The error screen uses a centered illustration that fades into the background, a large heading, a short explanation, and a recovery action.

JaneQ uses its own mark and session-specific copy so users know what they can retry. The heading and explanation appear immediately. The decorative mark fades in and rises 8 px over 350 ms, and the tassel sways gently while the screen is visible. **Try again** keeps the screen and keyboard focus in place while the app checks the session. The arrow spins and the button prevents repeat requests until the check finishes. With reduced motion enabled, the illustration and arrow stay still. The button label remains **Try again** in both modes. [SessionUnavailable](../../frontend/src/features/auth/SessionUnavailable.tsx) · [App session check](../../frontend/src/App.tsx)

The supplied visual reference adds soft light and orbital lines around the error content. JaneQ uses pale blue and violet light, three faint ellipses, and four drifting symbols drawn from study materials and math. On narrow screens the symbols sit above and below the message. The background is decorative, allows pointer input to pass through, and stays still when reduced motion is enabled. [Background styles](../../frontend/src/features/auth/session-unavailable.module.css)

The error heading highlights the JaneQ name with italic Georgia on yellow. The heading wraps within the viewport and keeps the full message as one heading. Verified in Chromium at 1280 × 720 and 320 × 568. [Heading styles](../../frontend/src/features/auth/session-unavailable.module.css)

## Acceptance checks

| Check | How to reproduce | Expected result | Verification |
| --- | --- | --- | --- |
| Missing session | Open JaneQ in a fresh browser session and request `/api/study-sets`. | JaneQ shows Sign in. The API returns `401` with `{"detail":"Sign in first."}`. | **Pass · API** for the endpoint response. |
| Credentials and Home data | Submit an incorrect password, then sign in with the configured credentials. | The form shows the credential error. A valid sign-in opens Home with 18 built-in sets and 281 questions on a fresh database. | **Pass · API** for both login responses and the returned set counts. **Pass · browser** for valid sign-in and 18 visible cards. |
| Session restore and sign-out | Reload Home, sign out, then reload again. | The first reload restores Home. Sign-out clears the session and the final reload shows Sign in. | **Pass · API** and **Pass · browser** against Vite, FastAPI, and a temporary SQLite database. |
| Sign-out across sessions | While the Home list is pending, intercept logout with a `503`, then let the list return `401` and sign in again. Repeat with a delayed logout that would clear the cookie. | The new Home shows no old sign-out error, and `GET /api/auth/me` returns `200` after the delayed response. | **Pass · browser** in Chromium with intercepted responses. |
| Login entrance | Reload signed out at 360 px, press Tab during the entrance, and repeat with reduced motion enabled. | Background and form animate with default settings. Tab shows the focused field immediately. Reduced motion shows the final layout on first render. | **Pass · browser** in Chromium. |
| Login on a narrow screen | At 360 px, use Tab to focus the username and password fields. | The form fits, the fields have accessible names, and each focused field shows a continuous blue ring. | **Pass · browser (Login design verification)**. |
| Session connection error and recovery | In a signed-out browser, block `/api/auth/me` and reload. At desktop and mobile widths, inspect the layout. Press Tab to focus **Try again**, unblock the request, then press Enter. | The error fills the screen with no horizontal overflow. **Try again** has a visible focus ring and returns to Sign in once the API responds. | **Pass · browser** in Chromium at 1280 × 720 and 390 × 844. |
| Session retry in progress | Return `503` for the first session request. Delay the next response, then return `503` again. While waiting, press Enter twice on **Try again**. Then let the next retry reach the API. | The mark moves, the error stays visible, and the arrow spins while the button is busy. Each retry sends one request. After failure the button keeps focus and can be used again. A `401` opens Sign in. | **Pass · browser** in Chromium at 1280 × 720 and 390 × 844. |
| Session error with reduced motion | Enable reduced motion, open the connection error screen, and retry against a delayed response. | The mark and arrow stay still. The button keeps the **Try again** label and blocks repeated activation during the request. | **Pass · source** for the motion media query and stable label. **Pending · browser** for reduced-motion emulation. |
| Study background | Block `/api/auth/me`, reload, and inspect the error at desktop and mobile widths. Enable reduced motion, then unblock the request and use Tab and Enter on **Try again**. | Four symbols float around the message without covering its heading or causing horizontal scrolling. The symbols stay still with reduced motion. Keyboard retry remains available and a `401` opens Sign in. | **Pass · browser** in Chromium at 1280 × 720, 390 × 844, and 320 × 568. |
| Home retry | Block `/api/study-sets`, unblock it, then select **Try again**. | Home shows a load error and then restores the cards. | **Pass · browser (Home design verification)** for retry after a network failure. |
| Home navigation and Recent | With a fresh browser profile, select **Browse study sets**, open two different cards, return Home, and reload. | Both visits appear under Recent, newest first, and persist after reload. | **Pass · browser (Home design verification)** for browser Back and Recent ordering after reload. |
| Home on a narrow screen | Open Home at 360 px. Focus the account menu, press Enter, press Escape to return focus to the trigger, then reopen it and use End and Enter to sign out. | The menu fits the viewport, Escape restores focus, and keyboard selection returns to Sign in. | **Pass · browser** in Chromium. |
| Seed persistence | Start with a fresh disposable MVP database and reopen it twice. | Home lists 18 Ready built-in sets after both restarts. | **Pass · API**. [Catalog restart check](builtin-sets.md#acceptance-checks) |
| Frontend lint and build | Run `npm run lint` and `npm run build` from `frontend/`. | Both commands exit successfully. | **Pass · CLI (Motion verification)**. |

From `backend/`, run the [API regression checks](../../backend/tests/test_login_home.py) with:

```sh
uv run --locked python -m unittest discover -s tests -v
```

Each test creates a temporary SQLite file and starts FastAPI through `TestClient`, including startup and seeding. The tests cover the generated OpenAPI contract, invalid credentials, missing sessions, login, the 18 sets and 281 questions, and logout. Browser and Vite proxy checks run separately.

### Local proxy regression

During verification on Windows, rapid requests through Vite sometimes failed with a connection reset. [Vite's proxy](../../frontend/vite.config.ts) now reuses its upstream connections to FastAPI. With both servers running, exercise the proxy from PowerShell 7 in a fresh HTTP session:

```powershell
1..120 | ForEach-Object {
    (Invoke-WebRequest 'http://127.0.0.1:5173/api/auth/me' -SkipHttpErrorCheck).StatusCode
} | Group-Object -NoElement
```

**Pass · Vite proxy** on Windows. The isolated Vite and FastAPI servers returned 120 responses with status `401` and zero connection errors. The requests carried no session cookie.

## Home design

The Home layout includes shared navigation, a recent-set grid, study set cards, and an empty dashboard.

| Surface | JaneQ adaptation |
| --- | --- |
| Empty dashboard | The illustration uses the JaneQ mark with the same staggered floating motion. The primary action scrolls to Built-in sets because the question bank is already available. |
| Recent, classes, and news | Recent uses real sets opened by the signed-in demo user. Built-in sets replace What's new. My sets appears when custom sets are available. Classes are outside the JaneQ feature plan. |
| Study set cards | Cards keep the 156 px height, 256 px minimum grid column, matching loading placeholders, and 150 ms hover lift. Metadata uses question counts and Draft or Ready status. Cards open the overview. |
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

[App](../../frontend/src/App.tsx) leaves the screen blank during the initial session check and lazy screen imports. Retrying the session check keeps the connection error screen visible until the request resolves. Sign-in keeps its action label while the submit button is busy. [Home](../../frontend/src/features/study-sets/Home.tsx) shows the ready shell and reserves card space while the list is pending. Recent reserves one slot per saved ID. After a successful response, Home removes IDs that are no longer available, so a grid with stale IDs may shrink. Built-in reserves 18 slots for the current seed. The card grid controls wrapping and height for both cards and placeholders.

The card slots and overview body stay visually blank for the first 200 ms, then show static Boneyard placeholders while the API is pending. Pending regions expose their busy state and hide decorative bones from assistive technology. A direct link to a set keeps **Back to Home** available during loading and error. Retrying leaves focus on Back if it is already focused.

Regenerate the [card and overview bones](../../frontend/src/features/study-sets/bones) when their layout changes. Start JaneQ and sign in with a dedicated Chromium test profile that exposes a CDP port. From `frontend/`, run the following using that port and the same origin used to sign in:

```sh
npm exec -- boneyard-js build "http://127.0.0.1:5173/#home" "http://127.0.0.1:5173/#set/html-css" --out ./src/features/study-sets/bones --breakpoints 360,768,1280 --no-scan --wait 1000 --force --cdp 9222
```

The CLI captures the first real Built-in card and the HTML / CSS overview. The [registry](../../frontend/src/features/study-sets/bones/registry.ts) loads with the Home module.

| Check | Expected result | Observed outcome |
| --- | --- | --- |
| Open two sets, return to Home, and reload with a delayed list response. | Recent reserves its slots. Built-in holds the same top and height when the real cards replace the skeleton. | **Pass · browser** in Chromium at 360, 600, 768, 900, and 1280 px. |
| While the list is pending, resize Home between 360 and 1280 px, then let the list load. | The skeleton and loaded cards follow the same grid rows at the new width. | **Pass · browser** in Chromium. |
| Sign in with the local API responding promptly. | Cards appear without a skeleton flash. | **Pass · browser** in Chromium in the original Home review. |
| Delay the list response on a direct set link, return an error, then retry. | Back remains available, the body becomes busy before the skeleton appears, and the overview loads without stealing focus from Back. | **Pass · browser** in Chromium. |
