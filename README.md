# Local AI Orchestrator

Entorno aislado para operar una cadena local basada en Codex, Hermes Agent,
LM Studio, WSL2, Docker y un dashboard privado de observabilidad.

## Estado

Configuración validada el 27 de julio de 2026:

- Ubuntu 24.04 LTS en WSL2 con usuario `aiops` sin privilegios.
- Docker Desktop con motor Linux y acceso desde WSL mediante `docker.exe`.
- LM Studio limitado a `127.0.0.1:1234`.
- Hermes con perfil aislado `localai`, aprobaciones manuales y raíz de escritura
  limitada a este workspace.
- Dashboard TRAMA en `http://127.0.0.1:4310` y API de solo lectura en
  `http://127.0.0.1:4311`.

## Uso diario

Iniciar el dashboard:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-dashboard.ps1
```

Preparar el modelo con límites de memoria seguros e iniciar Hermes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-hermes-local.ps1
```

Comprobar el entorno:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\health\check-all.ps1
```

## Límites de seguridad

- No se modificó ningún proyecto existente en XAMPP.
- Los servicios de IA y observabilidad escuchan solo en loopback.
- El dashboard no captura prompts, respuestas, archivos ni credenciales.
- No se descargaron modelos nuevos.
- No se habilitaron integraciones externas, gateways ni mensajería en el perfil
  `localai`.
