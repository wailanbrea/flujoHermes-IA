---
name: bsolutions-mysql
description: Design and review MySQL-compatible schemas, migrations, queries, indexes, constraints, transactions, locking, concurrency, and backup plans in isolated environments. Use for MySQL or MariaDB data modeling and performance work, never for production mutation.
---

# MySQL workflow

## Required inputs

Require database engine/version, isolated connection target, objective, expected
volume, access patterns, invariants, migration mechanism, rollback expectations,
and authorization. Refuse production writes, real credentials, and `DROP DATABASE`.

## Process

1. Confirm whether the engine is MySQL or MariaDB; do not claim equivalence.
2. Inspect the relevant schema, migrations, query plans, and test fixtures only.
3. Normalize by default; denormalize only with measured read requirements and a
   synchronization invariant.
4. Define primary keys, foreign keys, `NOT NULL`, unique/check constraints, and
   explicit collations. Index real predicates, joins, and orderings; avoid
   redundant or low-value indexes.
5. Use `DECIMAL(p,s)` for money with explicit rounding; never float/double.
6. Design forward and rollback migrations. For large tables, assess lock time,
   online DDL support, backfill batches, and deploy ordering.
7. Use transactions for business invariants. Document isolation level, lock
   order, deadlock retry, optimistic/pessimistic strategy, and idempotency.
8. Validate with test data, constraint failures, duplicate requests, boundary
   values, concurrent writes, `EXPLAIN`, and rollback in an isolated database.
9. Define backup, restore-test, retention, and recovery-point expectations.

## Exit and report

Report schema/query diff, plans before/after, test evidence, lock and data-loss
risks, rollback, engine-specific caveats, and backup requirements. After three
failed approaches, stop and produce a blocker report.
