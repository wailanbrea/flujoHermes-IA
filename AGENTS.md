# AGENTS.md

## Alcance autorizado

La ruta autorizada inicialmente es `C:\AI-Workspace\local-ai-orchestrator`.
No se permite modificar proyectos reales, archivos `.env`, credenciales, claves SSH,
configuración de producción ni bases de datos existentes.

## Flujo obligatorio

Inspeccionar, planificar, ejecutar un cambio pequeño, verificar, registrar y crear un
checkpoint. El compilador, las pruebas, los linters, el análisis estático y el diff de
Git son la autoridad; una respuesta de IA nunca es evidencia suficiente.

## Seguridad

- No usar modos equivalentes a `--yolo`.
- No ejecutar acciones destructivas.
- Máximo tres intentos razonados por una misma causa.
- Redactar tokens, prompts, rutas personales y secretos en logs y telemetría.
- Solicitar aprobación para privilegios, reinicios, instalaciones globales, cambios de
  puertos, acceso externo, credenciales o modificación de proyectos reales.

## Git

Cambios pequeños y cohesivos, revisión del diff antes del commit, sin force push ni
eliminación de historial. No versionar telemetría en vivo, secretos, backups ni
artefactos generados.

## Dashboard

El dashboard es una vista de observabilidad, no una autoridad de ejecución. Debe
mostrar la procedencia y antigüedad de cada dato, distinguir `healthy`, `degraded`,
`offline` y `unknown`, y no mostrar contenido de prompts, respuestas ni argumentos de
herramientas salvo que se habilite una captura saneada explícita.

## Delegación local

- Para implementaciones autorizadas en un repositorio Git propio, Codex, Claude Code,
  Antigravity u OpenCode actúan como director: diseñan el contrato y delegan la
  generación/edición a Hermes mediante
  `scripts/windows/submit-hermes-task.ps1`.
- El director debe identificarse con `-RequestedBy Codex`, `-RequestedBy Claude` o
  `-RequestedBy Antigravity` o `-RequestedBy OpenCode`.
- No invocar Hermes con `--yolo`, `--oneshot` ni `-z`. El worker usa aprobaciones
  normales, checkpoints, herramientas limitadas, máximo de turnos y worktree aislado.
- Enviar la tarea sin `-Wait` y esperar con
  `scripts/windows/wait-hermes-task.ps1 -TaskId <id>`, que devuelve el resumen acotado
  en una sola llamada. Sondear `status.json` en bucle gasta contexto del director sin
  aportar información nueva.
- LM Studio carga cada modelo con paralelismo 4 (medido: sin coste de rendimiento
  con una sola petición en curso, +0,95 GiB dedicados en gemma y +0,13 GiB en qwen,
  y 1,5x de rendimiento agregado con varias peticiones concurrentes). Esto permite
  someter hasta dos tareas Hermes a la vez contra el mismo modelo cargado sin
  degradar la que ya estaba en curso. No someter una tercera: cada tarea añade su
  propio worktree y su propio consumo de contexto, y no se ha medido más allá de dos.
- El mismo director debe revisar el resumen de
  `scripts/windows/get-hermes-brief.ps1` —veredicto, violaciones de política, líneas
  por archivo y cabeceras de hunk— y leer `changes.patch` completo sólo cuando ese
  resumen no baste. Sólo después puede usar
  `scripts/windows/review-hermes-task.ps1 -Decision Approve -ReviewedBy <director>`.
- El director ejecuta pruebas independientes y cierra con `-Decision Complete`. Un
  resultado de Hermes nunca es evidencia suficiente por sí solo.
- Proyectos sin Git propio permanecen en análisis Graphify, pero no reciben escritura
  delegada hasta disponer de un límite reversible y verificable.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

### Automatic project onboarding

- Before raw search or file reads, run
  `scripts/windows/ensure-project-graph.ps1 -ProjectPath <exact-root> -Question <task>`.
- If the project is absent, the script builds an AST-only graph in the local Graphify
  cache and registers it globally. It never enables semantic or external model extraction.
- Resolve a named local project with `scripts/windows/resolve-project.ps1 -Name
  <fragment>`, which returns only the matching rows. Do not read
  `telemetry/runtime/project-catalog.json` whole: it is ~34 KB for a single lookup.
  The managed roots are `C:\xampp\php\www`, `C:\Users\waila\StudioProjects`, and
  `C:\Users\waila\AndroidStudioProjects`.
- Identical bounded queries are served from a local cache keyed on the graph's own
  timestamp, so repeating a question is free. Pass `-NoCache` only when the cache
  itself is suspect.
- Refresh the managed catalog with `scripts/windows/index-project-roots.ps1`. This
  authorized batch may cross the interactive corpus-size guard, but remains AST-only,
  skips sensitive files, and must not modify project source.
- Stop and narrow scope when the detector reports more than 500 supported files or two
  million words. Never bypass this guard with broad raw searches.
- Use the returned bounded subgraph first. Read exact files only when needed to implement
  or verify a change.
- After code changes, run the same script with `-Refresh` before handoff.
- Graph registration is read-only navigation authorization, not authorization to modify
  the indexed project.
