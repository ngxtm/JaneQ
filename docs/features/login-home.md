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

[main.py](../../backend/app/main.py) wires up the routers and runs the [SQLite seed](../../backend/app/database.py) on startup. The seed groups the source questions by topic, preserves their text and option order, and records completion in the same transaction as the inserts. IDs such as `q16-c` refer to original source positions. The built-in sets start as Draft because the supplied answer fields are empty. A set becomes Ready when it has questions and every question has a prompt, at least two nonblank choices, and at least one nonblank choice marked correct.

## Design references

The MCQ research report informed JaneQ's card-based Home and feature-specific FastAPI router with a shared authentication check. See [ClassQuiz's protected results router](https://github.com/mawoka-myblock/ClassQuiz/blob/master/classquiz/routers/results.py).

For the later Test and Results flow, JaneQ's backend will own grading. The research report points to [react-quiz-component's hook](https://github.com/wingkwong/react-quiz-component/blob/develop/src/lib/engine/use-quiz.ts) for separating quiz state from presentation.

### Login design

JaneQ's Vite sign-in uses a centered layout, outlined inputs, Outfit headings, Open Sans body text, blue accents, and a demo username and password form.

[The JaneQ theme](../../frontend/src/ui/theme.ts) defines the outline input. On keyboard focus, Chakra uses the same color on the field border and the adjacent ring with zero gap. The sign-in route loads the Chakra components and bundled fonts on demand.

Verified in Chromium with Tab navigation on both fields, a 360 px viewport, and a sign-in, session restore, and sign-out pass.

## Acceptance checks

| Check | Expected result |
| --- | --- |
| Open the app in a fresh browser session. Request `/api/study-sets` before signing in. | The app shows Sign in. The API returns `401`. |
| Submit an incorrect password, then submit the configured credentials. | The form shows the invalid-credentials error. A valid sign-in opens Home with six sets and 41 questions in total. |
| Use Tab to focus the username and password fields. Open Login at a 360 px viewport. | Each focused field shows a single continuous blue line. The form fits the viewport and its fields have accessible names. |
| Reload Home, sign out, then reload again. | The first reload restores Home. Sign-out and the final reload show Sign in. |
| Block `/api/study-sets` in the browser, then unblock it and select **Try again**. | Home shows a load error and then restores the six cards. |
| Check a fresh database, then set the HTML / CSS answer key in a disposable database and restart FastAPI. | The fresh sets are Draft. The edited set stays Ready with three configured questions, and the original question count stays at 41. |
| Open Home at a 360 px viewport. Run `npm run lint` and `npm run build` in `frontend/`. | Cards fit in one column. Both frontend checks pass. |

The Login → Home milestone passed the browser sign-in, reload, sign-out, and mobile layout checks. API checks covered a missing or invalid session, seed concurrency, and answer-key persistence across startup.

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
| Navigation and footer | The header uses JaneQ branding and a compact account menu on mobile. The current actions are Home and Sign out. Create and import belong to authoring. Profile, settings, and theme controls are outside this milestone. |
| Navigation state | [library-navigation.ts](../../frontend/src/features/study-sets/library-navigation.ts) handles browser history with hash URLs and stores up to 16 recent set IDs locally per demo username. The current API list supplies the displayed records. |

[LibraryLayout](../../frontend/src/features/study-sets/LibraryLayout.tsx) owns the shell and menu. [StudySetGrid](../../frontend/src/features/study-sets/StudySetGrid.tsx) renders both grids and their loading placeholders. [Home](../../frontend/src/features/study-sets/Home.tsx) loads the study sets and selects the current view. Reduced-motion preferences disable the floating illustration and card movement.

To verify Home, sign in with a fresh browser profile and check the animated empty dashboard. Select **Browse study sets**, open two different cards, and use browser Back and **Back to Home**. Recent should be ordered newest first and survive reload. At 360 px the cards fit in one column and the account menu supports keyboard navigation and sign-out. Enable reduced motion to verify that the illustration and hover lift stay still.

Verified in Chromium at 1320 px and 360 px. Checks covered card dimensions and hover motion, reduced motion, overview focus, browser Back, Recent ordering after reload, an unknown study-set link, retry after a network failure, and sign-out from the account menu.

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
