# JaneQ contributor instructions

## Design and verify JaneQ screens

1. Before implementing each JaneQ screen, review the shared theme and the closest existing feature for layout, spacing, typography, color, icons, and responsive states.
2. Match the interaction and motion as well as the appearance. Check navigation, keyboard and pointer behavior, loading and empty states, hover and focus feedback, and animation timing. Honor reduced-motion preferences.
3. Verify the result at desktop and mobile widths. In the feature document, record design decisions, why they were made, and any feature dependencies.

## Keep the frontend consistent

1. Follow the [frontend UI guide](docs/frontend.md). Reuse the Chakra theme, component recipes, and established interaction patterns. Update the shared guide in the same change when a shared UI rule changes.
   - Build interactive controls and overlays with Chakra UI or JaneQ components built on Chakra. Do not author bare HTML controls or rely on browser-default styling. Use shared patterns for buttons, selection controls, form fields, menus, and dialogs. Keep semantic HTML for page structure and for elements composed through Chakra's `asChild` API.
2. Record screen-specific layout, states, and deliberate design departures in the feature document. Explain which user need a departure serves and how to verify it. Treat shared defaults as a starting point for screen-specific design.
3. Check applicable loading, empty, error, and success states. Verify keyboard navigation, visible focus, layout at mobile and desktop widths, and reduced motion when the screen uses animation. Record the checks actually run.
4. Render ready sections immediately. Leave brief pending regions visually blank. For data that can take noticeably longer, use a layout-matched Boneyard skeleton scoped to the pending region. Follow the frontend guide for visible copy and accessible status.

## Close one feature or flow at a time

1. Define the user outcome, scope, and observable acceptance criteria before coding. Group backend, frontend, and data changes into a complete flow that can be exercised through the app.
2. Review the diff. Run the checks relevant to the change and exercise the real entry point. For an integrated flow, verify the UI through the actual API and data store. Cover failure paths and persistence when they are part of the feature.
3. Add or update one readable document per feature or flow in `docs/features/`. Link it from the README. Include the scope, how to use it, the path from the UI to the API and data, key decisions, reproducible checks, and the verified outcome.
4. Commit the verified milestone. Keep unresolved acceptance criteria visible and close the current milestone before starting another one.

## Write commit messages

- Use `<type>: <summary>` for the commit subject. Write the summary in English as a short imperative phrase, with no trailing period.
- Choose the type that describes the change. Use `feat` for features, `fix` for bug fixes, `refactor` for code restructuring, `docs` for documentation, `test` for tests, and `chore` for maintenance.
- Describe the change in JaneQ. For example, `fix: refine the study set list and mode layouts` or `feat: add a themed 404 page`.

## Document API contracts and acceptance checks

1. Use FastAPI's generated OpenAPI as the API reference. When adding or changing an endpoint, declare its request and response models, and add OpenAPI metadata for relevant authentication requirements, error responses, and useful examples. Link the generated reference from the feature doc.
2. In the feature doc, explain what triggers the request, which session or inputs it needs, and how the UI handles success and meaningful failures. Keep examples selective. Compare each example with the generated schema, the endpoint's runtime behavior, and the frontend client that consumes it.
3. For each acceptance check, record how to reproduce it, the expected result, and the observed outcome at the layer actually exercised. Use explicit statuses such as `Pass · API`, `Pass · browser`, and `Pending · browser`. Identify evidence from earlier milestones when carrying it forward.

## Keep responsibilities clear

- Use short English code comments to explain decisions and constraints that are easy to miss, such as why a transaction or a session check is necessary. Use clear names and control flow for routine behavior.
- Keep backend startup and middleware in `backend/app/main.py`. Organize REST routes by feature, keep SQL in persistence code, and keep business rules independently testable.
- Keep frontend screens, feature types, and endpoint calls together under `frontend/src/features/`. Send all frontend HTTP requests through the shared Axios instance in `frontend/src/http.ts`. Read `response.data` in feature clients and validate the payload at that boundary. Keep app-wide session orchestration in `App.tsx`.
- Use the MCQ research report under `../interview/docs/` as a design reference. Review the relevant source for the current feature and record the ideas applied to JaneQ.

## Document database changes

1. Update [the database reference](docs/database.md) in the same change as any schema, seed, migration, or stored data rule. Record table purpose, columns and defaults, keys and constraints, and any effect on existing databases.
2. Use the implemented SQL and persistence code as the source of truth. Check names, relationships, defaults, and derived values against the code and SQLite schema. Label future design separately from current behavior.
3. Link data-related feature docs to the database reference. Trace the UI action through the endpoint and persistence function to the tables it reads or writes. Keep shared data rules in the database reference so feature docs can link to them.
4. Document a reproducible check and its expected result. Use a read-only connection for inspection and a disposable database for write checks. For schema or seed changes, check both a fresh database and the effect of reopening an existing database with saved data. Record which checks actually ran.
