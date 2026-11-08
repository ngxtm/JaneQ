# JaneQ frontend UI guide

## Shared decisions

[Chakra theme](../frontend/src/ui/theme.ts) defines JaneQ's colors, typography, and component recipes. Use theme tokens and recipes for recurring styles. Add a shared token or recipe when the same design role recurs across screens. Keep screen-specific layout close to the feature that owns it.

Build interactive controls and overlays with Chakra UI or the shared JaneQ components in `frontend/src/ui/`. Use `Button`, `IconButton`, `Input`, `Checkbox`, `Switch`, `Select`, `Menu`, and `Dialog` for their corresponding roles. Do not author bare HTML controls or rely on browser-default styling. Chakra's hidden inputs and semantic children passed through `asChild` are part of the component. Use semantic HTML for document structure. When a control needs a custom presentation, style a Chakra component with theme tokens and preserve its keyboard, focus, and disabled states.

| Pattern | Use in JaneQ |
| --- | --- |
| Primary action | Use [PrimaryButton](../frontend/src/ui/PrimaryButton.tsx) for actions such as **Sign in**, **Continue**, and **Done**. Keep its label readable on the blue background in default and hover states. |
| Secondary action and navigation | Use outline styling for secondary actions such as **Try again** and quiet styling for navigation such as **Back to Home**. Use links for navigation and buttons for actions. |
| Forms and focus | Pair inputs with accessible labels. Use the shared outline input recipe and keep keyboard focus visible on fields, buttons, cards, and menus. |
| Settings and selection | Use [SettingsSwitch](../frontend/src/ui/SettingsSwitch.tsx) for on/off settings that take effect immediately. Use `Checkbox` to select independent items. Give dialogs a clear title and verify Escape, focus, and dismissal. |
| Loading, empty, and error | Render ready sections immediately. Leave brief pending regions visually blank. For noticeable data waits, use a [Boneyard](https://boneyard.vercel.app/install) skeleton that matches the final layout. Explain an empty state and offer the next action when one exists. Put recoverable errors near the affected content and offer a retry when appropriate. |
| Responsive layout | Keep the main action, content, and account controls usable at narrow and wide widths. Check real long titles and text wrapping in the layout. |
| Motion | Use motion to show feedback or a transition. Honor reduced-motion preferences for animation and decorative movement. |

## Loading behavior

Use a quiet fallback for brief session checks and lazy imports. Keep ready navigation and content visible when another region is waiting. Reserve visible copy for meaningful outcomes or a concrete action the user can take. Preserve the action label on a pending button and prevent repeat submission.

For slow or variable data requests, give quick responses time to arrive before showing a skeleton. Generate the skeleton from the real component with `boneyard-js`, keep it scoped to the pending region, and preserve its responsive footprint. Use a static skeleton by default. Expose busy state to assistive technology and keep decorative placeholders out of the accessibility tree.

## Existing examples

- [Login](../frontend/src/features/auth/Login.tsx) shows labeled inputs, the shared focus treatment, and sign-in feedback.
- [StudySetGrid](../frontend/src/features/study-sets/StudySetGrid.tsx) shows linked cards, matching skeletons, and focus and hover feedback.
- [LibraryLayout](../frontend/src/features/study-sets/LibraryLayout.tsx) provides the library shell and responsive account menu. [EmptyLibrary](../frontend/src/features/study-sets/EmptyLibrary.tsx) shows a next action and motion that respects the browser preference.

## Designing a new screen

Start with the existing patterns for navigation, actions, and feedback. Choose the layout, illustration, and content hierarchy that fit the task on that screen. For example, Results can emphasize the score and group missed questions while following the same action and focus rules as Home.

In the feature doc, record design decisions and explain how to verify them. Record the states exercised, keyboard behavior, desktop and mobile widths, and the reduced-motion result where applicable. See the [Login and Home feature doc](features/login-home.md) for examples.
