# Plan maestro

## Análisis de brecha

La base ya existe parcialmente: Windows, WSL2, Docker Desktop, LM Studio, Hermes,
Git, Python, Node, Java, Android Studio, XAMPP y Composer están instalados. No es
correcto reinstalarlos de forma indiscriminada. Las brechas reales son:

- no existe una distribución Ubuntu de trabajo;
- Docker está detenido;
- LM Studio responde, pero no hay modelo cargado ni benchmarks;
- Hermes existe, pero su configuración y límites no están validados;
- el motor de XAMPP es MariaDB 10.4, no MySQL;
- no hay health checks integrados ni telemetría común;
- el dashboard transversal solicitado no está implementado;
- no se han creado skills, quality gates ni piloto.

## Matriz de cambios propuesta

| Cambio | Estado actual | Estado objetivo | Riesgo | Admin | Reinicio | Aprobación |
|---|---|---|---|---:|---:|---:|
| Consultar documentación oficial | No ejecutado | Comandos y versiones verificados | Bajo; acceso externo | No | No | Sí |
| Verificar features Windows | Parcial | Estado DISM confirmado | Bajo | Sí | No | Sí |
| Instalar Ubuntu LTS en WSL | Ausente | Distribución de trabajo WSL2 | Medio | Probable | Posible | Sí |
| Preparar utilidades en Ubuntu | Ausentes | Git, Python, pipx, Node LTS, build tools, jq, curl, unzip | Medio | Dentro de WSL | No | Sí |
| Arrancar/verificar Docker | Instalado, detenido | Motor sano e integración WSL validada | Bajo | No habitual | No | Sí |
| Auditar configuración Hermes | Instalado | Perfil aislado, safe mode, rutas y límites | Medio | No | No | Sí |
| Probar LM Studio | Servidor sano, modelos descargados | Un modelo cargado y benchmarkeado | Medio por RAM/VRAM | No | No | Sí |
| Resolver MySQL | MariaDB 10.4 | MySQL aislado o compatibilidad aceptada | Medio/alto | Depende | No | Decisión separada |
| Health checks | Ausentes | Scripts idempotentes Windows/WSL | Bajo | No | No | Incluida |
| Dashboard local | Diseñado | Vista unificada en 127.0.0.1 | Medio | No | No | Incluida |
| Skills y plantillas | Ausentes | Nueve skills acotadas y verificadas | Bajo | No | No | Incluida |
| Piloto Laravel | Ausente | Proyecto sintético aislado | Medio | No | No | Tras infraestructura |

No se cambiarán las versiones usadas por proyectos existentes. Gradle seguirá usando
wrapper. PHP, Java, Android SDK y MariaDB de XAMPP no se tocarán.

## Implementación por fases

### Fase 2 — Base aislada

1. Verificar documentación oficial vigente y guardar referencias.
2. Confirmar features Windows con elevación aprobada.
3. Instalar una Ubuntu LTS estable obtenida del catálogo oficial de WSL.
4. Validar localhost, permisos, Git y acceso limitado al workspace.
5. Preparar sólo herramientas faltantes dentro de WSL.
6. Arrancar Docker Desktop manualmente y validar integración, sin cambiar puertos.
7. Crear checkpoint y evidencia.

La versión exacta de Ubuntu no se fija sin consultar el catálogo oficial vigente; a
27 de julio de 2026 hacerlo de memoria sería inventar un requisito.

### Fase 3 — LM Studio y contexto

1. Crear health checks sin secretos.
2. Cargar un modelo por vez.
3. Probar chat, JSON, tool calling, contexto y recuperación.
4. Medir RAM/VRAM y tokens/s.
5. Comenzar con 22000 tokens operativos y una solicitud paralela.
6. Seleccionar modelo principal y rápido sólo por evidencia.

### Fase 4 — Hermes

1. Crear un perfil aislado para este workspace.
2. Configurar LM Studio como proveedor local.
3. Aplicar allowlist de rutas, safe mode, timeout y tres intentos.
4. Validar lectura, escritura, rechazo, Git, checkpoint, skill e informe.
5. No usar `--oneshot` para tareas con seguridad crítica: su ayuda indica que omite
   aprobaciones.

### Fase 5 — MCP

Empezar sólo con filesystem restringido, Git y documentación. Playwright se habilita
cuando exista piloto. GitHub y servicios personales permanecen desactivados.

### Fase 6–8 — Documentación, skills y quality gates

Crear plantillas, skills especializadas y gates reproducibles sin tocar proyectos
reales. Validar cada artefacto con ejemplos sintéticos.

### Fase 9 — Dashboard local

Implementar el diseño de `docs/18_OBSERVABILITY_DASHBOARD.md` en incrementos:

1. health y topología;
2. stream de eventos saneados;
3. métricas de tarea/modelo;
4. resultados de quality gates;
5. retención y pruebas de seguridad.

### Fase 10 — Piloto

Crear un Laravel mínimo dentro de `examples/laravel`, con datos sintéticos y base
aislada. Ejecutar el flujo completo y documentar el handoff.

## Punto único de aprobación

La aprobación solicitada cubre las acciones de Fase 2 a Fase 9 que sean locales,
reversibles y estén dentro del workspace, más la instalación de Ubuntu y utilidades
en WSL. No cubre reinicios automáticos, credenciales, servicios externos distintos de
documentación oficial, descarga de modelos, modificación de XAMPP/proyectos reales ni
cambios destructivos; esos eventos detendrán la ejecución.
