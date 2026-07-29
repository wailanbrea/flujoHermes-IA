# Configuración de LM Studio

## Servidor

- Endpoint nativo: `http://127.0.0.1:1234/api/v1`
- Endpoint compatible con OpenAI: `http://127.0.0.1:1234/v1`
- Exposición de red: loopback únicamente
- Modelos descargados durante esta fase: ninguno

## Modelo principal para Hermes

- Clave: `google/gemma-4-12b`
- Cuantización: Q4_K_M
- Contexto: 65.536
- Paralelismo: 4
- GPU offload: máximo
- MTP especulativo: desactivado
- Generación sostenida: 59,51 tokens/s (una petición); 87,5 tok/s agregados con
  3 peticiones concurrentes a paralelismo 4, frente a 58,8 a paralelismo 1
- Memoria dedicada / compartida a paralelismo 4: 11,94 / 1,16 GiB

## Build QAT (alias `gemma-qat`)

- Clave: `google/gemma-4-12b-qat`
- Cuantización: Q4_0, entrenada para cuantizar (QAT), no post-training
- Contexto: 65.536
- Paralelismo: 4
- GPU offload: máximo
- MTP especulativo: desactivado
- Generación sostenida: ~60 tokens/s, equivalente al build principal
- Tamaño en disco: 6,66 GiB (frente a 7,04 GiB del Q4_K_M principal)

## Modelo fallback

- Clave: `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive`
- Cuantización: Q4_K_M
- Contexto: 65.536
- Paralelismo: 4
- GPU offload: 0.50
- MTP especulativo: desactivado
- Razonamiento de API: `reasoning_effort=none`
- Generación sostenida: 25,81 tokens/s
- Memoria dedicada / compartida a paralelismo 4: 14,34 / 1,16 GiB

El contexto de 64K no es opcional: Hermes rechaza ventanas inferiores. Qwen no
debe cargarse con 0.70: ese valor elevó la memoria compartida a 2,96 GiB; 0.55
y 0.60 alcanzaron 1,20 GiB.

El paralelismo subió de 1 a 4 tras medirlo: a paralelismo 1 costaba 10,99 GiB
dedicados en gemma y 14,21 GiB en qwen; a paralelismo 4 sube a 11,94 y 14,34
GiB respectivamente (+0,95 y +0,13 GiB), dejando margen en la tarjeta de 16
GiB en ambos casos. Con una sola petición en curso el paralelismo no cambia el
rendimiento (58,8-61,3 tok/s, dentro del ruido de una ejecución a otra); el
beneficio aparece sólo cuando el orquestador tiene más de una tarea Hermes
activa contra el mismo modelo cargado, caso en el que 3 peticiones
concurrentes pasan de 58,8 a 87,5 tok/s agregados.

## Preset

El preset `Laravel y kotlin Promt` conserva sus instrucciones especializadas e
incluye una sección condicional con las reglas de
`config/hermes-operating-prompt.md`. Los clientes OpenAI API no reciben presets
visuales automáticamente; por eso `invoke-hermes-task.ps1` antepone también el
prompt versionado a cada contrato.

## Comprobación

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\health\check-lm-studio.ps1
```