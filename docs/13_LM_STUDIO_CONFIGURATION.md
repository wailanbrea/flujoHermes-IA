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
- Paralelismo: 1
- GPU offload: máximo
- MTP especulativo: desactivado
- Generación sostenida: 59,51 tokens/s
- Memoria dedicada / compartida: 11,02 / 0,39 GiB

## Modelo fallback

- Clave: `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive`
- Cuantización: Q4_K_M
- Contexto: 65.536
- Paralelismo: 1
- GPU offload: 0.50
- MTP especulativo: desactivado
- Razonamiento de API: `reasoning_effort=none`
- Generación sostenida: 25,81 tokens/s
- Memoria dedicada / compartida: 14,13 / 0,40 GiB

El contexto de 64K no es opcional: Hermes rechaza ventanas inferiores. El
paralelismo 1 protege la memoria del equipo. Qwen no debe cargarse con 0.70:
ese valor elevó la memoria compartida a 2,96 GiB; 0.55 y 0.60 alcanzaron 1,20
GiB.

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