# TRAMA

Dashboard local de observabilidad para LM Studio, Hermes, WSL2, Docker, Apache
y MariaDB.

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
