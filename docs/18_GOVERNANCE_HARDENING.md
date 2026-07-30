# Endurecimiento de gobernanza

## Contrato operativo

Una tarea editable se acepta únicamente cuando contiene:

1. proyecto autorizado y repositorio Git limpio;
2. consulta Graphify acotada con hashes de pregunta y resultado;
3. decisión del router con capacidad, perfil, modelo, tools y fallback;
4. worktree aislado y allowlist de archivos;
5. parche sellado y validación independiente;
6. `Complete` exitoso aplicado una sola vez.

El sandbox puede ser operado por el director autorizado o por Hermes Brain. Ningún
actor puede modificar el repositorio fuente antes de `Complete`.

## Promoción de aprendizaje

`record-learning` crea una candidata. `validate-learning` exige un artefacto JSON
de schema 1 ligado al record, task y skill, calcula su SHA-256 y pasa el estado a
`validated`. `promote-learning` exige ese mismo digest y una aprobación explícita.
Una bandera booleana proporcionada por el llamador ya no autoriza promoción.

Las escrituras nativas de skills y memoria se mantienen detrás de los gates de
aprobación de Hermes. Los bundles versionados cargan procedimientos por tarea sin
convertir todo el catálogo en contexto permanente.

## Modelos

Gemma 4 12B QAT es el modelo principal residente con 64K de contexto, paralelismo
4, GPU máxima y MTP desactivado. Qwen 35B nunca se selecciona automáticamente:
requiere autorización manual, usa offload 0.50 y se descarga tras 900 segundos
inactivo.

## Telemetría

La salud del runtime no depende de fallos históricos. El dashboard informa por
separado registros inválidos, tareas activas obsoletas y fallos históricos. La GPU
usa el baseline aprobado de cada preset; estar inactiva no es una degradación.
RTK expone comandos compactados y tokens evitados sin capturar contenido.

## Validación

```powershell
$env:PYTHONPATH = 'src'
py -3 -m unittest discover -s tests -v
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-hermes-task-common.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-hermes-lifecycle.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-prepare-hermes-model.ps1
Set-Location dashboard
npm test
```
