---
name: bsolutions-mcp-integration
description: Design, implement and review Model Context Protocol servers, clients and tool integrations with explicit schemas, transport lifecycle, capability negotiation, authorization boundaries, secret isolation, timeouts, idempotency, observability and contract tests. Use for MCP manifests, stdio or HTTP transports, tool/resource/prompt handlers, host integration, AppControl, JSON-RPC failures, or MCP security reviews.
---

# MCP Integration Engineering

1. Identify the MCP host, server, transport, trust boundary, authentication
   mechanism and exact capabilities required. Prefer a skill over a custom tool
   when existing terminal or web capabilities already solve the problem.
2. Define narrow tool schemas with stable names, explicit descriptions, required
   fields, bounded strings and arrays, and rejection of unknown or malformed
   input. Treat every model-provided argument as untrusted.
3. Separate protocol handling from domain services and infrastructure adapters.
   Keep transport lifecycle, business logic, credentials and host registration
   independently testable.
4. Apply least privilege. Expose only required tools/resources, filter inherited
   environment variables, redact secrets, restrict filesystem/network scope and
   require approval for destructive or externally visible effects.
5. Make operations timeout-aware, cancellable and idempotent where retries are
   possible. Return structured errors without stack traces, tokens, private paths
   or raw upstream payloads.
6. Handle initialize/shutdown, capability negotiation, disconnects, partial
   responses, invalid JSON-RPC messages and unavailable dependencies explicitly.
7. Add contract tests for schemas and happy paths, negative tests for invalid
   input and authorization, and integration tests for the real transport without
   production credentials.
8. Measure tool-schema context cost. Keep the exposed catalog small and use tool
   search or role-specific profiles when an MCP server has a broad surface.
9. Verify with the project's formatter, type checker, tests and a host-level
   smoke test. Report the configured capabilities and evidence without secrets.

Never enable an MCP server globally, reload credentials, contact third parties or
publish a plugin without separate authorization.
