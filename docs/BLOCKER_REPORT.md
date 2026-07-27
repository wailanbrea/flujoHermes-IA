# Informe de bloqueos

No existe un bloqueo que impida usar el entorno local o el dashboard.

## Limitaciones importantes

- Hermes `--oneshot` omite aprobaciones; está bloqueado por el wrapper.
- El piloto demostró que el modelo puede generar un resumen inconsistente aunque
  las pruebas pasen. Los informes requieren revisión contra diff y pruebas.
- Docker funciona desde Ubuntu mediante interoperabilidad `docker.exe`; la CLI
  Linux nativa no quedó montada por Docker Desktop. No se instaló un motor duplicado.
- El producto encontrado en XAMPP es MariaDB 10.4.32, no MySQL. No se cambió.

## Intervención humana futura

- Seleccionar y autorizar individualmente el primer proyecto real.
- Decidir si MariaDB es suficiente o si se necesita MySQL aislado.
- Autorizar cualquier descarga de modelo adicional o integración externa.
