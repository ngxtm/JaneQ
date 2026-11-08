# JaneQ branding

The [shared JaneQ mark](../../frontend/src/assets/janeq-mark.svg) pairs a blue J with a graduation cap and a white Q centered on the cap. Sign in and Home use it for branding, the first-visit illustration, and built-in study-set cards. The [HTML entry point](../../frontend/index.html) uses the same SVG for the browser tab.

| Check | How to reproduce | Expected result | Verification |
| --- | --- | --- | --- |
| Sign in and Home | Open JaneQ in a fresh browser session, sign in, and check both screens at 360 and 1320 px. | The mark loads on Sign in and in the Home header, footer, first-visit illustration, and six built-in cards. | **Pass · browser** in Chromium with a fresh SQLite database. |
| Favicon | Build the frontend and open the preview. Inspect the icon link and request its URL. | The icon URL serves the same SVG used by the in-app marks. | **Pass · browser**. |
| Frontend checks | Run `npm run lint` and `npm run build` from `frontend/`. | Both commands pass. | **Pass · CLI**. |
