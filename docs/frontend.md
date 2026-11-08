# JaneQ frontend UI guide

## Shared decisions

[Chakra theme](../frontend/src/ui/theme.ts) defines JaneQ's colors, typography, and component recipes. Use theme tokens and recipes for recurring styles. Add a shared token or recipe when the same design role recurs across screens. Keep screen-specific layout close to the feature that owns it.

| Pattern | Use in JaneQ |
| --- | --- |
| Primary action | Give the main action in a section the strongest emphasis. Use the shared blue tokens for actions such as **Sign in** and **Browse study sets**. |
| Secondary action and navigation | Use outline styling for secondary actions such as **Try again** and quiet styling for navigation such as **Back to Home**. Use links for navigation and buttons for actions. |
| Forms and focus | Pair inputs with accessible labels. Use the shared outline input recipe and keep keyboard focus visible on fields, buttons, cards, and menus. |
| Loading, empty, and error | Keep loading placeholders close to the final layout. Explain an empty state and offer the next action when one exists. Put recoverable errors near the affected content and offer a retry when appropriate. |
| Responsive layout | Keep the main action, content, and account controls usable at narrow and wide widths. Check real long titles and text wrapping in the layout. |
| Motion | Use motion to show feedback or a transition. Honor reduced-motion preferences for animation and decorative movement. |

## Existing examples

- [Login](../frontend/src/features/auth/Login.tsx) shows labeled inputs, the shared focus treatment, and sign-in feedback.
- [StudySetGrid](../frontend/src/features/study-sets/StudySetGrid.tsx) shows linked cards, matching skeletons, and focus and hover feedback.
- [LibraryLayout](../frontend/src/features/study-sets/LibraryLayout.tsx) provides the library shell and responsive account menu. [EmptyLibrary](../frontend/src/features/study-sets/EmptyLibrary.tsx) shows a next action and motion that respects the browser preference.

## Designing a new screen

Start with the existing patterns for navigation, actions, and feedback. Choose the layout, illustration, and content hierarchy that fit the task on that screen. For example, Results can emphasize the score and group missed questions while following the same action and focus rules as Home.

In the feature doc, record design decisions and explain how to verify them. Record the states exercised, keyboard behavior, desktop and mobile widths, and the reduced-motion result where applicable. See the [Login and Home feature doc](features/login-home.md) for examples.
