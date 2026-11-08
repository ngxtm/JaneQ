# Demo sign-in and Home

## Scope

A user signs in with the configured demo account and sees the study sets available in JaneQ. Reloading the page restores a valid session. Signing out returns the user to the sign-in form.

Home lists the six built-in study sets from SQLite and shows the question count, answer-key coverage, and Draft or Ready status of each. Opening a card and tracking recent sets belong to the study-set navigation flow. Creating and editing sets belong to the authoring flow.

## Run the flow

1. Follow the [local setup](../../README.md#local-development) to configure the demo account and start both servers.
2. Open [JaneQ](http://127.0.0.1:5173/) and sign in with the username and password from `backend/.env`.
3. Inspect **Built-in sets**, reload, and select **Sign out**.

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

## Acceptance checks

| Check | Expected result |
| --- | --- |
| Open the app in a fresh browser session. Request `/api/study-sets` before signing in. | The app shows Sign in. The API returns `401`. |
| Submit an incorrect password, then submit the configured credentials. | The form shows the invalid-credentials error. A valid sign-in opens Home with six sets and 41 questions in total. |
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
