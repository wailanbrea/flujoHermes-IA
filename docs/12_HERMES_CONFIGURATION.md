# Configuración de Hermes

## Perfil aislado

- Perfil: `localai`
- Proveedor principal: `lmstudio`
- Modelo principal: `google/gemma-4-12b-qat`
- Fallback: `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive` mediante `lmstudio`
- Base URL: `http://127.0.0.1:1234/v1`
- Contexto declarado: `65536`
- Carga de LM Studio: `explicit`
- Esfuerzo de razonamiento: `none`
- Backend de terminal: `local`
- Worktrees y contratos de ejecución: `%LOCALAPPDATA%\local-ai-orchestrator`
- Toolsets interactivos: web, navegador, archivos, terminal, ejecución de código,
  visión, memoria, contexto, skills, planificación y delegación.

El perfil `default` y `hermesbrain` comparten la política de operador controlado.
El worker delegado sigue reduciendo sus herramientas por fase y trabaja en un
`HERMES_HOME` efímero.

## Aprobaciones

- Modo: `manual`
- Tiempo de espera: 60 segundos
- Tareas programadas: denegadas
- Recarga MCP: requiere confirmación
- Comandos destructivos: requieren confirmación
- Corte por denegaciones: 3

El worker headless no recibe la herramienta `terminal`. El MCP Playwright se
usa sólo para validar TRAMA local. Esto evita esperas de
aprobación sin TTY. Las compilaciones y pruebas siguen siendo obligación del
director después de revisar el parche.

Cada proceso delegado usa un `HERMES_HOME` efímero dentro del intercambio de la
tarea. El worker copia sólo `config.yaml` de `localai` y genera un `.env` sin
credenciales con `HERMES_WRITE_SAFE_ROOT=workspacePath`.

## Prompt operativo

El worker antepone `config/hermes-operating-prompt.md` al contrato. Las reglas
limitan reintentos, detienen errores de esquema, exigen editar temprano y obligan
a terminar con evidencia concreta. El mismo bloque está incluido condicionalmente
en el preset `Laravel y kotlin Promt` de LM Studio.

## Checkpoints

- Activados en el perfil `localai`.
- Máximo: 20 snapshots, 500 MB totales y 10 MB por archivo.
- Almacenamiento: shadow Git propio del perfil; no altera el `.git` del proyecto.
- Validación: checkpoint `dbb3aba` y restauración de archivo canario correctos.

## Modos prohibidos

No usar `--oneshot`, `-z` ni `--yolo`. En esta versión, `--oneshot` activa
internamente `HERMES_YOLO_MODE=1` y omite aprobaciones.

## Arranque seguro

Usar siempre:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-hermes-local.ps1
```

El cargador prepara Gemma por defecto con 64K, paralelo 1, GPU máxima y MTP
desactivado. Para preparar manualmente el fallback:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\prepare-hermes-model.ps1 -Model qwen
```

Qwen usa GPU 0.50 para mantener la memoria compartida cerca de 0,40 GiB.

## Insights

`export-hermes-insights.ps1` usa las APIs oficiales `SessionDB` e
`InsightsEngine`. Sólo exporta contadores y etiquetas agregadas a
`telemetry/runtime/hermes-insights.json`; no exporta prompts, respuestas, IDs ni
argumentos. El worker refresca este archivo al terminar una sesión.
## Ejecución por fases

El contrato separa herramientas para reducir tokens y errores de esquema:

- `plan`: modo análisis y toolset `file`.
- `edit`: modo ejecución y toolset `file`; exige `AllowedFiles`.
- `browser`: modo análisis y toolset `playwright` únicamente.

El worker vuelve a validar fase y toolset antes de iniciar Hermes. Un contrato no
puede habilitar terminal ni combinar edición con los 23 esquemas de Playwright.

## Guardián de parches

Las tareas `edit` declaran archivos permitidos y límites de líneas añadidas,
eliminadas y bytes. Antes de revisión, el worker calcula `git diff --numstat`,
rechaza binarios, rutas fuera de whitelist y, cuando se solicita, secuencias
literales `\n` en líneas añadidas. La evidencia saneada se conserva en
`patch-validation.json` y el revisor comprueba que coincida con el parche.

## Ciclo de corrección

Cada tarea empieza en el intento 1 de un máximo de 3. `RequestChanges` exige
feedback concreto, lo sanea a 500 caracteres y crea una tarea hija limpia con el
intento incrementado. El estado y TRAMA sólo conservan métricas y el vínculo entre
tareas; nunca el feedback, prompts, respuestas ni argumentos de herramientas.

`Approve` conserva el parche y el worktree aislados para que el director valide
sin modificar el proyecto. Sólo `Complete -ValidationPassed $true` vuelve a
comprobar la evidencia, aplica el parche y limpia los recursos. Una validación
fallida solicita otra corrección. Al agotar los tres intentos, la tarea queda
`blocked` con `correction-attempts-exhausted`; no se rechaza ni crea un cuarto hijo.

## Actualización de TRAMA

Los cambios de estado de Hermes llegan por `fs.watch`, con debounce de 150 ms y
un sondeo exclusivo del broker. GPU, Docker, WSL, Graphify, LM Studio y red se
sondean juntos cada 15 segundos. SSE envía heartbeats baratos entre eventos y no
repite sondeos costosos.

## Uso por tarea

Antes de eliminar el `HERMES_HOME` efímero, el worker ejecuta
`export-hermes-insights.ps1` contra ese perfil y guarda `usage.json` en el
directorio persistente de la tarea. TRAMA agrega tokens locales, costo evitado,
tareas capturadas, tasa de aceptación y fallos de esquema.
