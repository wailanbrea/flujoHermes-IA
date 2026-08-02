# Reglas globales

1. Una tarea verificable por vez.
2. Recuperación selectiva de archivos; nunca cargar repositorios completos.
3. Excluir dependencias, binarios, builds, logs grandes y backups.
4. Avisar al 75 % del contexto, compactar aproximadamente al 80 % y producir handoff
   antes del 90 %.
5. Registrar objetivo, alcance, comandos, resultado real, evidencia, riesgos y estado.
6. Detener una causa tras tres intentos fallidos y actualizar `docs/BLOCKER_REPORT.md`.
7. Mantener separación entre orquestación, inferencia, herramientas, validación y
   observabilidad.
8. Codex, Claude Code, Antigravity y OpenCode deben seguir
   `config/agent-governance.md`: Graphify primero, Hermes para la ejecución pesada y
   revisión independiente antes de integrar.
9. REGLA DE RECUPERACIÓN OBLIGATORIA: Cuando el usuario pregunte si recuerdas, creaste, trabajaste, modificaste, investigaste o hablaste sobre algo anteriormente: (1) No responder basándote únicamente en el contexto activo; (2) Consultar el registro de proyectos; (3) Consultar el registro de tareas; (4) Ejecutar session_search con al menos dos variantes relevantes; (5) Consultar la memoria persistente; (6) Consultar Graphify si se trata de un proyecto de código; (7) Verificar la existencia de la ruta o repositorio; (8) Indicar las fuentes encontradas; (9) Solo decir que no existe registro después de completar todas las búsquedas; (10) No ofrecer comenzar desde cero hasta comprobar que el trabajo anterior realmente no existe.
10. REGLA DE AUTOMATIZACIÓN DE NAVEGADOR Y PLAYWRIGHT: Cuando el usuario solicite abrir el navegador o usar Playwright, no dar excusas de entorno ni sugerir alternativas de Python/computer_use. Usar la skill `bsolutions-playwright` o ejecutar scripts con Playwright directamente (`npx playwright` / `python -m playwright`), extraer la información y entregar la respuesta estructurada.
11. REGLA DE ACCIÓN DIRECTA SIN META-RESPUESTAS EXCUSATORIAS: Realizar las acciones requeridas (Playwright, scraping, búsquedas, pruebas) de forma autónoma con las herramientas disponibles sin emitir meta-respuestas explicativas sobre herramientas no encontradas literalmente.
12. REGLA DE PRESUPUESTO DE TOKENS (IA LOCAL VS. IA CLOUD): El sistema de atomización profunda en 16 etapas (`RECEIVED` ➔ `DELIVERED`), DAG de tareas `T-001..T-025` y Repair Loop aplica únicamente a la IA Local (Hermes Brain / VRAM Local). Para IAs Cloud (Codex, Claude, Antigravity, OpenCode), aplicar un flujo directo y optimizado de 3 a 5 fases para preservar cuotas, reducir contexto y ahorrar costo de tokens en APIs cloud.
13. REGLA DE USO AUTÓNOMO Y ONBOARDING DE GRAPHIFY: Prohibido decir que "no existe portal web" (el Dashboard oficial corre en http://127.0.0.1:4310) o afirmar que un proyecto está "vacío" sin consultar `telemetry/runtime/project-catalog.json` (donde apps como `CalculadoraParley Web` ya poseen 302 nodos y 559 relaciones). Al solicitar el grafo: (1) Si la app está en el catálogo, dar la URL `http://127.0.0.1:4310` e informar los nodos directamente sin preguntas; (2) Si la app NO está en el catálogo, preguntar concisamente: "La aplicación [Nombre] aún no está incluida en el catálogo local de Graphify. ¿Deseas que la incluya e indexe ahora mismo?".
