---
name: bsolutions-typescript-web
description: Implement and review production TypeScript web applications with framework-aware architecture, strict typing, accessible UI, stable state, API boundaries, browser tests, and reproducible quality gates. Use for React, Vite, Node.js, frontend modules, component libraries, forms, routing, client data fetching, web performance, Vitest, Playwright, ESLint, or TypeScript build failures.
---

# TypeScript Web Engineering

1. Query Graphify and inspect the existing package manager, framework, TypeScript
   configuration, lint rules, tests, routing, state model and API layer.
2. Preserve the project's established architecture. Separate UI, state, domain
   logic and transport code; do not introduce a new state library or framework
   without demonstrated need.
3. Keep strict types at external boundaries. Parse untrusted API, storage, URL
   and form data before it enters application state. Avoid `any`, unsafe casts
   and non-null assertions used to silence design errors.
4. Model loading, empty, success and failure states explicitly. Make retries,
   cancellation, stale responses and concurrent submissions deterministic.
5. Build accessible components with semantic HTML, keyboard behavior, visible
   focus, labelled inputs and meaningful error feedback. Do not encode state
   using color alone.
6. Keep rendering work bounded. Stabilize expensive derived values only when
   measurement or component behavior justifies it; avoid speculative memoization.
7. Treat authentication data, tokens and secrets as infrastructure concerns.
   Never embed secrets in browser bundles, logs, fixtures or committed config.
8. Add the smallest useful tests: unit tests for pure logic, component tests for
   state and accessibility, and Playwright only for critical cross-page flows.
9. Run the repository's own install, typecheck, lint, unit, build and E2E
   commands. Report exact commands, results, changed files and residual risk.

Work only in the authorized worktree. Do not rewrite lockfiles, upgrade unrelated
dependencies or reformat untouched files without an explicit requirement.
