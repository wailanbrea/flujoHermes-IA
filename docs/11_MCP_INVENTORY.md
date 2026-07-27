# MCP and tool inventory

No external MCP server was installed or connected.

## Hermes `localai` tools

Enabled: terminal, file, skills, todo, memory, clarify.

Disabled: web, browser, code execution, vision, image/video generation, TTS,
session search, delegation, cron, computer use, social/search and home services.

Git is available through the controlled terminal. The dashboard reads local
health endpoints only. This is the minimum set needed for the isolated pilot.

## Future candidates

| Candidate | Function | Risk/data | Alternative | Enable when |
|---|---|---|---|---|
| Filesystem MCP | Scoped file access | Source disclosure/write | Built-in file tool + safe root | Stronger per-path enforcement is proven |
| Git MCP | Structured Git operations | Repository mutation | CLI + checkpoints | A pilot needs structured operations |
| Playwright MCP | Local E2E | Browser/session data | Project CLI | An authorized web project is onboarded |
| Docs MCP | Official reference | External request metadata | Manual official docs | A task needs current API docs |
| Test DB MCP | Query isolated DB | Schema/data mutation | CLI in Docker | A disposable database exists |

GitHub, Gmail, calendars, contacts, financial systems, production, VPS, and real
databases remain prohibited. Disable a future MCP by removing it from the
isolated profile configuration and verifying `hermes tools list`.
