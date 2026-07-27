# Future Graphiti integration

Do not install Graphiti in the initial system. Git, Markdown, task reports,
skills, and Hermes project memory are sufficient until cross-project retrieval
becomes measurably difficult.

## Reconsider when

- Dozens of active projects need relationship queries across decisions.
- Handoffs repeatedly fail because durable knowledge cannot be found.
- A retention, ownership, deletion, and access-control model exists.

## Benefits and costs

Graph memory could connect tasks, decisions, modules, incidents, and tests.
Costs include another service/database, embedding/inference load, migrations,
backup/restore, MCP permissions, retention, and poisoning/privacy risks.

## Safe migration

1. Define a minimal schema and threat model.
2. Use synthetic data in Docker.
3. Expose a read-only, project-scoped MCP prototype.
4. Import approved Markdown summaries, not raw conversations.
5. Validate deletion, provenance, access boundaries, backup, and rollback.
6. Pilot one isolated project before any wider migration.

May store public architecture, approved decisions, task IDs, test outcomes, and
sanitized dependency relationships. Never store secrets, credentials, personal
data, raw prompts, production records, private source outside authorized scope,
or unredacted logs.
