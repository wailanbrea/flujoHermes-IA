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
## Comparación sostenida para Hermes (28 de julio de 2026)

| Rol | Modelo | GPU | Generación sostenida | Compute medio / pico | VRAM dedicada / compartida | Agente completo |
|---|---|---:|---:|---:|---:|---:|
| Principal | Gemma 4 12B Q4_K_M | máximo | 59,51 tok/s | 67,3% / 91,3% | 11,02 / 0,39 GiB | PASS en 8,91 s |
| Fallback | Qwen3.6 35B-A3B Q4_K_M | 0.50 | 25,81 tok/s | 11,0% / 12,6% | 14,13 / 0,40 GiB | PASS en 15,68 s |

Ambos modelos se probaron con 65.536 tokens, paralelo 1 y MTP desactivado.
Gemma queda como principal por rendimiento, menor memoria y mejor tiempo de agente.
Qwen queda como fallback con offload 0.50; valores mayores aumentaron la memoria
compartida a 1,20 GiB (0.55/0.60) y 2,96 GiB (0.70) sin justificar el riesgo.
La evidencia estructurada está en
`reports/models/hermes-model-comparison.json`.