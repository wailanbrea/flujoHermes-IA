# Local AI Orchestrator

Workspace aislado para operar y auditar una cadena de desarrollo local basada en
Codex, Hermes Agent, LM Studio, herramientas controladas y validación reproducible.

## Estado

La Fase 0 (auditoría de solo lectura) se completó el 27 de julio de 2026. No se
instaló software, no se cargó ningún modelo y no se modificaron proyectos existentes.

Documentos de entrada:

- `docs/00_SYSTEM_STATE.md`: estado verificado del equipo.
- `docs/01_MASTER_PLAN.md`: plan por fases y punto único de aprobación.
- `docs/18_OBSERVABILITY_DASHBOARD.md`: diseño del dashboard local solicitado.
- `reports/environment/environment-audit.md`: evidencia resumida de la auditoría.

## Límites de seguridad

- El workspace es la única ruta autorizada inicialmente.
- Los proyectos en `C:\xampp\php\www` y `C:\xampp\htdocs` son de solo lectura
  hasta que se apruebe expresamente un piloto.
- Ningún servicio de IA debe enlazarse a una interfaz pública.
- Los secretos no se almacenan en Git ni en la telemetría.
- El dashboard será de solo lectura por defecto y escuchará únicamente en loopback.
