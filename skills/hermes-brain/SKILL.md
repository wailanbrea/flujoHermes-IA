---
name: hermes-brain
description: Coordinar cambios de proyecto mediante el plano de control Hermes Brain. Usar cuando una instrucción requiera recuperar contexto, crear un sandbox, seleccionar asesores, sellar evidencia, validar e integrar con aprendizaje posterior.
---

# Hermes Brain

1. Resolver la raíz desde el catálogo local.
2. Ejecutar `scripts/windows/ensure-project-graph.ps1`.
3. Crear el worktree con `scripts/windows/new-hermes-sandbox.ps1`.
4. Entregar al director sólo task ID, sandbox y contexto saneado.
5. Sellar con `scripts/windows/seal-hermes-task.ps1`.
6. Aprobar, validar y completar mediante `review-hermes-task.ps1`.
7. Actualizar Graphify y registrar aprendizaje después de `completed`.

Entradas: raíz, objetivo, criterios, restricciones, allowlist y director.

Salida: estado de lifecycle y evidencia reproducible; nunca código generado por
Hermes.

Éxito: source limpio antes de integrar, patch hash intacto, pruebas
independientes aprobadas e integración única.

No usar para despliegues, secretos, mutaciones de base de datos ni proyectos sin
Git propio.
