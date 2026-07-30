# Hermes Brain governance

La ruta autorizada inicialmente es `C:\AI-Workspace\local-ai-orchestrator`.
No amplíes esta autorización a secretos, despliegues o bases de datos.

## Flujo obligatorio

1. Determina la raíz exacta del proyecto.
2. Consulta `telemetry/runtime/project-catalog.json` antes de buscar rutas.
3. Ejecuta `scripts/windows/ensure-project-graph.ps1` con la raíz y una
   pregunta breve antes de buscar archivos o elegir herramientas.
4. Si habrá escritura, exige Git propio y repositorio fuente limpio.
5. Crea el worktree con `scripts/windows/new-hermes-sandbox.ps1`.
6. El ejecutor autorizado —Hermes Brain, Codex, Claude, Antigravity u
   OpenCode— edita exclusivamente el `sandboxPath` devuelto. Nunca escribe
   directamente en el checkout fuente.
7. Sella el resultado con `scripts/windows/seal-hermes-task.ps1`.
8. Revisa con `scripts/windows/review-hermes-task.ps1 -Decision Approve`.
   Aprobar evidencia no aplica el parche.
9. Ejecuta pruebas independientes dentro del sandbox.
10. Cierra con `-Decision Complete -ValidationPassed $true`. Sólo esta puerta
    aplica una vez, limpia el sandbox, actualiza Graphify y registra aprendizaje.
11. Si la validación falla, usa `Complete -ValidationPassed $false` o
    `RequestChanges`. La misma tarea vuelve a `editing`; no crees tareas hijas.

## Plano de control

- Hermes Brain responde consultas, investiga, recuerda contexto, crea skills
  validadas, enruta capacidades, selecciona asesores, crea sandboxes y conserva
  evidencia.
- Graphify es la primera fuente de navegación estructural.
- El perfil `hermesbrain` es un operador local controlado. Puede usar web,
  navegador, archivos, terminal y ejecución de código para el objetivo indicado;
  cualquier escritura de proyecto queda limitada al sandbox y conserva
  aprobaciones peligrosas.
- Los perfiles expertos siguen siendo asesores read-only con contexto acotado.
- `submit-hermes-task.ps1` e `invoke-hermes-task.ps1` son legacy explícito y
  sólo admiten análisis read-only con `-LegacyReadOnly`.
- TRAMA observa estado saneado. Nunca autoriza, ejecuta ni integra.
- Kanban coordina briefs de especialistas; no es la fuente autoritativa del
  lifecycle del sandbox y su descomposición automática debe permanecer apagada.

## Evidencia y aprendizaje

- Estados principales: `isolated → editing → sealed → validating → completed`.
- Errores terminan en `blocked`; una integración aplicada cuya limpieza falló
  usa `applied-cleanup-pending` y puede reintentarse sin reaplicar.
- Sólo hashes, diffs LF, allowlists, límites y pruebas reproducibles autorizan
  integración.
- Aprende únicamente de código compilado, tests aprobados, parches integrados y
  diagnósticos confirmados.
- No guardes prompts, respuestas, código completo, argumentos de herramientas,
  credenciales, rutas privadas absolutas ni IDs de sesión.
- Una skill sigue `candidate → benchmark → validated → aprobación → promoted`.
- Crear o actualizar una skill dentro de un directorio autorizado está
  permitido; publicarla, instalarla externamente o promoverla exige aprobación.

## Catálogo y Graphify

- Los proyectos conocidos viven en
  `telemetry/runtime/project-catalog.json`.
- Las raíces administradas son `C:\xampp\php\www`,
  `C:\Users\waila\StudioProjects` y
  `C:\Users\waila\AndroidStudioProjects`.
- Si falta un proyecto de esas raíces, ejecuta
  `scripts/windows/index-project-roots.ps1`.
- Si el corpus supera 500 archivos o dos millones de palabras, pide una raíz
  menor. La incorporación automática usa AST local, omite archivos sensibles y
  no amplía permisos de escritura.
- Usa `graphify query`, `path` o `explain` antes de `rg` o lecturas múltiples.
- Después de integrar, refresca y registra el grafo global.

## Calidad

- Mantén cambios pequeños, tipados, modulares e idempotentes.
- Valida entradas, rutas, concurrencia y estados inesperados.
- Ejecuta parser PowerShell, pruebas del Brain y lifecycle, `npm run lint`,
  `npm test` y `git diff --check`.
- No uses `--yolo`, `--oneshot` ni `-z`.
- No hagas push sin instrucción explícita.
