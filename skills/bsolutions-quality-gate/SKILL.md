---
name: bsolutions-quality-gate
description: Select, execute, and report reproducible quality gates for Laravel/PHP, Kotlin/Android, TypeScript, database, or mixed projects. Use before declaring a task complete to verify format, lint, static analysis, compilation, tests, dependency audits, migrations, E2E, diff, secrets, and documentation.
---

# Quality gate workflow

Require stack/versions, authorized root, changed files, acceptance criteria,
project-defined commands, and time/environment constraints.

1. Read `AGENTS.md`, package/build metadata, CI configuration, and changed-file
   scope. Prefer project commands; do not install or upgrade dependencies.
2. Build a gate matrix: formatting, lint, static analysis, compilation,
   unit/integration/feature tests, migration checks, dependency audit, E2E,
   security/secret scan, diff review, and documentation.
3. Run fast/narrow deterministic checks before expensive suites. Capture command,
   duration, exit code, pass/fail/blocked, and sanitized evidence.
4. Laravel candidates: Pint, PHPStan/Larastan, Pest/PHPUnit, Composer audit,
   feature/integration, Playwright.
5. Android candidates: ktlint, detekt, Android Lint, JUnit, MockK/Turbine,
   MockWebServer, Compose UI, Room migration, `assembleDebug`.
6. TypeScript candidates: lockfile install policy, typecheck, lint, unit tests,
   build, integration/E2E, dependency audit.
7. Never disable, skip silently, weaken, or misreport a failing gate. Mark
   unavailable checks as blocked/not applicable with reason.
8. Review the final diff, generated files, temporary code, critical TODOs,
   secrets, and documentation before deciding.

Output an explicit PASS, FAIL, or BLOCKED with a gate table, failures, evidence,
risks, and next action. Three failed correction attempts require a blocker report.
