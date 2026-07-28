# Configuración de Hermes

## Perfil aislado

- Perfil: `localai`
- Proveedor: `lmstudio`
- Modelo: `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive`
- Base URL: `http://127.0.0.1:1234/v1`
- Contexto declarado: `65536`
- Carga de LM Studio: `explicit`
- Esfuerzo de razonamiento: `none`
- Backend de terminal: `local`
- Worktrees y contratos de ejecución: `%LOCALAPPDATA%\local-ai-orchestrator`

El perfil predeterminado preexistente no fue modificado.

## Aprobaciones

- Modo: `manual`
- Tiempo de espera: 60 segundos
- Tareas programadas: denegadas
- Recarga MCP: requiere confirmación
- Comandos destructivos: requieren confirmación
- Corte por denegaciones: 3

## Checkpoints

- Activados en el perfil `localai`.
- Máximo: 20 snapshots, 500 MB totales y 10 MB por archivo.
- Almacenamiento: shadow Git propio del perfil; no altera el `.git` del proyecto.
- Validación: checkpoint `dbb3aba` y restauración de archivo canario correctos.

## Modos prohibidos

No usar `--oneshot`, `-z` ni `--yolo`. En esta versión, `--oneshot` activa
internamente `HERMES_YOLO_MODE=1` y omite aprobaciones. El wrapper local rechaza
estos argumentos antes de preparar el modelo.

## Arranque seguro

No se debe iniciar Hermes directamente después de reiniciar el equipo. El cargador
automático de LM Studio puede elegir 262K de contexto y 4 ranuras, lo que dejó
solo 1,54 GiB de RAM libre durante la prueba.

Usar siempre:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-hermes-local.ps1
```

El wrapper carga primero el modelo con 64K, paralelo 1, GPU 0.70 y MTP
desactivado. La línea base local mejoró de 23,49 a 26,85 tokens/s frente a GPU
0.60. No se aumenta más porque el GGUF ocupa 20,55 GiB y ya usa memoria
compartida además de los 16 GiB físicos de la RX 9070.

## Prueba validada

Hermes respondió `HERMES_EXPLICIT_OK` desde el perfil aislado con una llamada
local, costo externo cero y el modelo cargado a 65.536 tokens. El piloto PHP
terminó con prueba reproducible, aunque su resumen requirió corrección humana.
