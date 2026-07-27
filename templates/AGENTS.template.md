# Project agent rules

## Stack and architecture

- Runtime/framework versions: `<fill>`
- Architecture and module boundaries: `<fill>`
- Existing dependency injection/state/data patterns: `<fill>`

## Authorized operation

- Allowed paths: `<fill>`
- Protected paths: `.env`, credentials, production configuration, generated
  artifacts, existing migrations used in production.
- Safe commands: `<fill>`
- Required quality commands: `<fill>`

## Engineering rules

- Preserve existing conventions and public compatibility.
- Validate all input and authorization; use least privilege.
- Keep functions cohesive, state explicit, dependencies minimal, and errors
  observable.
- Never use float/double for money; define precision and rounding.
- Do not read secrets or production data.

## Git and database

- One task per branch/checkpoint; review diff; no force push or history deletion.
- Use isolated/test databases only. Migrations must be forward-safe and reversible.

## Definition of done

Acceptance criteria, compile/build, related tests, lint/static analysis, security
review, documentation, task report, metrics, diff review, and checkpoint pass.

## Failure and handoff

Use at most three reasoned attempts for one cause. Then stop and write a blocker.
Update project state, tasks, decisions, testing log, changelog, and next handoff.
