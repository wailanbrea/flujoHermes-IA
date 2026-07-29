# Local AI Orchestrator

Entorno aislado para operar una cadena local dirigida por Codex, Claude Code,
Google Antigravity u OpenCode, con Hermes Agent, Graphify, LM Studio, WSL2, Docker
y el dashboard privado TRAMA.

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

Resolver un proyecto sin leer el catálogo entero:

```powershell
.\scripts\windows\resolve-project.ps1 -Name factur -OwnGitOnly
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
  -AllowedFiles @("<ruta/relativa.ts>") `
  -RequestedBy Codex `
  -Mode execute `
  -ModificationAuthorized | ConvertFrom-Json

# Una sola llamada bloqueante; devuelve el resumen acotado al terminar.
# Repetir la misma llamada si aún sigue en marcha.
.\scripts\windows\wait-hermes-task.ps1 -TaskId $task.taskId

# El director decide sobre ese resumen: veredicto, violaciones de política,
# líneas por archivo y cabeceras de hunk. changes.patch completo sólo si hace falta.
.\scripts\windows\review-hermes-task.ps1 `
  -TaskId $task.taskId `
  -Decision Approve `
  -ReviewedBy Codex

# Después de pruebas independientes:
.\scripts\windows\review-hermes-task.ps1 `
  -TaskId $task.taskId `
  -Decision Complete `
  -ReviewedBy Codex `
  -ValidationPassed $true `
  -ValidationSummary "build, lint y pruebas aprobadas"
```

TRAMA muestra la cola, ejecución de Hermes, parche aislado y puerta de revisión,
pero no expone el objetivo, las respuestas del modelo ni argumentos de herramientas.

Sincronizar la política global para Claude Code, Antigravity y OpenCode:

```powershell
.\scripts\windows\sync-agent-governance.ps1
```

Claude usa `~/.claude/CLAUDE.md`; Antigravity usa `~/.gemini/GEMINI.md`; OpenCode
usa `~/.config/opencode/AGENTS.md`. Los tres reciben la misma política canónica de
`config/agent-governance.md` y deben identificarse con `-RequestedBy` y
`-ReviewedBy`.

OpenCode carga además la política desde `opencode.json`: la edición directa está
denegada y terminal, rutas externas y web requieren aprobación. Esto no cambia el
modelo, proveedor ni MCP seleccionados en OpenCode.

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
