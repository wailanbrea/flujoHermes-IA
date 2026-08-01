# Especificación de Enrutamiento de Modelos y VRAM

## 1. Niveles de Modelos en LM Studio (`127.0.0.1:1234`)
- **Nivel 1: Clasificador / Bajo Riesgo (`google/gemma-4-12b-qat`)**:
  Clasifica solicitudes, genera contexto, analiza diffs sencillos (<= 5 archivos, <= 250 líneas).
- **Nivel 2: Programador Principal (`agents-a1-4b`)**:
  Modelo base de programación para tareas complejas en Laravel, Kotlin, React, MySQL.
- **Nivel 3: Escalamiento (`qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive`)**:
  Se activa ante 2 fallos consecutivos del Quality Gate o tareas de arquitectura compleja.

## 2. Gestión de VRAM y Carga/Descarga
- La GPU AMD Radeon RX 9070 (16 GB VRAM) ejecuta un solo modelo grande a la vez.
- `prepare-hermes-model.ps1` descarga modelos en conflicto antes de cargar el objetivo con `lms.exe load`.
