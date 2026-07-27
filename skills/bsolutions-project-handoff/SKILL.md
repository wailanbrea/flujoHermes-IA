---
name: bsolutions-project-handoff
description: Close an AI-assisted engineering task by updating compact project state, task status, decisions, testing evidence, changelog, metrics, risks, and next-agent instructions. Use after validated work or when stopping at a documented blocker.
---

# Project handoff workflow

Require task contract, acceptance criteria, final diff/status, commands/results,
decisions, risks, and unresolved items. Never mark incomplete or unverified work
as done.

1. Verify the repository root and authorized scope. Read current project state,
   tasks, decisions, testing log, changelog, and existing handoff.
2. Reconcile acceptance criteria and quality gates as pass, fail, blocked, or
   not applicable with evidence.
3. Summarize changed files and behavior, not raw conversation history.
4. Record durable decisions with context, choice, alternatives, consequences,
   and reversal path.
5. Update:
   `docs/00_PROJECT_STATE.md`, `docs/02_TASKS.md`, `docs/06_DECISIONS.md`,
   `docs/08_TESTING_LOG.md`, `docs/11_CHANGELOG_AI.md`, and
   `docs/12_NEXT_AI_HANDOFF.md`.
6. Record metrics using the project template: model, duration, context/tokens
   when available, calls, tools/errors/retries, tests, files/lines, quality
   result, escalation, speed, RAM, and VRAM. Use `null`, never invented values.
7. Include exact safe continuation steps, prerequisites, protected paths,
   current branch/checkpoint, and the first next action.
8. Check Git status and diff. Do not commit, push, restore, or delete unless the
   task explicitly authorizes it.

The handoff must stand alone without secrets, prompts, noisy logs, or unstated
assumptions. If blocked, link the blocker report and required human decision.
