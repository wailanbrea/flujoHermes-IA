# Gobernanza compartida de agentes IA

Esta política aplica a Codex, Claude Code, Google Antigravity y OpenCode cuando actúan
como directores de trabajo.

## Flujo obligatorio

1. Resolver primero el proyecto exacto en
   `C:\AI-Workspace\local-ai-orchestrator\telemetry\runtime\project-catalog.json`.
2. Ejecutar `scripts/windows/ensure-project-graph.ps1` con una pregunta concreta y usar
   el contexto acotado de Graphify antes de búsquedas o lecturas amplias.
3. Para una implementación autorizada, delegar generación, edición y validación inicial
   a Hermes mediante `scripts/windows/submit-hermes-task.ps1`.
4. Indicar el director real con `-RequestedBy Codex`, `-RequestedBy Claude` o
   `-RequestedBy Antigravity` o `-RequestedBy OpenCode`.
5. Revisar `changes.patch`, límites, seguridad y criterios antes de integrar. Aprobar o
   rechazar con `scripts/windows/review-hermes-task.ps1 -ReviewedBy <director>`.
6. Ejecutar compilación, linters y pruebas de forma independiente. Sólo entonces cerrar
   la tarea con `-Decision Complete`.
7. Refrescar Graphify después de cambios validados.

## Límites

- La escritura delegada exige autorización explícita, Git propio y worktree limpio.
- Un proyecto sin Git propio permanece en análisis Graphify de sólo lectura.
- Nunca usar `--yolo`, `--oneshot`, `-z`, force push ni comandos destructivos.
- No enviar secretos, credenciales, bases de datos, despliegues ni datos privados a
  Hermes.
- No asumir que la salida de otra IA es evidencia: el diff, compilador y pruebas mandan.
- Si Hermes o LM Studio no están disponibles, detener la delegación e informar el
  bloqueo; no sustituir silenciosamente el flujo con edición directa.
- TRAMA recibe sólo estados y métricas saneadas, nunca prompts, respuestas ni argumentos
  de herramientas.

## Responsabilidades

- Director IA: comprende la petición, diseña el contrato, decide riesgos, revisa y valida.
- Graphify: entrega contexto estructural acotado y evita recorridos innecesarios.
- Hermes: ejecuta el trabajo pesado dentro del worktree aislado usando LM Studio.
- TRAMA: observa el flujo; no autoriza ni ejecuta cambios.
