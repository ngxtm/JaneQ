# JaneQ contributor instructions

## Close one feature or flow at a time

1. Define the user outcome, scope, and observable acceptance criteria before coding. Group backend, frontend, and data changes into a complete flow that can be exercised through the app.
2. Review the diff. Run the checks relevant to the change and exercise the real entry point. For an integrated flow, verify the UI through the actual API and data store. Cover failure paths and persistence when they are part of the feature.
3. Add or update one readable document per feature or flow in `docs/features/`. Link it from the README. Include the scope, how to use it, the path from the UI to the API and data, key decisions, reproducible checks, and the verified outcome.
4. Commit the verified milestone. Keep unresolved acceptance criteria visible and close the current milestone before starting another one.

## Keep responsibilities clear

- Use short English code comments to explain decisions and constraints that are easy to miss, such as why a transaction or a session check is necessary. Use clear names and control flow for routine behavior.
- Keep backend startup and middleware in `backend/app/main.py`. Organize REST routes by feature, keep SQL in persistence code, and keep business rules independently testable.
- Keep frontend screens, feature types, and endpoint calls together under `frontend/src/features/`. Send all frontend HTTP requests through the shared Axios instance in `frontend/src/http.ts`. Read `response.data` in feature clients and validate the payload at that boundary. Keep app-wide session orchestration in `App.tsx`.
- Use the MCQ research report under `../interview/docs/` as a design reference. Review the relevant source for the current feature and record the ideas applied to JaneQ.
