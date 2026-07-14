---
name: browser-verification
description: Verify web UI and flows by driving a real (headless) browser instead of assuming the code works — load the page, interact, assert on actual rendered state, and capture evidence. Generalized from Playwright so it applies to any browser-automation driver.
user-invocable: true
trigger: A UI change or web flow that should be checked against a real rendered page — clicks, forms, navigation, visual state — rather than assumed correct from the code.
---

# Browser Verification

Don't trust that UI works because the code looks right. Drive an actual browser, perform the real interactions, and assert on what the page actually renders and does.

## When to use

- After building or changing UI, to confirm it renders and behaves.
- To reproduce a reported front-end bug.
- To check an end-to-end flow (login, checkout, form submit) across real navigation.

The underlying driver (a Playwright-style automation library, a browser-control MCP, etc.) doesn't matter — the practice does.

## Method

1. **Set up the page.** Launch headless, navigate to the target URL/route, wait for the app to be ready (not just for the load event — for the element that signals readiness).
2. **Interact like a user.** Click, type, submit, navigate. Drive real controls; don't reach into internals to fake state.
3. **Assert on real state.** Check rendered text, element presence/visibility, URL after navigation, and network/console for errors. An assertion beats a screenshot glance.
4. **Capture evidence.** Take a screenshot at the key state and read console/network output. Attach these to the result so the outcome is inspectable.
5. **Cover the failure paths.** Test the empty state, the error state, and at least one edge input — not only the happy path.

## Rules

- Wait for readiness conditions, not fixed timeouts.
- Do not trigger native browser dialogs (`alert`/`confirm`/`prompt`) from automation — they block the session. Route diagnostics through console logs and read them back.
- A UI task isn't verified until a real interaction against a real render has passed.
- Report what was exercised, what passed, and any console/network errors seen.
