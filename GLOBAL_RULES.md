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
