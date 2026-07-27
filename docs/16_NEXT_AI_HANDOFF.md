# Handoff para la siguiente IA

## Estado actual

El entorno local está operativo. Dashboard TRAMA: `http://127.0.0.1:4310`.
LM Studio: `127.0.0.1:1234`. Hermes usa exclusivamente el perfil `localai`.
Docker, WSL2, Apache y MariaDB responden en la última validación.

## Reglas innegociables

- No usar Hermes con `--oneshot`, `-z` ni `--yolo`.
- No iniciar Hermes sin `scripts/windows/start-hermes-local.ps1`.
- No autorizar rutas fuera de este workspace sin decisión explícita del usuario.
- No modificar proyectos XAMPP existentes.
- Validar siempre con pruebas, diff y linters; nunca confiar solo en el resumen del modelo.

## Próximo paso recomendado

Elegir un proyecto real mediante el procedimiento de `docs/15_PROJECT_ONBOARDING.md`,
crear un contrato de una sola tarea y autorizar únicamente su ruta. Mantener Git,
checkpoint Hermes y pruebas como tres capas separadas.

## Validación rápida

```powershell
.\scripts\health\check-all.ps1
.\scripts\windows\status-dashboard.ps1
C:\xampp\php\php.exe examples\task-packages\pilot-php\tests\run.php
```

## Riesgos abiertos

Consultar `docs/BLOCKER_REPORT.md` y `reports/tests/hermes-validation.md`.
