---
name: bsolutions-adversarial-ux-review
description: Revisar de forma adversarial y read-only la usabilidad de una aplicación local o de staging mediante una persona concreta, evidencia visual y un filtro pragmático. Usar para detectar fricción, accesibilidad, onboarding y recuperación de errores sin crear tickets, cuentas, datos ni efectos externos.
---

# Revisión adversarial de UX

## Preparar

1. Confirmar URL autorizada, entorno, flujo principal y audiencia.
2. Consultar Graphify y documentación exacta del proyecto antes de navegar.
3. Definir una sola persona con objetivo, limitaciones y condición de abandono.
4. No usar producción, registrarse, comprar, enviar formularios externos ni
   crear datos persistentes sin autorización separada.

## Ejecutar

1. Recorrer primero la tarea principal, no una visita de funcionalidades.
2. Medir pasos, retrocesos, estados vacíos, mensajes de error y recuperación.
3. Revisar legibilidad, contraste, foco, teclado, targets y terminología.
4. Capturar evidencia visual saneada de cada hallazgo; no incluir datos
   personales, tokens, cookies ni información de otras cuentas.
5. Detenerse ante autenticación no prevista, pago o efecto irreversible.

## Filtrar

Clasificar cada observación:

- **RED:** problema reproducible que bloquea o confunde a usuarios normales.
- **YELLOW:** fricción válida de alcance limitado.
- **WHITE:** preferencia de la persona sin daño demostrable.
- **GREEN:** mejora posible que requiere validación de producto.

Reportar ruta, pasos, resultado observado, resultado esperado, evidencia,
severidad y confianza. No crear tickets ni modificar el producto. Entregar como
máximo diez hallazgos, priorizados por el flujo principal.
