# TRAMA

Dashboard local de observabilidad para LM Studio, Hermes, Graphify, la RX 9070,
WSL2, Docker, Apache y MariaDB.

## Qué muestra

- Flujo dirigido entre operador, Codex, Hermes, Graphify, LM Studio, GPU y proyectos.
- Diferencia entre conexiones observadas, rutas configuradas y relaciones indexadas.
- Estado y antigüedad del grafo global de Graphify.
- Nodos y relaciones por proyecto sin exponer contenido de archivos.
- VRAM dedicada y memoria compartida usadas por la GPU principal.
- Estado, latencia y cambios de los servicios locales.

## Desarrollo

```powershell
npm install
npm run lint
npm test
```

## Operación

Desde la raíz del workspace:

```powershell
.\scripts\windows\start-dashboard.ps1
.\scripts\windows\status-dashboard.ps1
.\scripts\windows\stop-dashboard.ps1
```

La interfaz escucha en `127.0.0.1:4310`; la API/SSE de solo lectura en
`127.0.0.1:4311`. No se capturan prompts, respuestas, archivos ni credenciales.
