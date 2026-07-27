import { execFile } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { freemem, hostname, totalmem, uptime } from "node:os";
import { promisify } from "node:util";
import { z } from "zod";
import type {
  ConnectionHealth,
  HealthState,
  ServiceHealth,
  TelemetryEvent,
  TelemetrySnapshot,
} from "../lib/telemetry";

const execFileAsync = promisify(execFile);
const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.TELEMETRY_PORT ?? "4311", 10);
const INTERVAL_MS = 4_000;
const allowedOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1):(?:3000|4310)$/;
const lmSchema = z.object({
  models: z.array(
    z.object({
      display_name: z.string(),
      loaded_instances: z
        .array(
          z.object({
            id: z.string(),
            config: z.object({
              context_length: z.number(),
              parallel: z.number(),
            }),
          }),
        )
        .default([]),
    }),
  ),
});

interface Probe {
  service: ServiceHealth;
  protocol: string;
}

const events: TelemetryEvent[] = [];
const previousStates = new Map<string, HealthState>();
const counters = new Map<string, { success: number; failure: number }>();
const clients = new Set<ServerResponse>();
let sequence = 0;
let current: TelemetrySnapshot | null = null;
let collecting = false;

const checkedAt = () => new Date().toISOString();
const latency = (start: number) =>
  Math.max(0, Math.round(performance.now() - start));
const safeError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 140);

async function run(file: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(file, args, {
    windowsHide: true,
    timeout: 3_500,
    maxBuffer: 256 * 1024,
    encoding: "utf8",
  });
  return stdout.trim();
}

function failedProbe(
  id: string,
  name: string,
  role: string,
  protocol: string,
  start: number,
  error: unknown,
): Probe {
  return {
    protocol,
    service: {
      id,
      name,
      role,
      state: "offline",
      detail: `Sin respuesta local: ${safeError(error)}`,
      latencyMs: latency(start),
      checkedAt: checkedAt(),
    },
  };
}

async function probeLmStudio(): Promise<Probe> {
  const start = performance.now();
  try {
    const response = await fetch("http://127.0.0.1:1234/api/v1/models", {
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = lmSchema.parse(await response.json());
    const loaded = data.models.flatMap((model) =>
      model.loaded_instances.map((instance) => ({ model, instance })),
    );
    const active = loaded[0];
    return {
      protocol: "HTTP / REST",
      service: {
        id: "lm-studio",
        name: "LM Studio",
        role: "Inferencia local",
        state: active ? "healthy" : "degraded",
        detail: active
          ? `${active.model.display_name} · ${(active.instance.config.context_length / 1024).toFixed(0)}K contexto`
          : "Servidor activo, sin modelo cargado",
        latencyMs: latency(start),
        checkedAt: checkedAt(),
        metrics: {
          loadedModels: loaded.length,
          contextTokens: active?.instance.config.context_length ?? 0,
          parallelSlots: active?.instance.config.parallel ?? 0,
        },
      },
    };
  } catch (error) {
    return failedProbe(
      "lm-studio",
      "LM Studio",
      "Inferencia local",
      "HTTP / REST",
      start,
      error,
    );
  }
}

async function probeHermes(): Promise<Probe> {
  const start = performance.now();
  try {
    const [model, provider] = await Promise.all([
      run("hermes.exe", [
        "--profile",
        "localai",
        "config",
        "get",
        "model.default",
      ]),
      run("hermes.exe", [
        "--profile",
        "localai",
        "config",
        "get",
        "model.provider",
      ]),
    ]);
    const valid =
      provider === "lmstudio" &&
      model === "qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive";
    return {
      protocol: "CLI / OpenAI API",
      service: {
        id: "hermes",
        name: "Hermes Agent",
        role: "Orquestación",
        state: valid ? "healthy" : "degraded",
        detail: valid
          ? "Perfil localai aislado · aprobaciones manuales"
          : "El perfil no coincide con la configuración validada",
        latencyMs: latency(start),
        checkedAt: checkedAt(),
        metrics: { profileIsolated: true, provider },
      },
    };
  } catch (error) {
    return failedProbe(
      "hermes",
      "Hermes Agent",
      "Orquestación",
      "CLI / OpenAI API",
      start,
      error,
    );
  }
}

async function probeDocker(): Promise<Probe> {
  const start = performance.now();
  try {
    const output = await run("docker.exe", [
      "info",
      "--format",
      "{{.ServerVersion}}|{{.OSType}}|{{.NCPU}}",
    ]);
    const [version, osType, cpus] = output.split("|");
    return {
      protocol: "Docker Engine API",
      service: {
        id: "docker",
        name: "Docker Desktop",
        role: "Contenedores aislados",
        state: osType === "linux" ? "healthy" : "degraded",
        detail: `${osType || "motor desconocido"} · ${cpus || "?"} CPU asignadas`,
        latencyMs: latency(start),
        version,
        checkedAt: checkedAt(),
      },
    };
  } catch (error) {
    return failedProbe(
      "docker",
      "Docker Desktop",
      "Contenedores aislados",
      "Docker Engine API",
      start,
      error,
    );
  }
}

async function probeWsl(): Promise<Probe> {
  const start = performance.now();
  try {
    const user = await run("wsl.exe", [
      "-d",
      "Ubuntu-24.04",
      "--",
      "id",
      "-un",
    ]);
    return {
      protocol: "WSL interop",
      service: {
        id: "wsl",
        name: "Ubuntu 24.04 LTS",
        role: "Entorno Linux",
        state: user === "aiops" ? "healthy" : "degraded",
        detail:
          user === "aiops"
            ? "WSL2 · usuario sin privilegios aiops"
            : `Usuario activo inesperado: ${user || "desconocido"}`,
        latencyMs: latency(start),
        checkedAt: checkedAt(),
        metrics: { unprivilegedUser: user === "aiops" },
      },
    };
  } catch (error) {
    return failedProbe(
      "wsl",
      "Ubuntu 24.04 LTS",
      "Entorno Linux",
      "WSL interop",
      start,
      error,
    );
  }
}

function probeTcp(
  id: string,
  name: string,
  role: string,
  port: number,
): Promise<Probe> {
  const start = performance.now();
  return new Promise((resolve) => {
    const socket = connect({ host: HOST, port });
    let settled = false;
    const finish = (state: HealthState, detail: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        protocol: `TCP ${port}`,
        service: {
          id,
          name,
          role,
          state,
          detail,
          latencyMs: latency(start),
          checkedAt: checkedAt(),
        },
      });
    };
    socket.setTimeout(1_500);
    socket.once("connect", () =>
      finish("healthy", `Puerto ${port} accesible desde localhost`),
    );
    socket.once("timeout", () => finish("offline", `Puerto ${port} sin respuesta`));
    socket.once("error", () => finish("offline", `Puerto ${port} cerrado`));
  });
}

function updateEvents(services: ServiceHealth[]): void {
  for (const service of services) {
    const previous = previousStates.get(service.id);
    if (previous === service.state) continue;
    previousStates.set(service.id, service.state);
    events.unshift({
      id: `${Date.now()}-${service.id}-${sequence}`,
      timestamp: checkedAt(),
      severity:
        service.state === "healthy"
          ? "success"
          : service.state === "degraded"
            ? "warning"
            : "error",
      source: service.name,
      message:
        previous === undefined
          ? `Observación iniciada: ${service.detail}`
          : `Estado ${previous} → ${service.state}: ${service.detail}`,
    });
  }
  events.splice(40);
}

function connectionFrom(probe: Probe): ConnectionHealth {
  const id = `dashboard-${probe.service.id}`;
  const count = counters.get(id) ?? { success: 0, failure: 0 };
  if (probe.service.state === "healthy" || probe.service.state === "degraded") {
    count.success += 1;
  } else {
    count.failure += 1;
  }
  counters.set(id, count);
  return {
    id,
    source: "dashboard",
    target: probe.service.id,
    label: `Sondeo de ${probe.service.role.toLowerCase()}`,
    protocol: probe.protocol,
    state: probe.service.state,
    latencyMs: probe.service.latencyMs,
    successfulChecks: count.success,
    failedChecks: count.failure,
  };
}

async function collect(): Promise<TelemetrySnapshot> {
  const probes = await Promise.all([
    probeLmStudio(),
    probeHermes(),
    probeDocker(),
    probeWsl(),
    probeTcp("mariadb", "MariaDB", "Datos locales", 3306),
    probeTcp("apache", "Apache", "Aplicaciones XAMPP", 80),
  ]);
  const services = probes.map(({ service }) => service);
  updateEvents(services);
  const free = freemem();
  const total = totalmem();
  sequence += 1;
  return {
    generatedAt: checkedAt(),
    sequence,
    overallState: services.some((service) => service.state !== "healthy")
      ? "degraded"
      : "healthy",
    services,
    connections: probes.map(connectionFrom),
    events: [...events],
    system: {
      memoryUsedGiB: Number(((total - free) / 1024 ** 3).toFixed(2)),
      memoryTotalGiB: Number((total / 1024 ** 3).toFixed(2)),
      memoryUsagePercent: Number((((total - free) / total) * 100).toFixed(1)),
      uptimeSeconds: Math.round(uptime()),
    },
    privacy: { capturesContent: false, binding: "127.0.0.1" },
  };
}

function headers(response: ServerResponse, origin?: string): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
  if (origin && allowedOrigin.test(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function refresh(): Promise<void> {
  if (collecting) return;
  collecting = true;
  try {
    current = await collect();
    const payload = `event: snapshot\ndata: ${JSON.stringify(current)}\n\n`;
    for (const client of clients) client.write(payload);
  } finally {
    collecting = false;
  }
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  headers(response, origin);
  if (origin && !allowedOrigin.test(origin)) {
    return json(response, 403, { error: "Origen local no autorizado" });
  }
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    return response.end();
  }
  if (request.method !== "GET") {
    return json(response, 405, { error: "Solo se permite lectura" });
  }
  if (request.url === "/health") {
    return json(response, 200, {
      status: "ok",
      host: hostname(),
      binding: `${HOST}:${PORT}`,
    });
  }
  if (request.url === "/api/status") {
    if (!current) await refresh();
    return json(response, 200, current);
  }
  if (request.url === "/api/events") {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    if (current) {
      response.write(`event: snapshot\ndata: ${JSON.stringify(current)}\n\n`);
    }
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }
  return json(response, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, async () => {
  console.log(`Telemetry API listening on http://${HOST}:${PORT}`);
  await refresh();
  setInterval(refresh, INTERVAL_MS).unref();
});

function shutdown(): void {
  for (const client of clients) client.end();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
