# Informe final de implementación

Fecha: 27 de julio de 2026

## Resumen ejecutivo

Se construyó un workspace Git aislado para IA local, sin modificar proyectos
existentes. Se instaló Ubuntu 24.04 LTS en WSL2, se validó Docker Desktop y se
configuró un perfil Hermes independiente conectado a LM Studio. No se descargaron
modelos: se eligió el Qwen3.6 35B-A3B ya disponible por su rendimiento y soporte
correcto de JSON/herramientas.

El dashboard TRAMA quedó operativo en tiempo real, limitado a loopback y sin
capturar conversaciones, archivos ni secretos. Estado general: **OPERATIVO CON
LIMITACIONES DOCUMENTADAS DE HERMES**.

## Arquitectura final

```text
Usuario
  → Codex/ChatGPT
  → contrato de una tarea
  → Hermes (perfil localai, CLI interactivo)
  → LM Studio
  → Qwen3.6 35B-A3B local
  → herramientas restringidas
  → compiladores / linters / pruebas
  → informe + Git + checkpoint
  → revisión humana
```

TRAMA observa LM Studio, Hermes, WSL2, Docker, Apache y MariaDB mediante sondeos
locales y publica snapshots SSE cada cuatro segundos.

## Configuración

| Componente | Configuración |
|---|---|
| Workspace | `C:\AI-Workspace\local-ai-orchestrator` |
| WSL | Ubuntu 24.04 LTS, WSL2, usuario `aiops` |
| Docker | Desktop 4.81.0; Engine 29.6.1 Linux |
| LM Studio | 0.4.20+1, `127.0.0.1:1234` |
| Modelo | `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive` |
| Modelo seguro | contexto 65.536, paralelo 1, GPU 0.6, MTP desactivado |
| Hermes | perfil `localai`, proveedor `lmstudio`, aprobación manual |
| Checkpoints | 20 snapshots, 500 MB total, 10 MB/archivo |
| Dashboard | `127.0.0.1:4310` |
| Telemetría | `127.0.0.1:4311`, GET/OPTIONS, CORS local |
| Skills | 9 skills `bsolutions-*` |
| MCP externos | ninguno habilitado |

MariaDB 10.4.32 y Apache ya existían en XAMPP. Android Studio, PHP, Composer,
Node.js, Git, LM Studio y Hermes también existían y se preservaron. No se accedió
a VPS, producción, credenciales ni `.env` de proyectos.

## Evidencias principales

- Benchmarks: contexto, tool calling y tarea de código: **PASS**.
- Health global: LM Studio, Hermes, WSL2 y Docker: **HEALTHY**.
- Piloto PHP: `PILOT_TESTS_OK`, exit 0.
- Checkpoint Hermes: `dbb3aba`; restore del canario: **PASS**.
- Dashboard: lint, build y 2 pruebas: **PASS**.
- Dashboard HTTP: frontend 200, asset 200, POST API 405, origen externo 403.
- Navegador: “Señal en vivo”, 6/6 servicios operativos.

La evidencia detallada está en `docs/08_TESTING_LOG.md`,
`docs/10_MODEL_BENCHMARKS.md`, `reports/models/` y `reports/tests/`.

## Uso diario

1. Iniciar el conjunto local:

   ```powershell
   .\scripts\windows\start-local-ai.ps1
   ```

2. Preparar el modelo e iniciar Hermes de forma segura:

   ```powershell
   .\scripts\windows\start-hermes-local.ps1 --cli
   ```

3. Comprobar estado:

   ```powershell
   .\scripts\health\check-all.ps1
   .\scripts\windows\status-dashboard.ps1
   ```

4. Abrir TRAMA: `http://127.0.0.1:4310`.

5. Crear una tarea copiando `templates/TASK_CONTRACT.template.yaml`; autorizar
   una sola carpeta y exigir comandos/pruebas reproducibles.

6. Invocar una skill por su nombre dentro del CLI interactivo. No usar
   `--oneshot`, `-z` ni `--yolo`.

7. Revisar `git diff`, el informe y las pruebas. El modelo no decide el PASS.

8. En Hermes, usar `/rollback`, `/rollback diff N` y `/rollback N` para revisar o
   restaurar checkpoints.

9. Detener:

   ```powershell
   .\scripts\windows\stop-local-ai.ps1
   ```

10. Para añadir un proyecto real, seguir `docs/15_PROJECT_ONBOARDING.md`, crear
    backup, rama/checkpoint y autorizar solo su ruta tras aprobación explícita.

## Problemas y pendientes

### Bloqueantes

Ninguno para uso local o para TRAMA.

### Importantes

- Hermes `--oneshot` equivale a omitir aprobaciones; el wrapper lo bloquea.
- El informe del piloto fue inconsistente y requirió corrección humana.
- La CLI Docker Linux no está montada; se usa `docker.exe` interop.
- XAMPP contiene MariaDB, no MySQL.

### Opcionales

- Evaluar un modelo secundario rápido sin descargarlo automáticamente.
- Añadir pruebas E2E de reconexión del dashboard.
- Incorporar un proyecto real solo después de autorización individual.

### Futuro

Graphiti queda solo evaluado en `docs/17_FUTURE_GRAPHITI_INTEGRATION.md`.
