---
name: hermes-memory-retrieval
description: Recuperar contexto estructural acotado mediante Graphify antes de navegar un proyecto. Usar para localizar arquitectura, archivos, símbolos, relaciones, rutas o casos anteriores sin recorridos amplios.
---

# Hermes Memory Retrieval

1. Consultar `telemetry/runtime/project-catalog.json`.
2. Ejecutar `scripts/windows/ensure-project-graph.ps1` con pregunta concreta.
3. Usar `graphify query`, `path` o `explain`.
4. Leer archivos exactos sólo cuando el subgrafo sea insuficiente.
5. Refrescar el grafo después de una integración validada.

Salida: nodos, relaciones y ubicaciones pertinentes; no volcados completos.

Éxito: la navegación queda acotada y no expone archivos sensibles.

No usar búsquedas brutas como sustituto del grafo ni incorporar automáticamente
corpus mayores de 500 archivos o dos millones de palabras.
