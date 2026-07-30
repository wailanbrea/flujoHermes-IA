---
name: hermes-agent-factory
description: Seleccionar perfiles y skills mínimos de Hermes según raíz, stack, operación, riesgo y evidencia. Usar para construir briefs acotados, separar implementación de revisión y evitar mezclar skills o agentes de proyectos distintos.
---

# Hermes Agent Factory

## Preparar el contrato

Antes de delegar, fijar objetivo, petición original, criterios, no objetivos,
restricciones, raíz autorizada, stack, rutas permitidas, riesgos y comandos de
validación. Resolver la raíz en el catálogo y consultar Graphify.

## Seleccionar perfiles

- `techlead`: especificación y Kanban; nunca implementa.
- `android`, `laravel`, `frontend`, `mcp`: un solo implementador según el stack.
- `browseroperator`: validación de UI local o de pruebas.
- `researchexpert`: fuentes primarias actuales, sin editar.
- `architectureexpert`, `securityexpert`, `testingexpert`, `frontendexpert`,
  `backendexpert`, `dataexpert`, `quality`, `securitydevops`: revisión read-only.
- `learningcurator`: aprendizaje saneado y promoción controlada de skills.
- `clasificador`: último recurso cuando catálogo, Graphify y reglas no resuelven.

No asignar implementadores a archivos solapados. Usar Kanban sólo cuando el
trabajo deba sobrevivir reinicios, cruzar perfiles o dejar un handoff auditable.

## Seleccionar skills y delegar

1. Inspeccionar metadatos primero y cargar como máximo cinco cuerpos de skills.
2. Rechazar una skill específica de proyecto salvo que el catálogo confirme esa
   raíz activa.
3. No usar hubs, `install.sh`, `npx ...@latest`, hooks, daemons ni registros
   externos sin revisión y autorización separadas.
4. Entregar un brief con objetivo, criterios, rutas relativas, subgrafo mínimo,
   límites y evidencia requerida.
5. Exigir hallazgos, riesgos, pruebas, incertidumbre y evidencia reproducible.
6. Separar siempre implementación, revisión y aprobación.

Ningún perfil recibe secretos, despliega, muta bases de datos ni amplía su propio
alcance.
