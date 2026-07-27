# Dashboard local de interacciones y conexiones

## Objetivo

Mostrar en tiempo real el estado, conexiones y comunicaciones entre Codex, Hermes,
LM Studio, modelos, MCP, terminal, Git, Docker/WSL y quality gates. El dashboard no
debe inferir actividad que no pueda observar: un adaptador sin datos se muestra como
`unknown`, nunca como saludable.

## Alcance funcional inicial

- Topología viva con nodos y enlaces, estado y última observación.
- Tarjetas de LM Studio: servidor, modelo cargado, contexto, latencia y errores.
- Tarjetas de Hermes: estado, sesión/tarea, llamadas y reintentos.
- Inventario de herramientas/MCP con permiso efectivo y disponibilidad.
- Timeline de eventos: inicio/fin de tarea, llamada de herramienta, inferencia,
  checkpoint, prueba y bloqueo.
- Métricas: tokens, contexto utilizado, duración, RAM/VRAM cuando la fuente lo
  permita, pruebas y cambios Git.
- Quality gates con salida, duración y referencia a evidencia saneada.
- Alertas por servicio caído, contexto >75 %, tres fallos, binding no local,
  telemetría atrasada o prueba fallida.
- Enlace al dashboard nativo de Hermes cuando esté activo, sin copiar claves.

## Arquitectura propuesta

```text
LM Studio API ----\
Hermes status -----\
Docker / WSL ------- > adaptadores de sólo lectura
health scripts -----/          |
task wrappers ------> eventos JSONL saneados
                               |
                     colector local tipado
                        |             |
                   ring buffer     JSONL rotado
                        |
                    SSE /api/events
                        |
                 dashboard web local
```

Stack propuesto: backend Node.js + TypeScript, validación estricta de esquemas y
frontend React + TypeScript. Todas las dependencias serán locales, bloqueadas por
lockfile y auditadas. SSE es suficiente para actualizaciones unidireccionales y
reconexión; WebSocket no aporta valor en la primera versión.

## Contrato de evento mínimo

```json
{
  "schemaVersion": 1,
  "eventId": "uuid",
  "timestamp": "2026-07-27T18:00:00.000Z",
  "source": "hermes",
  "type": "tool.call.completed",
  "taskId": "MODULO-001",
  "correlationId": "uuid",
  "severity": "info",
  "durationMs": 142,
  "status": "success",
  "attributes": {
    "tool": "git",
    "exitCode": 0
  }
}
```

Los atributos se validan con allowlist. Cualquier clave sensible se elimina antes de
persistir y antes de enviar al navegador.

## Adaptadores

| Fuente | Método | Frecuencia | Limitación |
|---|---|---:|---|
| LM Studio | `/api/v0/models`, `/v1/models` | 2–5 s | uso/tokens requieren instrumentación por solicitud |
| Hermes | estado redactado y eventos del wrapper | 2–5 s / evento | no leer contenido de sesiones |
| Docker | ping/info de sólo lectura | 5 s | daemon puede estar detenido |
| WSL | estado de distribuciones | 10 s | no ejecutar comandos arbitrarios |
| Puertos | sockets locales esperados | 5 s | binding no prueba salud de aplicación |
| Git | sólo workspace autorizado | por tarea | proyectos reales denegados |
| Quality gates | reportes estructurados | por evento | no almacenar salida con secretos |
| Hardware | contadores Windows/LM Studio | 2–5 s | VRAM AMD depende de fuente disponible |

## Seguridad

- Binding estricto `127.0.0.1`; el proceso falla si se configura `0.0.0.0` o `::`.
- API de lectura; sin shell genérico ni endpoints de inicio/parada.
- CSP estricta, sin scripts remotos, CORS deshabilitado y límites de payload.
- Comparación constante para cualquier token futuro y cookies `HttpOnly/SameSite`
  si se autoriza acceso no-loopback.
- Redacción profunda y límite de longitud/cantidad de atributos.
- Retención por defecto de 24 horas, 25 MB por archivo y rotación atómica.
- Backpressure: ring buffer acotado, muestreo de métricas y desconexión de clientes
  lentos.
- El panel muestra edad y origen del dato para evitar falsas certezas.

## Estados

- `healthy`: health check válido y reciente.
- `degraded`: responde, pero incumple un umbral.
- `offline`: fallo confirmado tras política de tolerancia.
- `unknown`: adaptador ausente, dato expirado o permiso insuficiente.

## Validación

1. Unitarias de esquemas, redacción, estados y retención.
2. Integración con servidores falsos para timeout, JSON inválido y reconexión.
3. E2E del dashboard en escritorio y móvil.
4. Prueba de que prompts, tokens, cookies y variables de entorno no aparecen.
5. Prueba de binding: rechazar interfaces públicas.
6. Prueba de carga con ráfagas y cliente SSE lento.
7. Prueba de servicios caídos y datos obsoletos.
8. Auditoría de dependencias y revisión del lockfile.

## Fuera de alcance inicial

- Control remoto.
- Edición de credenciales o configuración.
- Mostrar contenido de prompts/respuestas.
- Leer logs privados completos.
- Exponer el panel a LAN o internet.
- Consultar o modificar bases de datos de proyectos reales.
