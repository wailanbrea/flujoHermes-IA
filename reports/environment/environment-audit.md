# Auditoría de entorno

Fecha: 27 de julio de 2026

Modo: sólo lectura

Workspace nuevo: `C:\AI-Workspace\local-ai-orchestrator`

## Resultado ejecutivo

El equipo tiene capacidad suficiente para el entorno: 62.88 GiB de RAM, Radeon RX
9070 con 15.92 GiB de VRAM y virtualización activa. LM Studio y Hermes ya existen, por
lo que reinstalarlos sería un riesgo innecesario. Faltan una Ubuntu de trabajo,
validaciones de configuración, benchmarks, health checks y observabilidad común.

El hallazgo técnico más importante fuera de IA es que XAMPP contiene MariaDB 10.4.32,
no MySQL. También escucha en `::`: debe revisarse antes de conectar un piloto.

## Herramientas verificadas

| Herramienta | Versión/estado |
|---|---|
| Git | 2.55.0.windows.2 |
| Docker Desktop | 4.81.0, daemon detenido |
| WSL | 2.6.3.0, sólo `docker-desktop` |
| Python | 3.12.10 global; 3.11.15 Hermes |
| Node / npm / pnpm | 24.4.0 / 11.4.2 / 11.9.0 |
| Java | OpenJDK 21.0.10 |
| Android Studio / ADB | 2025.1 / 37.0.0 |
| PHP / Composer | 8.2.12 / 2.8.11 |
| MariaDB | 10.4.32 |
| LM Studio | 0.4.20+1 |
| Hermes | 0.18.2 |
| VS Code | 1.119.0 |

## Inventario de proyectos

Tamaños aproximados; se excluyeron `vendor`, `node_modules`, `.git`, `.gradle`,
`build` y `storage/logs`.

| Proyecto | Tecnología detectada | Git | MB aprox. |
|---|---|---|---:|
| AutoChat Pro | Desconocida/estática | Sin repo | 64.3 |
| BSLotery | Laravel, Node, Composer | Dirty, `feature/print-connector` | 40.4 |
| BSportsBook | Laravel, Node, Composer | Sin repo | 6.7 |
| BSRentCar | Laravel, Node, Composer | Dirty, `main` | 15.8 |
| CalculadoraParley Web | Node | Dirty, `main` | 5.6 |
| Catalogo Gaton | Laravel, Node, Composer | Dirty, `main` | 102.7 |
| CondoPro | Laravel, Node, Composer | Clean, `main` | 4.3 |
| condoProApp | Android/Gradle | Dirty, `master` | 0.3 |
| E-Shop | Laravel, Node, Composer | Sin repo | 2.1 |
| FacturaPro | No clasificado en raíz | Clean, `master` | 59.4 |
| frontend | Node | Sin repo | 3.6 |
| Laravel12-Ticomsys | Laravel, Node, Composer | Clean, `main` | 37.3 |
| laravel_argon | Laravel, Node, Composer | Sin repo | 21.5 |
| MartinezDevice | Laravel, Composer | Clean, `main` | 20.9 |
| MCP AppControl | No clasificado en raíz | Dirty, `main` | 1817.1 |
| Proyecto ERP FINANCE | Desconocida/estática | Sin repo | 4.3 |
| Prueba de IA | Vacío/no clasificado | Sin repo | 0 |
| Saas Facturacion | Desconocida/estática | Sin repo | 10.7 |
| Sistema de Facturacion Saas | Laravel, Node, Composer | Clean, `phase/0-base` | 202.2 |
| Sistema de Prestamos PHP | Laravel, Node, Composer | Dirty, `main` | 707.7 |
| Sistema Gestion de WS | Laravel, Node, Composer | Sin repo | 4.6 |
| SistemaPrestamistaAndroid | Android/Gradle | Dirty, `feature/role-based-views` | 9.2 |
| temp_argon_integration | Laravel, Node, Composer | Clean, `main` | 4.0 |
| VacationSystem | Desconocida/estática | Sin repo | 733.0 |
| wallet Finanzas | No clasificado en raíz | Sin repo | 62.0 |
| WalletFinanzasBackend | Laravel, Node, Composer | Dirty, `main` | 46.5 |
| WalletFinanzasBackendBlueprintBackup | Vacío/no clasificado | Sin repo | 0 |
| WalletFinanzasBackendFresh | Laravel, Node, Composer | Sin repo | 0.5 |
| htdocs/bsolutions | Desconocida/estática | Sin repo | 0 |
| htdocs/dashboard | Desconocida/estática | Sin repo | 11.2 |
| htdocs/img | Desconocida/estática | Sin repo | 0 |
| htdocs/webalizer | Desconocida/estática | Sin repo | 0 |
| htdocs/xampp | Desconocida/estática | Sin repo | 0 |

## Evidencia de no intervención

- No se leyó ningún `.env`.
- No se instalaron dependencias.
- No se ejecutaron migraciones ni pruebas de proyectos.
- No se cargó un modelo.
- No se inició Docker.
- No se modificó ningún repositorio listado.
