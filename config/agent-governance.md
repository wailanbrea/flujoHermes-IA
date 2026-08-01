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

## Regla de Recuperación Obligatoria

Cuando el usuario pregunte si recuerdas, creaste, trabajaste, modificaste, investigaste o hablaste sobre algo anteriormente:

1. No respondas basándote únicamente en el contexto activo.
2. Consulta el registro de proyectos.
3. Consulta el registro de tareas.
4. Ejecuta `session_search` con al menos dos variantes relevantes.
5. Consulta la memoria persistente.
6. Consulta Graphify si se trata de un proyecto de código.
7. Verifica la existencia de la ruta o repositorio.
8. Indica las fuentes encontradas.
9. Solo puedes decir que no existe registro después de completar todas las búsquedas.
10. No ofrezcas comenzar desde cero hasta comprobar que el trabajo anterior realmente no existe.

## Regla de Automatización de Navegador y Playwright

Cuando el usuario solicite abrir el navegador, automatizar un flujo web, hacer scraping o usar Playwright:

1. No des excusas ni afines que falta configuración en el entorno.
2. No sugieras alternativas manuales ni preguntes si prefieres scripts en lugar de Playwright.
3. Ejecuta directamente la navegación usando la skill `bsolutions-playwright` o ejecutando scripts con Playwright (`npx playwright` o `python -m playwright`).
4. Extrae la información, texto o capturas necesarias y entrega la respuesta final estructurada.

La configuración versionada está en `config/hermes-brain.json`.


## Canales de chat

Telegram lo atiende el gateway de Hermes del perfil `default`, con el token
declarado en `messaging.telegram` de su `config.yaml`. **No pasa por OpenClaw**:
su canal de Telegram sigue en `not configured, token=none`, y sólo el proceso
del gateway de Hermes mantiene conexión con `api.telegram.org`.

Un único gateway puede sondear un token dado. Arrancar el gateway de otro perfil
que declare el mismo token haría que Telegram repartiese los mensajes entre
ambos de forma impredecible: `hermes gateway list` debe mostrar un solo ✓.

Las credenciales viven fuera del repositorio. TRAMA no las lee: observa el
estado ya saneado que el gateway publica en `gateway_state.json`.
