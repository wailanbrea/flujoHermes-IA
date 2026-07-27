# Testing log

| Date | Check | Result | Evidence |
|---|---|---|---|
| 2026-07-27 | LM Studio native chat 27B | PASS | 14.24 tok/s |
| 2026-07-27 | LM Studio native chat 35B | PASS | 27.58 tok/s |
| 2026-07-27 | Structured JSON and tool call 35B | PASS | `reports/models/` |
| 2026-07-27 | Hermes localai explicit 64K | PASS | `hermes-localai-explicit-usage.json` |
| 2026-07-27 | Hermes local skill discovery | PASS | 9 enabled |
| 2026-07-27 | `bsolutions-quality-gate` discovery | PASS | `hermes-skill-usage.json` |
| 2026-07-27 | Dashboard lint and build | PASS | local command output |
| 2026-07-27 | Dashboard production assets/hydration | PASS | asset 200; navegador “Señal en vivo” |
| 2026-07-27 | Dashboard API method/origin controls | PASS | POST 405; foreign origin 403 |
| 2026-07-27 | Dashboard dependency audit | PASS | `npm audit`: 0 vulnerabilities |
| 2026-07-27 | PHP pilot independent test | PASS | `PILOT_TESTS_OK`, exit 0 |
| 2026-07-27 | Hermes interactive pilot report | PARTIAL | Functional result passes; report required correction |
| 2026-07-27 | Hermes checkpoint creation/restoration | PASS | shadow commit `dbb3aba`; canary restored |
| 2026-07-27 | Hermes blocked-path policy | PASS | XAMPP target rejected by safe-root classifier |
| 2026-07-27 | Hermes dangerous-command classification | PASS | recursive delete classified; mode `manual` |
| 2026-07-27 | Hermes approval bypass review | FAIL → MITIGATED | `--oneshot` sets YOLO mode; launcher now blocks it |
| 2026-07-27 | PowerShell/Bash syntax | PASS | all workspace scripts parsed |
| 2026-07-27 | JSON/YAML parsing | PASS | 13 JSON, 15 YAML |

Blocked or pending results are never counted as passing.
