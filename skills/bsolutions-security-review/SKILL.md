---
name: bsolutions-security-review
description: Revisar seguridad de aplicaciones, infraestructura y agentes locales con análisis determinista, call graph y validación adversarial. Usar sobre alcance autorizado para evaluar confianza, autorización, entradas, secretos, dependencias y blast radius sin explotar ni auto-corregir.
---

# Security Review

Requerir alcance autorizado, activos, clasificación de datos, fronteras de
confianza, contexto de despliegue, actores y diff. La revisión es read-only.

## Evidencia

1. Ejecutar pre-scan determinista sólo con scanners instalados o definidos por el
   proyecto. Tratar cada resultado como hipótesis hasta confirmarlo.
2. Construir un mapa compacto de flujo y confianza. Usar Graphify para seguir
   callers, callees, entradas, sinks y blast radius.
3. Revisar autenticación, autorización de objeto/acción, sesiones, validación,
   encoding, inyección, XSS/CSRF, SSRF, traversal, uploads, deserialización,
   comandos, carreras, límites y denegación de servicio.
4. Revisar secretos y redacción sin imprimir valores; comprobar dependencias,
   lockfiles, hooks, mínimo privilegio, egress, logging y retención.

## Tres ángulos adversariales

1. Rutas de entrada, límites ausentes y estados inesperados.
2. Explotabilidad real, precondiciones y controles compensatorios.
3. Impacto y blast radius sobre datos, servicios y consumidores.

Distinguir vulnerabilidades confirmadas de hipótesis. Reportar severidad,
confianza, evidencia, precondiciones, impacto, corrección y verificación. No
auto-corregir, leer secretos, explotar sistemas externos ni mutar producción.
