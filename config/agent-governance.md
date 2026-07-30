# Política compartida de Hermes Brain

Codex, Claude, Antigravity y OpenCode son directores cloud. Hermes Brain es el
plano de control persistente; los modelos locales son asesores reemplazables.

## Secuencia

1. Resolver el proyecto desde el catálogo local.
2. Consultar Graphify antes de explorar archivos.
3. Crear un sandbox con `new-hermes-sandbox.ps1`.
4. Editar sólo el `sandboxPath` devuelto.
5. Sellar diff y evidencia con `seal-hermes-task.ps1`.
6. Aprobar evidencia sin aplicar.
7. Ejecutar validación independiente.
8. Completar una sola vez o devolver el mismo sandbox a `editing`.
9. Registrar aprendizaje saneado después de `completed`.

## Límites

- Hermes, Gemma y Qwen no generan ni editan código.
- Ningún perfil experto usa terminal, escritura, commits, despliegues, secretos
  o mutaciones de base de datos.
- La IA local puede clasificar o resumir durante un máximo de 60 segundos. Su
  caída nunca bloquea al director.
- Qwen se selecciona sólo manualmente para análisis no crítico.
- TRAMA y Kanban no autorizan integración.
- Sólo `review-hermes-task.ps1 -Decision Complete -ValidationPassed $true`
  puede aplicar el parche sellado.
- Una corrección conserva task ID y worktree; no crea tareas hijas.
- Skills nuevas requieren benchmark y aprobación antes de promoción.

La configuración versionada está en `config/hermes-brain.json`.
