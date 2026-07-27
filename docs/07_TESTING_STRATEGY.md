# Testing strategy

Use a risk-based pyramid with deterministic checks first:

1. Schema/configuration validation.
2. Unit tests for pure behavior.
3. Integration tests at process, filesystem, database, and local HTTP boundaries.
4. Contract tests for APIs and event payloads.
5. E2E tests for critical user flows only.
6. Security, dependency, performance, migration, backup/restore, and concurrency
   checks when the change creates those risks.

Every result records exact command, environment, duration, exit code, pass/fail,
sanitized evidence, and blocked controls. A failing control is never disabled.

## Context policy

Exclude `.git`, `vendor`, `node_modules`, `.gradle`, `.idea`, `.vscode`, `build`,
`dist`, logs, coverage, old reports, packages, media, binaries, backups, and
generated files unless explicitly relevant. Warn at 75%, compact at 80%, and
create a handoff near 90% of the model context.
