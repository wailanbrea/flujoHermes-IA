---
name: bsolutions-mcp-integration
description: Diseñar, implementar y revisar servidores, clientes y herramientas MCP con descubrimiento progresivo, esquemas acotados, mínimo privilegio y pruebas de contrato. Usar para manifests, transportes stdio/HTTP, handlers, integración de hosts, JSON-RPC y seguridad MCP.
---

# Integración MCP

## Descubrimiento de tres niveles

1. **Servidor:** confirmar host, servidor, transporte, frontera de confianza,
   autenticación y capacidades requeridas. Decidir primero si basta una skill,
   CLI o API existente.
2. **Catálogo:** inspeccionar sólo nombres y descripciones de herramientas del
   servidor elegido.
3. **Esquema:** cargar el esquema exacto únicamente de la herramienta seleccionada.

No exponer catálogos completos al modelo. Medir el costo de contexto de los
esquemas y mantener superficies pequeñas por rol.

## Implementación segura

1. Definir nombres estables, campos requeridos, límites explícitos y rechazo de
   entradas desconocidas. Tratar todo argumento del modelo como no confiable.
2. Separar protocolo, transporte, servicios de dominio, credenciales y registro
   del host para probarlos de forma independiente.
3. Aplicar mínimo privilegio, filtrar variables heredadas, redactar secretos y
   limitar filesystem, red y efectos externos.
4. Hacer operaciones cancelables, con timeout e idempotentes cuando haya reintentos.
5. Manejar initialize/shutdown, negociación, desconexiones, respuestas parciales,
   JSON-RPC inválido y dependencias ausentes.
6. Devolver errores estructurados sin stacks, tokens, rutas privadas ni payloads
   upstream completos.

## Verificación

Agregar pruebas de contrato, casos negativos de entrada/autorización, integración
del transporte sin credenciales productivas y smoke test del host. Reportar
capacidades y evidencia sin secretos.

No adoptar el daemon experimental Agentic-MCP, registros externos, instaladores
remotos ni plugins globales sin evaluación y autorización separadas.
