---
name: hermes-evidence-gate
description: Sellar, revisar e integrar una modificación hecha dentro de un sandbox Hermes. Usar para validar allowlist, límites, binarios, LF, SHA-256, git apply y aplicación idempotente.
---

# Hermes Evidence Gate

1. Sellar desde `editing` con `seal-hermes-task.ps1`.
2. Verificar archivos permitidos, líneas, binarios, LF, bytes y SHA-256.
3. Ejecutar `git apply --check` contra el source limpio.
4. Aprobar sin aplicar.
5. Ejecutar pruebas independientes en el sandbox.
6. Completar una vez o regresar el mismo sandbox a `editing`.

Éxito: `integration.json` coincide con el hash sellado, la aplicación no se
repite y una limpieza fallida queda en `applied-cleanup-pending`.

No editar evidencia manualmente, integrar desde TRAMA ni aceptar un diff fuera
de la allowlist.
