# Análisis de Brechas (Gap Analysis) — Master Prompt vs Estado Actual

## 1. Brechas de Arquitectura y Enrutamiento

| Requerimiento del Master Prompt | Estado Actual | Brecha / Solución |
|---|---|---|
| **Eliminar OpenClaw del flujo activo** | Existe `config/openclaw-gateway.json` | Deshabilitar OpenClaw completamente. Todo el tráfico de Telegram debe ir hacia **Hermes Gateway**. |
| **Modelos de 3 niveles** (Gemma 4 -> Agents-A1 -> Qwen3.6) | `prepare-hermes-model.ps1` solo mapea `gemma` y `qwen`. | Falta agregar el mapeo explícito de `agents-a1` (`agents-a1-4b`) como modelo programador principal. |
| **Configuraciones YAML centralizadas** (`config/models.yaml`, `config/routing.yaml`, `config/limits.yaml`) | Solo existen archivos `.example.yaml` o configuraciones dispersas en PowerShell. | Crear `config/models.yaml`, `config/routing.yaml`, `config/limits.yaml`, `config/security.yaml`. |
| **Gestor de VRAM y Carga/Descarga** | `prepare-hermes-model.ps1` descarga modelos en conflicto en LM Studio, pero falta cola de VRAM formal y reintentos. | Reforzar `prepare-hermes-model.ps1` para asegurar descarga de Gemma/Qwen antes de cargar Agents-A1 y viceversa. |

---

## 2. Brechas de Gobernanza y Validación

| Requerimiento del Master Prompt | Estado Actual | Brecha / Solución |
|---|---|---|
| **Cálculo Determinista de Validación (Sin Parámetros Manuales)** | `review-hermes-task.ps1` aceptaba `-ValidationPassed $true`. | Eliminar el parámetro `-ValidationPassed $true`. La validación debe calcularse internamente tras la ejecución de linters y tests. |
| **Separación Estricta: Validar ≠ Aprobar ≠ Aplicar** | Se ejecutaba todo en secuencias concatenadas en `review-hermes-task.ps1`. | Separar en scripts individuales: `validate-hermes-task.ps1`, `approve-hermes-task.ps1`, `promote-hermes-task.ps1`, `final-verify-hermes-task.ps1`. |
| **Máquina de Estados Formal de 16 Estados** (`RECEIVED` ➔ `CLOSED`) | Máquina de estados parcial en `hermes-task-common.ps1`. | Implementar transiciones append-only validadas e inmutables con historial de auditoría. |
| **Patch Gate y Reglas de Límites de Parche** | Límites parciales de líneas diff. | Implementar control de `PatchPolicy` (max 6 archivos, max 450 líneas añadidas, max 150 eliminadas, prohibición de `.env`, binarios o cambio de frameworks sin contrato). |

---

## 3. Brechas de Prompts y Protocolos

| Requerimiento del Master Prompt | Estado Actual | Brecha / Solución |
|---|---|---|
| **Prompt Especializado `prompts/agents-a1-programmer.md`** | No existe el archivo de prompt de sandbox para Agents-A1. | Crear `prompts/agents-a1-programmer.md` con las reglas obligatorias de ejecución en sandbox. |
| **Protocolo contra Bucles (Max 2 intentos mismo error, 3 totales)** | Lógica de reintentos genérica. | Formalizar el protocolo de 3 intentos y generación de `blocker-report.md` en estado `BLOCKED`. |
| **TRAMA como Observador Solo Lectura** | TRAMA dashboard en puerto 4310/4311 es de solo lectura. | Mantener arquitectura de observabilidad estricta de solo lectura. |
