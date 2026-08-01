# Estado Actual del Sistema — Auditoría de Solo Lectura

## 1. Información General del Entorno Local

* **Sistema Operativo**: Windows 11 Pro x64 (Build 26200)
* **CPU / RAM**: AMD Ryzen 7 7800X3D (8C/16T) / 64 GB RAM (38+ GB libres)
* **GPU**: AMD Radeon RX 9070 (16 GB VRAM dedicada)
* **Runtime de Inferencia**: LM Studio 0.4.20 (`127.0.0.1:1234`)
* **Agente Base**: Hermes Agent (CLI v0.18.2) + Hermes Brain Orchestrator (`C:\AI-Workspace\local-ai-orchestrator`)
* **Panel de Observabilidad**: TRAMA Dashboard (`127.0.0.1:4310` Next.js frontend, `127.0.0.1:4311` Telemetry API SSE)

---

## 2. Inventario de Modelos en LM Studio

Mediante consulta en vivo a `http://127.0.0.1:1234/v1/models`, se verificaron los siguientes identificadores exactos:

| Identificador en LM Studio | Rol en el Sistema | Contexto | VRAM / Offload |
|---|---|---|---|
| `google/gemma-4-12b-qat` | Clasificador, Resúmenes, Cambios de Bajo Riesgo | 16,384 / 65,536 | Max (100% GPU) |
| `agents-a1-4b` | Programador Principal (Primary Coder) | 16,384 | Max (100% GPU) |
| `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive` | Escalamiento (Escalation Coder) | 24,576 | 0.50 Offload |
| `text-embedding-nomic-embed-text-v1.5` | Embeddings Locales (Graphify / Memory) | 8,192 | CPU / Shared |

---

## 3. Estado de los Componentes

### 3.1 Hermes Brain (`config/hermes-brain.json`)
* **Estado**: CORRECTO / EN REFACTORIZACIÓN
* **Detalle**: Define perfiles expertos (`hermesbrain`, `laravel`, `android`, `frontend`, `mcp`, `personalfinanceexpert`). Posee máquina de estados preliminar en `scripts/windows/hermes-task-common.ps1`.

### 3.2 Graphify / Graphiti
* **Estado**: CORRECTO
* **Detalle**: Genera grafos de conocimiento indexados en `graphify-out/`. Consultado antes de explorar repositorios a ciegas.

### 3.3 TRAMA Observabilidad (`127.0.0.1:4310` y `127.0.0.1:4311`)
* **Estado**: CORRECTO (Solo Lectura)
* **Detalle**: React 19 + TypeScript frontend en puerto 4310 y API de telemetría SSE en puerto 4311. Visualiza los pulsos de ejecución de las 10 fases en un diagrama SVG dinámico con `<animateMotion>`. No ejecuta parches ni comandos mutables.

### 3.4 OpenClaw
* **Estado**: OBSOLETO / A ELIMINAR DEL FLUJO ACTIVO
* **Detalle**: Presente en `config/openclaw-gateway.json`. Debe deshabilitarse y retirarse del flujo activo en favor de **Hermes Gateway**.

### 3.5 Scripts de Gobernanza (`scripts/windows/`)
* **Estado**: PARCIAL
* **Detalle**:
  * `new-hermes-sandbox.ps1`: Crea worktrees en `sandboxes/`.
  * `seal-hermes-task.ps1`: Genera parches diff y manifiestos de evidencia.
  * `prepare-hermes-model.ps1`: Soporta `gemma` y `qwen`; falta mapeo explícito para `agents-a1-4b`.
  * `review-hermes-task.ps1`: Requiere eliminar cualquier parámetro de bypass manual como `-ValidationPassed $true` para forzar cálculo determinista interno.

---

## 4. Clasificación de Componentes

| Componente | Clasificación | Acción Requerida |
|---|---|---|
| `hermes-task-common.ps1` | PARCIAL | Agregar alias `'agents-a1' => 'agents-a1-4b'` y reglas de VRAM. |
| `prepare-hermes-model.ps1` | PARCIAL | Incluir `agents-a1` en el conjunto de modelos válidos. |
| `config/routing.yaml` | FALTANTE | Crear archivo de enrutamiento formal según Master Prompt. |
| `config/models.yaml` | FALTANTE | Crear catálogo de modelos formal vinculando a LM Studio. |
| `config/limits.yaml` | FALTANTE | Crear configuración de presupuestos y límites de parches. |
| `openclaw-gateway.json` | OBSOLETO | Retirar del flujo activo de Hermes Brain. |
| `review-hermes-task.ps1` | INSEGURO | Eliminar `-ValidationPassed $true` manual y calcular resultado determinísticamente. |
| `TRAMA Dashboard` | CORRECTO | Mantener como observador de solo lectura en puertos 4310 y 4311. |
