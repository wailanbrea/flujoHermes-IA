# Hermes Brain — guía de operación

## Arquitectura

Hermes Brain es el plano de control persistente. Graphify recupera contexto,
los perfiles Hermes asesoran, un director cloud edita en un worktree aislado,
la puerta de evidencia integra una vez y Learning Engine registra únicamente
resultados validados.

La IA local no es autora y no está en el camino crítico.

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
