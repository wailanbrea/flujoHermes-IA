# Evaluación de seguridad inicial

## Hallazgos

1. LM Studio y Ollama están limitados a loopback: configuración correcta.
2. MariaDB escucha en `::`: puede aceptar conexiones más allá de loopback según
   firewall y configuración. Debe corregirse o aislarse antes del piloto.
3. El dashboard nativo de Hermes administra configuración, claves y sesiones. Debe
   mantenerse en `127.0.0.1` y no incrustar secretos en el dashboard unificado.
4. Nueve repositorios existentes tienen cambios sin confirmar; quedan expresamente
   fuera del alcance para evitar mezclar o perder trabajo.

## Política de telemetría

Por defecto sólo se permiten identificadores opacos, tipo de componente, estado,
latencia, contadores, timestamps, códigos de salida y referencias de tarea. Se
prohíben prompts, respuestas, contenido de archivos, argumentos de herramientas,
variables de entorno, encabezados HTTP, cookies, tokens y credenciales.
