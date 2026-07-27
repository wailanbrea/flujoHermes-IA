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

- Para implementaciones autorizadas en un repositorio Git propio, Codex diseña el
  contrato y delega la generación/edición a Hermes mediante
  `scripts/windows/submit-hermes-task.ps1`.
- No invocar Hermes con `--yolo`, `--oneshot` ni `-z`. El worker usa aprobaciones
  normales, checkpoints, herramientas limitadas, máximo de turnos y worktree aislado.
- Codex debe revisar `changes.patch`; sólo después puede usar
  `scripts/windows/review-hermes-task.ps1 -Decision Approve`.
- Codex ejecuta pruebas independientes y cierra con `-Decision Complete`. Un resultado
  de Hermes nunca es evidencia suficiente por sí solo.
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
- Before resolving a named local project with broad disk search, consult
  `telemetry/runtime/project-catalog.json`. The managed roots are `C:\xampp\php\www`,
  `C:\Users\waila\StudioProjects`, and `C:\Users\waila\AndroidStudioProjects`.
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
