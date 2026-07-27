# Dashboard local TRAMA

## Objetivo

Mostrar en tiempo real el estado, las conexiones y la comunicación operacional
entre LM Studio, Hermes, WSL2, Docker, Apache y MariaDB.

## Arquitectura

- Interfaz: React 19 + TypeScript, servida en `127.0.0.1:4310`.
- Servidor UI: adaptador Node local que sirve el build de Vite con normalización
  segura de rutas para Windows.
- API: Node.js + TypeScript en `127.0.0.1:4311`.
- Actualización: Server-Sent Events cada 4 segundos.
- Validación externa: Zod para la respuesta de LM Studio.
- Comandos: lista cerrada, `execFile`, sin `shell: true`, con timeout y buffer
  limitado.
- CORS: solo `localhost` y `127.0.0.1` en los puertos previstos.
- Métodos de API: solo GET y OPTIONS.

## Datos visibles

- Estado: operativo, atención, sin conexión o sin datos.
- Latencia de sondeo.
- Modelo cargado, contexto y paralelismo.
- Contadores de comprobaciones correctas/fallidas.
- Cambios de estado.
- Uso de memoria y tiempo activo del equipo.

## Datos prohibidos

- Prompts y respuestas.
- Contenido de archivos o proyectos.
- Tokens, claves, variables secretas o identificadores personales.
- Historial del perfil Hermes predeterminado.

## Operación

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-dashboard.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\windows\status-dashboard.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\windows\stop-dashboard.ps1
```

La interfaz presenta datos reales. Si XAMPP está detenido, Apache y MariaDB se
muestran sin conexión; no se simula un estado saludable.

Se descartó el starter Next/Vinext tras detectar avisos de seguridad transitivos y
un fallo de assets en Windows. La implementación final usa React + Vite, restringe
métodos a GET/HEAD y bloquea traversal fuera de `dist`.
