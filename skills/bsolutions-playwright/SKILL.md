---
name: bsolutions-playwright
description: Create and debug reproducible Playwright end-to-end tests for authorized local or test systems with stable selectors, controlled server startup, test authentication, desktop/mobile coverage, traces, and failure screenshots. Use for browser flows and E2E regressions without production data.
---

# Playwright workflow

## Required inputs

Require an authorized base URL, startup/stop commands, test account or fixture
strategy, target flow, browsers/viewports, acceptance criteria, and data cleanup.
Never use production, personal accounts, or real customer data.

## Process

1. Read the existing Playwright config, fixtures, page objects, and nearby tests.
2. Start a server only through the documented command; first detect whether it
   is already running. Never guess ports.
3. Reuse stored test authentication only when project policy permits it. Do not
   print cookies, tokens, or storage state.
4. Prefer accessible role/name or `data-testid` selectors. Avoid CSS structure,
   text that changes by locale, and positional selectors.
5. Wait for observable UI/network state, not arbitrary sleeps.
6. Isolate test data and make setup/cleanup idempotent. Cover success, validation,
   authorization, empty/error states, retry, and one mobile plus one desktop
   viewport when relevant.
7. Enable trace on first retry and screenshots on failure. Preserve evidence
   paths without embedding secrets.
8. Run the narrow test first, then the relevant suite. Repeat failures only with
   a changed hypothesis.

## Exit and report

Report URL class (local/test), scenarios, browsers/viewports, commands/results,
trace/screenshot paths, flakes, cleanup, and risks. After three reasoned failures,
stop the server if this task started it and create a blocker report.
