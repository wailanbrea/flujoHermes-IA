# Dashboard local TRAMA

## Objetivo

Mostrar en tiempo real el flujo operativo entre Codex, Hermes, Graphify, LM Studio,
la RX 9070, WSL2, Docker, Apache, MariaDB y los proyectos indexados.

## Arquitectura

- Interfaz: React 19 + TypeScript, servida en `127.0.0.1:4310`.
- API de solo lectura: Node.js + TypeScript en `127.0.0.1:4311`.
- Actualización: Server-Sent Events cada 4 segundos.
- Validación: Zod para respuestas externas y archivos Graphify.
- Ejecución: lista cerrada con `execFile`, sin `shell: true`, timeout y buffer limitado.
- CORS: solo `localhost` y `127.0.0.1` en los puertos previstos.
- Métodos: GET, HEAD y OPTIONS según el servicio.

## Diagrama de flujo

El circuito diferencia la procedencia de cada enlace:

- **Observada ahora:** comprobación viva de una API, proceso, contador o archivo.
- **Configurada:** ruta declarada en Codex, Hermes o el orquestador.
- **Indexada:** relación obtenida del grafo local.

El diagrama no afirma que una conexión configurada esté generando tráfico. La
actividad animada se limita a enlaces observados.

## Datos visibles

- Estado, latencia, procedencia y antigüedad.
- Modelo cargado, contexto y paralelismo.
- VRAM dedicada y memoria GPU compartida.
- Integración Graphify en Codex y Hermes.
- Proyectos, nodos, relaciones y comunidades del grafo.
- Contadores de comprobaciones y cambios de estado.
- Uso de RAM y tiempo activo del equipo.
- Comparación sostenida de Gemma y Qwen: velocidad, GPU, memoria y agente completo.
- Hermes Insights agregados: tokens por modelo, sesiones, herramientas, skills y actividad.
- Costo local $0 y ahorro frente a GPT-5.6 Sol con tarifa documentada.

## Datos prohibidos

- Prompts, respuestas y argumentos de herramientas.
- Contenido de archivos o nodos.
- Claves, secretos o rutas personales.
- Historial del perfil Hermes predeterminado.

## Operación

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-dashboard.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\windows\status-dashboard.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\windows\stop-dashboard.ps1
```

Si un servicio está detenido se muestra sin conexión; no se simulan estados
saludables. El dashboard es observador y no ejecuta cambios sobre los proyectos.

Los Insights se refrescan con:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\export-hermes-insights.ps1 -Days 3650
```
