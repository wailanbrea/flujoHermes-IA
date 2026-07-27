# Decisiones

## ADR-001 — Observabilidad desacoplada

Se usará un colector local con adaptadores y eventos versionados, en vez de parsear
directamente logs privados de cada herramienta. Motivo: seguridad, estabilidad y bajo
acoplamiento.

## ADR-002 — Dashboard de solo lectura

La primera versión no iniciará, detendrá ni configurará servicios. Las mutaciones
requieren un canal de aprobación separado. Motivo: el panel no debe convertirse en
una vía para saltar controles de Hermes.

## ADR-003 — Transporte en tiempo real

Se prefiere Server-Sent Events para el flujo servidor→navegador. Es suficiente para
telemetría, más simple que WebSocket y permite reconexión nativa. Las acciones futuras,
si se aprueban, usarán endpoints autenticados separados.

## ADR-004 — MySQL no se da por cumplido

El binario encontrado es MariaDB 10.4.32. No es técnicamente correcto reportarlo como
MySQL ni asumir compatibilidad total. La decisión de mantenerlo o crear MySQL aislado
se tomará antes del piloto.

## ADR-005 — GPU AMD

No se propondrán CUDA ni herramientas NVIDIA. La optimización de LM Studio se validará
con el backend soportado por la Radeon RX 9070 y mediciones reales.

## ADR-006 — Carga explícita del modelo

Hermes usará el modelo 35B MoE con contexto 65.536, paralelismo 1 y descarga parcial
a GPU. La carga JIT de LM Studio eligió 262K y paralelismo 4, reduciendo el margen de
RAM a un nivel inaceptable.

## ADR-007 — Prohibición de modos sin aprobación

Se prohíben `--yolo`, `--oneshot` y `-z`. En la versión instalada, `--oneshot`
activa internamente el modo YOLO. Las tareas con herramientas deben ejecutarse en el
CLI interactivo con aprobaciones manuales.
