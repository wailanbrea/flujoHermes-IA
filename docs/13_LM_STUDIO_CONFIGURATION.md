# Configuración de LM Studio

## Servidor

- Endpoint nativo: `http://127.0.0.1:1234/api/v1`
- Endpoint compatible con OpenAI: `http://127.0.0.1:1234/v1`
- Exposición de red: loopback únicamente
- Modelos descargados durante esta fase: ninguno

## Modelo operativo para Hermes

- Clave: `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive`
- Cuantización: Q4_K_M
- Contexto: 65.536
- Paralelismo: 1
- GPU offload: 0.6
- MTP especulativo: desactivado
- Razonamiento de API: `reasoning_effort=none`

El contexto de 64K no es opcional: Hermes rechaza ventanas inferiores. El
paralelismo 1 es una protección de memoria para este equipo.

## Modelo alternativo

`qwen3.6-27b-mtp` funciona para chat nativo (14,24 tokens/s), pero no terminó
salidas estructuradas ni llamadas de herramientas dentro de los límites
probados. No se recomienda como modelo de orquestación de Hermes.

## Comprobación

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\health\check-lm-studio.ps1
```
