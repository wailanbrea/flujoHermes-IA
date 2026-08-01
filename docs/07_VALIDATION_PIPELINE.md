# Pipeline de Validación Determinista

## 1. Regla de Validación Determinista
- No existen parámetros de bypass manual (`-ValidationPassed $true`).
- El valor de `validationPassed` se calcula ejecutando de forma determinista la suite de Quality Gates (Pint, PHPStan, PHPUnit, ktlint, detekt, ESLint, Playwright).

## 2. Separación Estricta de Fases
- `validate-hermes-task.ps1`: Ejecuta los Quality Gates y genera la evidencia inmutable.
- `approve-hermes-task.ps1`: Registra la decisión del aprobador sobre la tarea validada.
- `promote-hermes-task.ps1`: Aplica el parche sellado a la rama de integración.
- `final-verify-hermes-task.ps1`: Realiza la comprobación final post-integración y cierra la tarea (`closed`).
