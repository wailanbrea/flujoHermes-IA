# Modelo de Seguridad y Gobierno

## 1. Principios de Seguridad Estricta
- **MySQL Predeterminado**: No se permite PostgreSQL salvo autorización contractual explícita.
- **Prohibición de Float/Double**: Todos los valores monetarios deben representarse en unidades menores (enteros).
- **Cero Mutaciones en Producción**: Los parches se prueban exclusivamente en sandboxes aislados y bases temporales.
- **Aislamiento de Secretos**: Los archivos `.env`, tokens y claves `.pem` / `.key` nunca se incluyen en diffs ni parches.
- **Prohibición de Force Push & Delete**: Queda prohibido `git push --force`, borrado de ramas o borrado de repositorios.

## 2. Parámetros de PatchPolicy
- Máximo 6 archivos modificados.
- Máximo 3 archivos nuevos.
- Máximo 450 líneas añadidas y 150 eliminadas.
- Prohibición de cambiar frameworks o incluir archivos binarios.
