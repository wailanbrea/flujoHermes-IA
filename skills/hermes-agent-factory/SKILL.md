---
name: hermes-agent-factory
description: Seleccionar perfiles expertos Hermes de solo lectura y coordinar briefs paralelos. Usar cuando una tarea necesite asesoría de arquitectura, seguridad, testing, frontend, backend, datos o aprendizaje sin delegar edición.
---

# Hermes Agent Factory

Seleccionar sólo los perfiles definidos en `config/hermes-brain.json`.
Mantener `kanban.auto_decompose: false`; crear o asignar consultas explícitas.

Dar a cada perfil contexto acotado, rutas relativas y evidencia de Graphify.
Exigir esta salida:

1. Hallazgos.
2. Riesgos.
3. Recomendaciones.
4. Pruebas sugeridas.
5. Incertidumbre.
6. Evidencia utilizada.

Éxito: el director recibe briefs pequeños y decide. El perfil no usa terminal,
no escribe, no aplica patches, no hace commits y no accede a secretos.

No usar para ejecutar el plan ni como fuente autoritativa del lifecycle.
