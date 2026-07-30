---
name: hermes-agent-factory
description: Seleccionar y enrutar perfiles Hermes por rol, modo, stack y evidencia requerida. Usar cuando una tarea necesite orquestación Kanban, implementación Android/Laravel/TypeScript/MCP, investigación, validación de navegador o revisión independiente sin mezclar responsabilidades.
---

# Hermes Agent Factory

Seleccionar únicamente perfiles definidos en `config/hermes-brain.json`:

- `techlead`: descomponer y enrutar; nunca implementar.
- `android`, `laravel`, `frontend`, `mcp`: implementar únicamente en un worktree
  gestionado y según el stack correspondiente.
- `browseroperator`: validar UI local o de pruebas mediante navegador.
- `researchexpert`: investigar fuentes primarias actuales sin editar.
- `architectureexpert`, `securityexpert`, `testingexpert`, `frontendexpert`,
  `backendexpert`, `dataexpert`, `quality`, `securitydevops`: revisar sin
  terminal ni escritura de proyecto.
- `learningcurator`: evaluar aprendizaje saneado y promoción de skills.
- `clasificador`: clasificar solicitudes cuando la ruta no sea determinista.

No asignar dos implementadores a archivos solapados. Usar `delegate_task` para
una respuesta breve que debe volver al contexto actual y Kanban cuando el trabajo
deba sobrevivir reinicios, cruzar perfiles o dejar un handoff auditable.

Dar a cada perfil el objetivo, criterios, rutas relativas y subgrafo mínimo.
Exigir hallazgos, riesgos, recomendaciones, pruebas, incertidumbre y evidencia.
Ningún perfil recibe secretos, despliega o muta bases de datos.
