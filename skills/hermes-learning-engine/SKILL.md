---
name: hermes-learning-engine
description: Registrar y promover aprendizaje saneado derivado de resultados validados. Usar después de una integración completada, al crear una lección candidata o al evaluar su benchmark y aprobación.
---

# Hermes Learning Engine

Ejecutar `scripts/windows/record-hermes-learning.ps1` sólo cuando la tarea esté
`completed` y `validationPassed=true`.

Registrar dominio, patrón, causa raíz, solución resumida, comandos aprobados,
rutas relativas, métricas, skill relacionada y benchmark.

No registrar prompts, respuestas, código completo, argumentos de herramientas,
credenciales, rutas absolutas ni IDs de sesión.

Promover únicamente con:

`candidate → benchmark aprobado → validated → aprobación explícita → promoted`

Éxito: la lección es reproducible, pequeña y trazable a evidencia sellada.

No usar una respuesta de modelo como evidencia de aprendizaje.
