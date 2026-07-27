# Benchmarks de modelos locales

Fecha: 27 de julio de 2026. No se descargaron modelos.

| Modelo | Contexto probado | Chat nativo | Estructurado | Herramientas | Decisión |
|---|---:|---:|---|---|---|
| Qwen3.6 27B Q3_K_S | 22.016 | 14,24 tok/s; TTFT 0,417 s | Falló por consumir el límite en razonamiento | Falló | Solo chat |
| Qwen3.6 35B-A3B Q4_K_M | 22.016 | 27,58 tok/s; TTFT 0,358 s | Correcto con ≥384 tokens | Correcto | Seleccionado |
| Qwen3.6 35B-A3B Q4_K_M | 65.536 | Hermes completo | Correcto | Correcto | Configuración final |

## Hallazgos

- `reasoning_effort=none` evita que LM Studio consuma la salida completa en
  razonamiento oculto.
- El modo JIT de LM Studio cargó 262.144 tokens y paralelo 4, dejando 1,54 GiB
  libres. Se descartó por riesgo de presión de memoria.
- La carga explícita de Hermes respeta 65.536 tokens, pero usa paralelo 4 si el
  modelo no está preparado.
- El wrapper local impone paralelo 1 y dejó aproximadamente 13 GiB libres.
- La prueba de Hermes utiliza unas 17,3K fichas de entrada porque carga reglas,
  herramientas y contexto de agente. Esto es significativamente más pesado que
  una llamada de chat directa.

## Evidencia

Los informes de uso se encuentran en `reports/models/`. No contienen prompts,
respuestas ni credenciales.
