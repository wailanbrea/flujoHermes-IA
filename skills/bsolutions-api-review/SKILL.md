---
name: bsolutions-api-review
description: Review HTTP or event API contracts for correctness, compatibility, validation, authorization, idempotency, pagination, errors, observability, performance, and tests. Use when assessing OpenAPI, controllers, resources, DTOs, webhooks, or proposed API changes.
---

# API review workflow

Require the contract, implementation/diff, versions, consumers, auth model,
acceptance criteria, and compatibility policy. Remain read-only unless a fix is
explicitly requested.

1. Map each endpoint/event to input schema, authn/authz, business operation,
   output schema, status codes, side effects, and tests.
2. Verify required/optional/null semantics, bounds, formats, unknown fields,
   content types, and consistent error envelopes.
3. Check object-level and action-level authorization; never accept client-
   supplied ownership or privilege claims without server verification.
4. Check idempotency and retry semantics for writes, jobs, and webhooks.
5. Check pagination stability, filtering, sorting, rate/size limits, timeouts,
   caching, N+1 behavior, and sensitive-field exposure.
6. Classify compatibility: additive, conditionally compatible, or breaking.
   Require a migration/versioning plan for breaking changes.
7. Require contract, integration, negative, authorization, concurrency, and
   boundary tests proportional to risk.

Report findings by severity with exact evidence, impact, and minimal remediation.
Also report verified strengths, open assumptions, and test gaps. Do not invent
runtime results. Stop after three failed verification strategies.
