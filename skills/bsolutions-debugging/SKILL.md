---
name: bsolutions-debugging
description: Diagnose reproducible software, tool, configuration, build, and integration failures with evidence, minimal experiments, and a strict three-attempt anti-loop protocol. Use when a command, test, API, schema, environment, or runtime behavior fails.
---

# Debugging workflow

Require the exact symptom, expected behavior, reproduction command, environment,
recent diff, allowed scope, and available evidence. Diagnose before modifying.

1. Preserve the original error and establish the smallest deterministic
   reproduction. Separate symptom, trigger, and suspected cause.
2. Inspect versions, configuration precedence, logs without secrets, inputs,
   outputs, resource limits, concurrency, and the smallest relevant code path.
3. Form one falsifiable hypothesis and choose the cheapest discriminating test.
4. Attempt 1: apply a minimal correction based on the error.
5. Attempt 2: consult official docs and verify schemas, versions, arguments,
   paths, permissions, and environmental assumptions; use a different strategy.
6. Attempt 3: isolate a minimal reproduction or controlled alternative.
7. After three failures for the same cause, stop. Do not repeat the command,
   hide the error, disable tests, or broaden permissions. Create
   `docs/BLOCKER_REPORT.md` with evidence and required human action.
8. After a fix, rerun the reproduction, nearby regression tests, and relevant
   quality gate. Review the diff for accidental workarounds.

Report root cause versus inference, experiments, outputs, changed files, proof of
fix, regression coverage, residual risks, and rollback.
