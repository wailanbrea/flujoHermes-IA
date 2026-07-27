# Graphify integrado y Graphiti diferido

## Graphify

Graphify está integrado como grafo estructural local de código y documentación:

- skill registrada en Codex;
- skill habilitada en el perfil `localai` de Hermes;
- regla de consulta prioritaria añadida a `AGENTS.md`;
- hook de Codex y hooks Git para mantener el grafo actualizado;
- grafo del orquestador aislado en `graphify-out/`;
- grafo global con `omnipos-modular-saas` y `local-ai-orchestrator`;
- métricas del grafo expuestas en modo solo lectura al dashboard TRAMA.
- incorporación automática de proyectos ausentes mediante
  `scripts/windows/ensure-project-graph.ps1`.

El dashboard muestra nombres de repositorios, cantidades, estado y procedencia. No
expone contenido de archivos, consultas, prompts ni resultados del modelo.

La incorporación automática consulta primero el registro global. Si el proyecto ya
existe, no vuelve a detectar ni recorrer el corpus. Si falta, ejecuta una extracción
AST local, omite archivos sensibles y registra el resultado globalmente. El límite
predeterminado de consulta es 1.200 tokens.

La extracción estructural usa parsing local y no necesita un LLM. El enriquecimiento
semántico no está habilitado porque el módulo opcional `graphifyy[openai]` no forma
parte de la instalación actual.

## Medición inicial

El benchmark del grafo del orquestador obtuvo:

- corpus estimado: 29.800 tokens;
- consulta media: aproximadamente 583 tokens;
- reducción estimada: 51,1 veces frente a leer el corpus completo.

Esta cifra aplica al corpus medido; no debe generalizarse a todos los proyectos.

## Graphiti

Graphiti es otra tecnología: memoria temporal con servicio y base de datos. Sigue
diferida porque añade persistencia, migraciones, permisos, respaldo, retención y
riesgos de privacidad que Graphify no necesita para navegación estructural.

Solo debe reconsiderarse cuando exista una necesidad medible de memoria temporal
entre proyectos y un modelo aprobado de retención, eliminación y acceso.
