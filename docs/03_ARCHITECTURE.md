# Arquitectura objetivo

```text
Usuario
  -> Codex / ChatGPT
  -> contrato de una tarea
  -> Hermes Agent (orquestación y políticas)
  -> LM Studio (API local)
  -> modelo local
  -> herramientas permitidas
  -> compiladores, linters y pruebas
  -> informe + checkpoint Git

Todos los componentes
  -> eventos saneados + health checks
  -> colector local de observabilidad
  -> dashboard local en 127.0.0.1
```

## Separación de responsabilidades

- Codex diseña, instala y supervisa la infraestructura.
- Hermes ejecuta tareas acotadas y aplica controles.
- LM Studio sirve inferencia; no valida calidad.
- Las herramientas operan con mínimo privilegio.
- Los quality gates determinan el resultado técnico.
- El dashboard observa; no ejecuta acciones mutables por defecto.

La telemetría usa un contrato propio y adaptadores por componente. Esto evita acoplar
la UI a logs internos de Hermes o LM Studio y permite sustituir una herramienta sin
reescribir el dashboard.
