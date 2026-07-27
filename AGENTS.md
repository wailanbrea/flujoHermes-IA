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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
