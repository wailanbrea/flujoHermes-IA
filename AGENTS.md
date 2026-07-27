# AGENTS.md

## Alcance autorizado

La ruta autorizada inicialmente es `C:\AI-Workspace\local-ai-orchestrator`.
No se permite modificar proyectos reales, archivos `.env`, credenciales, claves SSH,
configuración de producción ni bases de datos existentes.

## Flujo obligatorio

Inspeccionar, planificar, ejecutar un cambio pequeño, verificar, registrar y crear un
checkpoint. El compilador, las pruebas, los linters, el análisis estático y el diff de
Git son la autoridad; una respuesta de IA nunca es evidencia suficiente.

## Seguridad

- No usar modos equivalentes a `--yolo`.
- No ejecutar acciones destructivas.
- Máximo tres intentos razonados por una misma causa.
- Redactar tokens, prompts, rutas personales y secretos en logs y telemetría.
- Solicitar aprobación para privilegios, reinicios, instalaciones globales, cambios de
  puertos, acceso externo, credenciales o modificación de proyectos reales.

## Git

Cambios pequeños y cohesivos, revisión del diff antes del commit, sin force push ni
eliminación de historial. No versionar telemetría en vivo, secretos, backups ni
artefactos generados.

## Dashboard

El dashboard es una vista de observabilidad, no una autoridad de ejecución. Debe
mostrar la procedencia y antigüedad de cada dato, distinguir `healthy`, `degraded`,
`offline` y `unknown`, y no mostrar contenido de prompts, respuestas ni argumentos de
herramientas salvo que se habilite una captura saneada explícita.
