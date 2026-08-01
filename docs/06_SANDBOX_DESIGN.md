# Diseño del Sandbox de Ejecución Aislada

## 1. Aislamiento por Worktree
- `new-hermes-sandbox.ps1` crea un Git worktree independiente dentro de `sandboxes/`.
- La ejecución del modelo ocurre 100% dentro del directorio temporal del sandbox.
- No se copian claves ni `.env` de producción.

## 2. Puntos de Control y Baseline
- Antes de realizar cualquier edición, el sandbox ejecuta las pruebas baseline y genera un checkpoint.
- Si un intento falla, el estado se revierte al checkpoint inicial.
