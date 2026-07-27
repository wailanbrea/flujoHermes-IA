# Local AI Orchestrator

Entorno aislado para operar una cadena local basada en Codex, Hermes Agent,
Graphify, LM Studio, WSL2, Docker y el dashboard privado TRAMA.

## Estado

Configuración validada el 27 de julio de 2026:

- Ubuntu 24.04 LTS en WSL2 con usuario `aiops` sin privilegios.
- Docker Desktop con motor Linux y acceso desde WSL mediante `docker.exe`.
- LM Studio limitado a `127.0.0.1:1234`.
- Hermes con perfil aislado `localai`, aprobaciones manuales y escritura limitada.
- Graphify integrado en Codex y Hermes, con dos proyectos en el grafo global.
- Dashboard TRAMA en `http://127.0.0.1:4310` y API de solo lectura en
  `http://127.0.0.1:4311`.

## Uso diario

Iniciar el dashboard:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-dashboard.ps1
```

Preparar el modelo e iniciar Hermes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-hermes-local.ps1
```

Consultar primero el grafo:

```powershell
graphify query "¿cómo se conecta la telemetría con el dashboard?"
```

Incorporar o consultar automáticamente un proyecto:

```powershell
.\scripts\windows\ensure-project-graph.ps1 `
  -ProjectPath <ruta-exacta> `
  -Question "<indicación resumida>"
```

Delegar una implementación pesada a Hermes:

```powershell
$task = .\scripts\windows\submit-hermes-task.ps1 `
  -ProjectPath <ruta-git-exacta> `
  -Objective "<cambio solicitado>" `
  -AcceptanceCriteria @("<criterio 1>", "<criterio 2>") `
  -Constraints @("no cambiar APIs públicas") `
  -Mode execute `
  -ModificationAuthorized `
  -Wait | ConvertFrom-Json

# Codex revisa telemetry\runtime\hermes-jobs\<taskId>\changes.patch
.\scripts\windows\review-hermes-task.ps1 `
  -TaskId $task.taskId `
  -Decision Approve

# Después de pruebas independientes:
.\scripts\windows\review-hermes-task.ps1 `
  -TaskId $task.taskId `
  -Decision Complete `
  -ValidationPassed $true `
  -ValidationSummary "build, lint y pruebas aprobadas"
```

TRAMA muestra la cola, ejecución de Hermes, parche aislado y puerta de revisión,
pero no expone el objetivo, las respuestas del modelo ni argumentos de herramientas.

Comprobar el entorno:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\health\check-all.ps1
```

## Límites de seguridad

- No se modificó el proyecto real indexado por Graphify.
- Los servicios de IA y observabilidad escuchan solo en loopback.
- El dashboard no captura prompts, respuestas, archivos ni credenciales.
- No se descargaron modelos nuevos.
- No se habilitaron integraciones externas, gateways ni mensajería en `localai`.
