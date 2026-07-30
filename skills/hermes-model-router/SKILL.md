---
name: hermes-model-router
description: Enrutar solicitudes entre perfiles Hermes locales con reglas deterministas, Graphify y contexto mínimo. Usar para elegir coordinación, implementación, investigación, navegador o revisión sin mezclar proyectos ni llamar servicios externos desde Hermes.
---

# Hermes Model Router

Aplicar esta precedencia:

1. Resolver proyecto y stack mediante catálogo y Graphify.
2. Preferir comandos deterministas para inventario, estado, diff y pruebas.
3. Usar `techlead` para especificación y Kanban, sin implementación.
4. Elegir exactamente un implementador: `android`, `laravel`, `frontend` o `mcp`.
5. Usar `researchexpert` para hechos actuales y `browseroperator` para UI.
6. Elegir revisores read-only y Evidence Gate según riesgo.
7. Usar `clasificador` sólo cuando las reglas anteriores no decidan.

Seleccionar primero el perfil y después, por metadatos, como máximo cinco cuerpos
de skills. No mezclar skills MCP o agentes de proyectos distintos cuando el
catálogo identifica una raíz.

No usar MoA, OpenRouter ni fallback externo desde Hermes. Si la capacidad local
es insuficiente, devolver el control al director con evidencia del bloqueo. No
enviar secretos, aprobar evidencia ni promover skills desde el router.
