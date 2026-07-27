---
name: bsolutions-laravel
description: Implement and review isolated Laravel or modern PHP changes with architecture discovery, validation, authorization, MySQL safety, tests, static analysis, and reproducible reports. Use for Laravel controllers, requests, services/actions, policies, resources, jobs, events, Eloquent, migrations, queues, cache, Sanctum, Pest/PHPUnit, Pint, PHPStan/Larastan, or API work.
---

# Laravel workflow

## Required inputs

Require one objective, allowed and forbidden paths, framework/PHP versions,
acceptance criteria, required tests, and existing project commands. Do not use
this skill without an isolated project or explicit authorization for the target.

## Process

1. Read `AGENTS.md`, Composer metadata, routes, nearby tests, and the smallest
   relevant implementation surface. Never read `.env`.
2. Describe the existing architecture and preserve its conventions. Do not add
   repositories, actions, DTOs, or abstractions unless they remove a real
   responsibility or boundary problem.
3. Validate input with Form Requests; authorize with Policies/Gates; keep
   controllers thin; use Services/Actions for cohesive business operations.
4. Use API Resources and consistent error envelopes for APIs.
5. Wrap multi-write business invariants in transactions. Design jobs and
   externally retried writes to be idempotent.
6. Prevent N+1 queries, unbounded lists, unsafe mass assignment, injection,
   XSS, CSRF, broken authorization, and secret leakage.
7. For money, use SQL `DECIMAL`, explicit rounding, and string/decimal values;
   never `float` or `double`.
8. Add focused tests for success, invalid input, forbidden access, empty data,
   limits, concurrency/idempotency, and failures.
9. Run project-defined commands. Safe defaults, when installed, are:
   `composer validate`, `vendor/bin/pint --test`, `vendor/bin/phpstan analyse`,
   and `php artisan test`.
10. Review the diff and migrations. Never alter a production-used migration;
    create a reversible new migration.

## Exit and report

Finish only when acceptance criteria, tests, analysis, formatting, security
checks, diff review, and documentation pass. Report files changed, commands and
results, database impact, risks, rollback, and unresolved items.

After one failure, make a minimal correction; after two, consult project and
official framework documentation; after three, stop and create a blocker
report. Never disable a failing control.
