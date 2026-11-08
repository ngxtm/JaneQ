# JaneQ frontend UI guide

## Shared decisions

[Chakra theme](../frontend/src/ui/theme.ts) defines JaneQ's colors, typography, and component recipes. Use theme tokens and recipes for recurring styles. Add a shared token or recipe when the same design role recurs across screens. Keep screen-specific layout close to the feature that owns it.

Use Outfit for headings and Open Sans for body text. Use `janeq.ink` and `janeq.muted` for text, `janeq.library` for the library canvas, and `janeq.line` and `janeq.divider` for borders and separators. Preserve the visible `janeq.focus` treatment on interactive controls.

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

## Navigation continuity

Keep shared UI in a parent layout that stays mounted across the routes that use it. For Home and Study Set, keep the header, navigation, and account controls in `LibraryLayout` while the main content changes. Put route-specific keys, loading fallbacks, and entrance animations inside the changing region. Shared controls can update their own labels and state in place when navigation requires it.

Check in a browser at desktop and mobile widths. Open a set from Home and return with the in-app link and browser Back. Repeat with a delayed destination response. The same header should stay mounted and visible when in view, with no blank frame, replayed entrance animation, or unexpected position shift. Check keyboard focus on shared controls and move focus to destination content when the initiating control leaves the page.

## Loading behavior

Use a quiet fallback for brief session checks and lazy imports. Keep ready navigation and content visible when another region is waiting. Reserve visible copy for meaningful outcomes or a concrete action the user can take. Preserve the action label on a pending button and prevent repeat submission.

For slow or variable data requests, give quick responses time to arrive before showing a skeleton. Generate the skeleton from the real component with `boneyard-js`, keep it scoped to the pending region, and preserve its responsive footprint. Use a static skeleton by default. Expose busy state to assistive technology and keep decorative placeholders out of the accessibility tree.

## Screen and component inventory

| Screen | Use as a baseline | Feature spec |
| --- | --- | --- |
| Sign-in and recovery | Centered sign-in form with labeled outline inputs and visible keyboard focus. Use `StudyErrorScreen` for full-page recovery states. | [Login, session errors, and 404](features/login-home.md#screen-design) |
| Home and library | `LibraryLayout` owns the header, account menu, and footer. `StudySetGrid` owns linked cards and matching skeletons. `EmptyLibrary` leads to the catalog. | [Home layout and states](features/login-home.md#home-design) |
| Study Set | Keep the set heading and modes available while the preview loads. `StudySetModes` provides the mode links and preview controls. | [Study Set layout](features/learn.md#study-set-design) |
| Learn | Show one question at a time. Use the round header, answer feedback, progress summary, and shared `SettingsSwitch`. | [Learn screen states](features/learn.md#learn-screen-design) |
| Test and Results | Use `Test` for the paper and `Results` for score and review. Share question card layout across both views. | [Test and Results layout](features/test-results.md#test-and-results-design) |

## Designing a new screen

Start with the existing patterns for navigation, actions, and feedback. Choose the layout, illustration, and content hierarchy that fit the task on that screen. For example, Results can emphasize the score and group missed questions while following the same action and focus rules as Home.

For a new screen or shared component, record its hierarchy, variants, responsive behavior, and loading, empty, error, and success states in the feature doc. Link the existing components it reuses. Record keyboard, desktop and mobile, and reduced-motion checks that were actually run. Update this guide when a pattern becomes shared across features.
