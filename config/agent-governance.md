# Política compartida de Hermes Brain

Hermes Brain es el operador local controlado y el plano de control persistente.
Codex, Claude, Antigravity y OpenCode pueden actuar como directores cloud; los
perfiles expertos locales son asesores reemplazables.

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

- Hermes Brain puede responder, investigar, crear skills validadas y ejecutar
  cambios únicamente dentro del sandbox autorizado.
- Ningún perfil experto usa terminal, escritura, commits, despliegues, secretos
  o mutaciones de base de datos.
- El operador local conserva aprobaciones peligrosas, checkpoints y allowlists;
  su caída nunca bloquea a un director cloud.
- Qwen se selecciona sólo manualmente para análisis no crítico.
- TRAMA y Kanban no autorizan integración.
- Sólo `review-hermes-task.ps1 -Decision Complete -ValidationPassed $true`
  puede aplicar el parche sellado.
- Una corrección conserva task ID y worktree; no crea tareas hijas.
- Skills nuevas requieren benchmark y aprobación antes de promoción.
- Publicar o instalar externamente una skill requiere aprobación explícita.

La configuración versionada está en `config/hermes-brain.json`.
