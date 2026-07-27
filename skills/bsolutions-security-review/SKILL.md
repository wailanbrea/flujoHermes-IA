---
name: bsolutions-security-review
description: Perform scoped application and infrastructure security reviews covering trust boundaries, authorization, validation, secrets, dependencies, injection, data exposure, SSRF, file access, logging, and abuse cases. Use for authorized code, configuration, API, Laravel, Android, or local-agent reviews.
---

# Security review workflow

Require authorized scope, assets, data classification, trust boundaries,
deployment context, threat actors, and change/diff. Review only; do not exploit
external systems, read secrets, or mutate production.

1. Build a compact data-flow and trust-boundary map.
2. Identify entry points, identities, privileges, sensitive data, files,
   networks, third parties, and irreversible actions.
3. Review authentication, object/action authorization, session/token handling,
   validation and encoding, injection, XSS/CSRF, SSRF, path traversal, uploads,
   deserialization, command execution, race conditions, and denial of service.
4. Review secret sources and redaction without printing values.
5. Review dependency provenance, lockfiles, audits, update risk, and build hooks.
6. Verify least privilege, loopback binding, egress limits, timeouts, rate/size
   limits, secure defaults, logging, retention, backup, and incident evidence.
7. Distinguish confirmed vulnerabilities from hypotheses. Use safe local tests
   or static evidence; never claim a scanner/test was run when it was not.

Report severity, confidence, evidence, attack preconditions, impact, fix, and
verification. Escalate critical findings immediately. Stop after three failed
verification approaches and document the blocker.
