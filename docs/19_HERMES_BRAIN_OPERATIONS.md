# Hermes Brain — guía de operación

## Arquitectura

Hermes Brain es el operador local controlado y el plano de control persistente.
Puede responder, investigar, gestionar memoria, crear skills validadas y
coordinar tareas. Graphify recupera contexto, los perfiles expertos asesoran,
todo cambio de proyecto se realiza en un worktree aislado y la puerta de
evidencia integra una sola vez.

La IA local puede operar herramientas, pero nunca escribe directamente en el
checkout fuente ni convierte una conversación en aprendizaje confiable.

## Uso interactivo

El perfil normal `default` y el perfil aislado `hermesbrain` operan bajo los
mismos límites. El comando simple usa `default`; el perfil aislado se selecciona
de forma explícita:

```powershell
hermes
hermes chat
hermes --profile hermesbrain chat
```

Capacidades habilitadas: web, navegador, archivos, terminal, ejecución de código,
visión, generación de imágenes, memoria, búsqueda de sesiones, contexto, skills,
planificación y delegación. Las aprobaciones peligrosas permanecen activas.

Para modificar un repositorio desde una sesión iniciada manualmente:

```powershell
hermes --profile hermesbrain chat --worktree --checkpoints
```

No usar `--yolo` ni `--oneshot`. Para investigación, exigir fuentes actuales.
Para crear una skill, validar su estructura antes de adoptarla y requerir
aprobación separada antes de publicarla o instalarla externamente.

## Perfiles especializados

Usar el perfil más estrecho que cubra la tarea:

```powershell
techlead chat          # descomponer y enrutar en Kanban
android chat           # Kotlin, Compose y Gradle
laravel chat           # PHP, Laravel, APIs y MySQL
frontend chat          # TypeScript, React y pruebas web
mcpagent chat          # servidores, clientes y herramientas MCP
researchexpert chat    # investigación técnica read-only
personalfinanceexpert chat # presupuesto, deuda, ahorro e inversión educativa
browseroperator chat   # validación local/test mediante navegador
quality chat           # revisión independiente
```

Los aliases existentes se conservan. `techlead` nunca implementa; los perfiles
de implementación trabajan sólo en worktrees gestionados; los revisores no
reciben terminal y su escritura de archivos está confinada a scratch.

`personalfinanceexpert` es educativo y de solo lectura. Confirma jurisdicción y
moneda, usa fuentes oficiales actuales, muestra cálculos y supuestos, y nunca
opera cuentas, recibe credenciales, garantiza rendimientos ni sustituye asesoría
financiera, fiscal o legal licenciada.

## Flujo de una modificación

```powershell
$sandbox = scripts/windows/new-hermes-sandbox.ps1 `
  -ProjectPath C:\ruta\proyecto `
  -Objective 'Objetivo concreto de al menos diez caracteres.' `
  -AcceptanceCriteria @('Criterio verificable.') `
  -AllowedFiles @('ruta/relativa.php') |
  ConvertFrom-Json

# El director edita exclusivamente $sandbox.sandboxPath.

scripts/windows/seal-hermes-task.ps1 -TaskId $sandbox.taskId
scripts/windows/review-hermes-task.ps1 `
  -TaskId $sandbox.taskId -Decision Approve

# Ejecutar parser, tests, build o Playwright dentro del sandbox.

scripts/windows/review-hermes-task.ps1 `
  -TaskId $sandbox.taskId `
  -Decision Complete `
  -ValidationPassed $true `
  -ValidationSummary 'Parser, tests y build pasaron.'
```

Si una prueba falla:

```powershell
scripts/windows/review-hermes-task.ps1 `
  -TaskId $sandbox.taskId `
  -Decision Complete `
  -ValidationPassed $false `
  -ValidationSummary 'La prueba de integración falló.' `
  -CorrectionFeedback 'Código de fallo concreto sin secretos.'
```

La misma tarea y el mismo worktree regresan a `editing`.

## Configuración

- Brain: `config/hermes-brain.json`
- Skills: `skills/hermes-*/SKILL.md`
- Runtime saneado: `telemetry/runtime/hermes-brain-status.json`
- Lecciones: `telemetry/runtime/hermes-learning/*.json`
- Dashboard: `http://127.0.0.1:4310`
- API: `http://127.0.0.1:4311/api/status`

Sincronizar perfiles, skills e inventario:

```powershell
scripts/windows/sync-hermes-brain.ps1
scripts/windows/sync-agent-governance.ps1
```

OpenCode debe reiniciarse después de actualizar sus reglas globales.

## Inspección

```powershell
hermes profile list
hermes profile show hermesbrain
hermes skills list
hermes kanban assignees
hermes kanban boards list
hermes kanban list
hermes kanban stats
hermes curator status
hermes curator usage
hermes curator list-unmanaged
hermes moa list
```

Kanban permanece en descomposición manual. Curator usa consolidación desactivada;
las skills del Brain están versionadas y se sincronizan desde este repositorio.
Hermes sólo admite IDs de perfil alfanuméricos; los nombres públicos con guiones
se mapean mediante `runtimeId` en `config/hermes-brain.json`.
Antes de una operación de Curator:

```powershell
hermes curator backup
hermes curator run --dry-run
```

Restaurar el backup más reciente:

```powershell
hermes curator rollback
```

## Validación

```powershell
$env:PYTHONPATH = "$PWD\src"
py -3 -m unittest discover -s tests
scripts/windows/test-hermes-lifecycle.ps1
Push-Location dashboard
npm run lint
npm test
Pop-Location
git diff --check
```
