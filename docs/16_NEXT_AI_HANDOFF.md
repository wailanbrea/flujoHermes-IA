# Handoff

## Estado

Fase 0 completada y documentada. No se modificaron proyectos existentes. El siguiente
punto es la aprobación única de la Fase 2 y fases locales relacionadas.

## Próxima acción segura

1. Obtener aprobación del usuario.
2. Consultar documentación oficial vigente para WSL, Ubuntu, LM Studio y Hermes.
3. Validar versiones y comandos antes de cualquier instalación.
4. Crear backup de configuración saneado.
5. Preparar Ubuntu LTS en WSL si el usuario mantiene esa decisión.
6. Implementar después los health checks y el dashboard local por incrementos.

## Riesgos abiertos

- MariaDB expuesta en `::`.
- No hay Ubuntu de trabajo en WSL.
- Docker daemon detenido.
- Modelos disponibles pero no benchmarkeados.
- La configuración activa de Hermes no ha sido auditada.
- Dashboard transversal aún no implementado; sólo está diseñado.
