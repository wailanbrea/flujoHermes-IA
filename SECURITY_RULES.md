# Reglas de seguridad

- Exposición de red: sólo `127.0.0.1` o `::1` salvo aprobación explícita.
- Telemetría: permitir metadatos mínimos; denegar secretos y contenido sensible.
- Credenciales: usar proveedores de secretos compatibles, nunca archivos versionados.
- Rutas: aplicar allowlist; denegar por defecto perfiles de usuario, `.ssh`,
  `AppData`, proyectos XAMPP y producción.
- Comandos: aprobación explícita para acciones destructivas o privilegiadas.
- Base de datos: no ejecutar `DROP DATABASE`, migraciones ni escrituras durante la
  instalación inicial.
- Logs: rotación, tamaño máximo, retención corta y saneamiento antes de persistir.
- Dashboard: operaciones mutables deshabilitadas por defecto, sin acceso remoto y con
  protección contra traversal, inyección de HTML y consumo ilimitado de eventos.
