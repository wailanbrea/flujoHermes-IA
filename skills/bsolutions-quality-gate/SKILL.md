---
name: bsolutions-quality-gate
description: Ejecutar y reportar quality gates reproducibles para Laravel/PHP, Kotlin/Android, TypeScript, datos o proyectos mixtos. Usar antes de completar una tarea para combinar validación determinista, revisión adversarial, blast radius y evidencia.
---

# Quality Gate

Requerir raíz autorizada, stack/versiones, diff, criterios, comandos del proyecto
y restricciones de tiempo/entorno. Consultar Graphify para callers, callees y
blast radius de los símbolos cambiados.

## Piso determinista

1. Leer metadatos de build, CI y alcance del diff. Preferir comandos del proyecto;
   no instalar ni actualizar dependencias.
2. Construir una matriz mínima: formato, lint, análisis estático, compilación,
   tests, migraciones, auditoría, E2E, secretos, diff y documentación.
3. Ejecutar primero checks rápidos y acotados. Capturar comando, duración, exit
   code, estado y evidencia saneada.
4. No omitir, debilitar ni ocultar fallos. Marcar checks no disponibles como
   BLOCKED o no aplicables con motivo.

## Revisión adversarial

Realizar tres pasadas read-only:

1. Casos límite, entradas inválidas, concurrencia, timeouts y fallos silenciosos.
2. Claridad, duplicación, código muerto, sobreabstracción y residuos de código IA.
3. Corrección y blast radius: N+1, fugas de memoria, carreras, contratos rotos y
   regresiones en consumidores.

Clasificar cada cambio como **SAFE**, **CAREFUL** o **RISKY** según alcance,
reversibilidad y evidencia. El revisor nunca aplica cambios automáticamente.

Emitir PASS, FAIL o BLOCKED con matriz, hallazgos, evidencia, riesgos y siguiente
acción. Tras tres intentos fallidos, devolver un bloqueo explícito.
