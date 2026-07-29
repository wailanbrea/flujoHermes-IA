# Gobernanza compartida de agentes IA

Esta política aplica a Codex, Claude Code, Google Antigravity y OpenCode cuando actúan
como directores de trabajo.

## Principio de coste

La delegación sólo rinde si el contexto que llega al director queda acotado. Los
tokens del modelo local son gratuitos; los del director no. Un parche de 256 KB
leído para revisarlo cuesta más que haber escrito el cambio a mano. Cada paso de
abajo existe para devolver lo mínimo suficiente para decidir.

## Flujo obligatorio

1. Resolver el proyecto exacto con
   `scripts/windows/resolve-project.ps1 -Name <fragmento>`. No leer
   `telemetry/runtime/project-catalog.json` entero: son ~34 KB para un dato.
2. Ejecutar `scripts/windows/ensure-project-graph.ps1` con una pregunta concreta y usar
   el contexto acotado de Graphify antes de búsquedas o lecturas amplias. Las respuestas
   idénticas se sirven de caché; usar `-NoCache` sólo si se sospecha del caché.
3. Para una implementación autorizada, delegar generación, edición y validación inicial
   a Hermes mediante `scripts/windows/submit-hermes-task.ps1`, **sin** `-Wait`.
4. Indicar el director real con `-RequestedBy Codex`, `-RequestedBy Claude` o
   `-RequestedBy Antigravity` o `-RequestedBy OpenCode`.
5. Esperar con `scripts/windows/wait-hermes-task.ps1 -TaskId <id>`. Nunca sondear
   `status.json` en bucle: cada sondeo cuesta un viaje completo de contexto.
6. Revisar el resumen acotado que devuelve la espera, o
   `scripts/windows/get-hermes-brief.ps1 -TaskId <id>`. Leer `changes.patch` completo
   sólo cuando las cabeceras de hunk no basten para decidir, y decirlo al justificar.
7. Aprobar o rechazar con `scripts/windows/review-hermes-task.ps1 -ReviewedBy <director>`.
8. Ejecutar compilación, linters y pruebas de forma independiente. Sólo entonces cerrar
   la tarea con `-Decision Complete`, `-ValidationPassed` y `-ValidationSummary`
   nombrando los comandos reales. El resumen se archiva en `validation.json`.
9. Refrescar Graphify después de cambios validados.

## Límites

- La escritura delegada exige autorización explícita, Git propio y worktree limpio.
- Acotar cada contrato con `-AllowedFiles` y un `-MaxPatchBytes` que se pueda revisar.
  El valor por defecto es 32 KB; subirlo es una decisión consciente, no un reflejo.
  Si un cambio no cabe, trocearlo en tareas, no ampliar el límite.
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
  Es el único recurso caro del sistema; su contexto se gasta con la misma cautela que
  un permiso de escritura.
- Graphify: entrega contexto estructural acotado y evita recorridos innecesarios.
- Hermes: ejecuta el trabajo pesado dentro del worktree aislado usando LM Studio.
- TRAMA: observa el flujo; no autoriza ni ejecuta cambios.
