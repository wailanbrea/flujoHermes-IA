---
name: hermes-model-router
description: Enrutar una necesidad por capacidad entre reglas deterministas, director cloud, expertos cloud o IA local opcional. Usar para clasificación, resumen, arquitectura, programación, seguridad, testing e integración.
---

# Hermes Model Router

Leer `config/hermes-brain.json` y seleccionar capacidad, no identidad.

- Clasificación o resumen saneado: local opcional, máximo 45 segundos.
- Arquitectura o seguridad compleja: especialista cloud.
- Programación: director cloud.
- Testing e integración: scripts deterministas.
- Qwen: sólo selección manual para análisis no crítico.

Si la IA local falla, continuar con el director. No iniciar LM Studio para crear
un sandbox y no entregar herramientas de escritura a un modelo local.

Éxito: la ruta queda registrada sin credenciales y no bloquea el camino crítico.

No usar el router para aprobar evidencia o promover skills.
