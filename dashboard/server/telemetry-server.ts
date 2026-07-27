import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { freemem, homedir, hostname, totalmem, uptime } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type {
  ConnectionHealth,
  GraphRepositorySummary,
  HealthState,
  HermesDelegationSummary,
  HermesTaskSummary,
  KnowledgeGraphSummary,
  ServiceHealth,
  TelemetryEvent,
  TelemetrySnapshot,
  WorkflowEdge,
  WorkflowNode,
} from "../lib/telemetry";

const execFileAsync = promisify(execFile);
const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.TELEMETRY_PORT ?? "4311", 10);
const INTERVAL_MS = 4_000;
const WORKSPACE_ROOT = resolve(import.meta.dirname, "..", "..");
const GLOBAL_GRAPH_PATH = resolve(homedir(), ".graphify", "global-graph.json");
const LOCAL_GRAPH_PATH = resolve(WORKSPACE_ROOT, "graphify-out", "graph.json");
const PROJECT_CATALOG_PATH = resolve(
  WORKSPACE_ROOT,
  "telemetry",
  "runtime",
  "project-catalog.json",
);
const HERMES_JOBS_PATH = resolve(
  WORKSPACE_ROOT,
  "telemetry",
  "runtime",
  "hermes-jobs",
);
const HERMES_SUBMIT_SCRIPT = resolve(
  WORKSPACE_ROOT,
  "scripts",
  "windows",
  "submit-hermes-task.ps1",
);
const CODEX_GRAPHIFY_SKILL = resolve(homedir(), ".codex", "skills", "graphify", "SKILL.md");
const HERMES_GRAPHIFY_SKILL = resolve(
  homedir(),
  "AppData",
  "Local",
  "hermes",
  "profiles",
  "localai",
  "skills",
  "graphify",
  "SKILL.md",
);
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
const graphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      repo: z.string().optional(),
      file_type: z.string().optional(),
      community: z.union([z.string(), z.number()]).optional(),
    }),
  ),
  links: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      relation: z.string().optional(),
    }),
  ),
});
const projectCatalogSchema = z.object({
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      rootAlias: z.string(),
      relativePath: z.string().nullable(),
      hasGit: z.boolean().nullable(),
      gitScope: z
        .enum(["own", "inherited", "none", "unknown"])
        .default("unknown"),
      gitBranch: z.string().nullable(),
      gitDirty: z.boolean().nullable(),
      graphStatus: z
        .enum(["ready", "metadata-only", "failed", "inventory-only"])
        .default("inventory-only"),
    }),
  ),
});
const hermesTaskSchema = z.object({
  taskId: z.string(),
  projectName: z.string(),
  mode: z.enum(["analysis", "execute"]),
  state: z.enum([
    "queued",
    "preparing",
    "executing",
    "awaiting-review",
    "validating",
    "completed",
    "rejected",
    "failed",
    "blocked",
    "validation-failed",
  ]),
  updatedAt: z.string(),
  filesChanged: z.number().int().nonnegative().default(0),
  patchBytes: z.number().int().nonnegative().default(0),
  validationPassed: z.boolean().nullable().default(null),
});

interface Probe {
  service: ServiceHealth;
  protocol: string;
}

interface GraphProbe extends Probe {
  graph: KnowledgeGraphSummary;
}

interface GpuProbe extends Probe {
  dedicatedUsedGiB: number | null;
  sharedUsedGiB: number | null;
}

interface HermesBrokerProbe extends Probe {
  delegation: HermesDelegationSummary;
}

interface CachedGraphData {
  mtimeMs: number;
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
  repositoryCounts: Array<{ label: string; count: number }>;
  edgeCountByRepository: Map<string, number>;
  nodeTypes: Array<{ label: string; count: number }>;
  relations: Array<{ label: string; count: number }>;
}

const events: TelemetryEvent[] = [];
const previousStates = new Map<string, HealthState>();
const counters = new Map<string, { success: number; failure: number }>();
const clients = new Set<ServerResponse>();
let sequence = 0;
let current: TelemetrySnapshot | null = null;
let refreshPromise: Promise<void> | null = null;
let cachedGraphData: CachedGraphData | null = null;

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

async function pathExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readProjectCatalog() {
  try {
    const body = await readFile(PROJECT_CATALOG_PATH, "utf8");
    return projectCatalogSchema.parse(JSON.parse(body.replace(/^\uFEFF/, "")));
  } catch {
    return { projects: [] };
  }
}

async function readGraphData(): Promise<CachedGraphData> {
  const fileStat = await stat(GLOBAL_GRAPH_PATH);
  if (cachedGraphData?.mtimeMs === fileStat.mtimeMs) {
    return cachedGraphData;
  }

  const body = await readFile(GLOBAL_GRAPH_PATH, "utf8");
  const parsed = graphSchema.parse(JSON.parse(body));
  const edgeCountByRepository = new Map<string, number>();
  for (const link of parsed.links) {
    const separator = link.source.indexOf("::");
    if (separator <= 0) continue;
    const repositoryId = link.source.slice(0, separator);
    if (!link.target.startsWith(`${repositoryId}::`)) continue;
    edgeCountByRepository.set(
      repositoryId,
      (edgeCountByRepository.get(repositoryId) ?? 0) + 1,
    );
  }

  cachedGraphData = {
    mtimeMs: fileStat.mtimeMs,
    updatedAt: fileStat.mtime.toISOString(),
    nodeCount: parsed.nodes.length,
    edgeCount: parsed.links.length,
    communityCount: new Set(
      parsed.nodes
        .map((node) => node.community)
        .filter((community) => community !== undefined),
    ).size,
    repositoryCounts: countBy(parsed.nodes.map((node) => node.repo)),
    edgeCountByRepository,
    nodeTypes: countBy(parsed.nodes.map((node) => node.file_type)).slice(0, 6),
    relations: countBy(parsed.links.map((link) => link.relation)).slice(0, 6),
  };
  return cachedGraphData;
}

function countBy(values: Array<string | undefined>): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value?.trim() || "unknown";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
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

async function probeGraphify(): Promise<GraphProbe> {
  const start = performance.now();
  const checked = checkedAt();
  const empty: KnowledgeGraphSummary = {
    state: "offline",
    checkedAt: checked,
    updatedAt: null,
    nodeCount: 0,
    edgeCount: 0,
    communityCount: 0,
    projectCount: 0,
    codexIntegrated: false,
    hermesIntegrated: false,
    repositories: [],
    nodeTypes: [],
    relations: [],
  };

  try {
    const [
      graphData,
      codexIntegrated,
      hermesIntegrated,
      localGraphExists,
      catalog,
    ] =
      await Promise.all([
        readGraphData(),
        pathExists(CODEX_GRAPHIFY_SKILL),
        pathExists(HERMES_GRAPHIFY_SKILL),
        pathExists(LOCAL_GRAPH_PATH),
        readProjectCatalog(),
      ]);
    const catalogById = new Map(
      catalog.projects.map((project) => [project.id, project]),
    );
    const repositories: GraphRepositorySummary[] = graphData.repositoryCounts.map(
      ({ label, count }): GraphRepositorySummary => {
        const project = catalogById.get(label);
        return {
          id: label,
          label: project?.name ?? label,
          nodeCount: count,
          edgeCount: graphData.edgeCountByRepository.get(label) ?? 0,
          rootAlias: project?.rootAlias ?? null,
          relativePath: project?.relativePath ?? null,
          hasGit: project?.hasGit ?? null,
          gitScope: project?.gitScope ?? "unknown",
          gitBranch: project?.gitBranch ?? null,
          gitDirty: project?.gitDirty ?? null,
          graphStatus: project?.graphStatus ?? "unknown",
        };
      },
    );
    const registeredIds = new Set(repositories.map((repository) => repository.id));
    for (const project of catalog.projects) {
      if (registeredIds.has(project.id)) continue;
      repositories.push({
        id: project.id,
        label: project.name,
        nodeCount: 0,
        edgeCount: 0,
        rootAlias: project.rootAlias,
        relativePath: project.relativePath,
        hasGit: project.hasGit,
        gitScope: project.gitScope,
        gitBranch: project.gitBranch,
        gitDirty: project.gitDirty,
        graphStatus: project.graphStatus,
      });
    }
    repositories.sort(
      (left, right) =>
        (left.rootAlias ?? "otros").localeCompare(
          right.rootAlias ?? "otros",
          "es",
        ) || left.label.localeCompare(right.label, "es"),
    );
    const failedProjects = repositories.filter(
      (repository) => repository.graphStatus === "failed",
    ).length;
    const graphState: HealthState =
      codexIntegrated &&
      hermesIntegrated &&
      localGraphExists &&
      failedProjects === 0
        ? "healthy"
        : "degraded";
    const graph: KnowledgeGraphSummary = {
      state: graphState,
      checkedAt: checked,
      updatedAt: graphData.updatedAt,
      nodeCount: graphData.nodeCount,
      edgeCount: graphData.edgeCount,
      communityCount: graphData.communityCount,
      projectCount: repositories.length,
      codexIntegrated,
      hermesIntegrated,
      repositories,
      nodeTypes: graphData.nodeTypes,
      relations: graphData.relations,
    };

    return {
      protocol: "Graph JSON local",
      graph,
      service: {
        id: "graphify",
        name: "Graphify",
        role: "Grafo de conocimiento",
        state: graphState,
        detail: `${graph.nodeCount.toLocaleString("es-DO")} nodos · ${graph.edgeCount.toLocaleString("es-DO")} relaciones · ${graph.projectCount} proyectos`,
        latencyMs: latency(start),
        checkedAt: checked,
        metrics: {
          nodes: graph.nodeCount,
          edges: graph.edgeCount,
          projects: graph.projectCount,
          codexIntegrated,
          hermesIntegrated,
        },
      },
    };
  } catch (error) {
    return {
      ...failedProbe(
        "graphify",
        "Graphify",
        "Grafo de conocimiento",
        "Graph JSON local",
        start,
        error,
      ),
      graph: empty,
    };
  }
}

async function probeGpu(): Promise<GpuProbe> {
  const start = performance.now();
  const script = [
    "$samples=(Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage','\\GPU Adapter Memory(*)\\Shared Usage').CounterSamples",
    "$dedicated=@($samples|Where-Object {$_.Path -like '*dedicated usage'}|Sort-Object CookedValue -Descending)[0].CookedValue",
    "$shared=@($samples|Where-Object {$_.Path -like '*shared usage'}|Sort-Object CookedValue -Descending)[0].CookedValue",
    "[pscustomobject]@{dedicatedGiB=[math]::Round($dedicated/1GB,2);sharedGiB=[math]::Round($shared/1GB,2)}|ConvertTo-Json -Compress",
  ].join("; ");
  try {
    const output = await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ]);
    const metrics = z
      .object({ dedicatedGiB: z.number(), sharedGiB: z.number() })
      .parse(JSON.parse(output));
    const state: HealthState = metrics.sharedGiB > 0.25 ? "degraded" : "healthy";
    return {
      protocol: "Windows GPU counters",
      dedicatedUsedGiB: metrics.dedicatedGiB,
      sharedUsedGiB: metrics.sharedGiB,
      service: {
        id: "rx9070",
        name: "Radeon RX 9070",
        role: "Cómputo principal",
        state,
        detail: `${metrics.dedicatedGiB.toFixed(2)} GiB VRAM · ${metrics.sharedGiB.toFixed(2)} GiB compartida`,
        latencyMs: latency(start),
        checkedAt: checkedAt(),
        metrics: {
          dedicatedUsedGiB: metrics.dedicatedGiB,
          sharedUsedGiB: metrics.sharedGiB,
        },
      },
    };
  } catch (error) {
    return {
      ...failedProbe(
        "rx9070",
        "Radeon RX 9070",
        "Cómputo principal",
        "Windows GPU counters",
        start,
        error,
      ),
      dedicatedUsedGiB: null,
      sharedUsedGiB: null,
    };
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

async function probeHermesBroker(): Promise<HermesBrokerProbe> {
  const start = performance.now();
  const checked = checkedAt();
  const empty: HermesDelegationSummary = {
    state: "offline",
    checkedAt: checked,
    totalTasks: 0,
    queuedCount: 0,
    activeCount: 0,
    awaitingReviewCount: 0,
    completedCount: 0,
    failedCount: 0,
    latestTask: null,
  };
  try {
    if (!(await pathExists(HERMES_SUBMIT_SCRIPT))) {
      throw new Error("puente local no instalado");
    }
    let directories: string[] = [];
    try {
      directories = (await readdir(HERMES_JOBS_PATH, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("hermes-"))
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const settled = await Promise.allSettled(
      directories.map(async (directory) => {
        const body = await readFile(
          resolve(HERMES_JOBS_PATH, directory, "status.json"),
          "utf8",
        );
        return hermesTaskSchema.parse(JSON.parse(body.replace(/^\uFEFF/, "")));
      }),
    );
    const tasks: HermesTaskSummary[] = settled
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<z.infer<typeof hermesTaskSchema>> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value)
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      );
    const invalidTaskCount = settled.filter(
      (result) => result.status === "rejected",
    ).length;
    const activeStates = new Set(["preparing", "executing"]);
    const failedStates = new Set(["failed", "blocked", "validation-failed"]);
    const latestTask = tasks[0] ?? null;
    const state: HealthState =
      invalidTaskCount > 0 ||
      (latestTask && failedStates.has(latestTask.state))
        ? "degraded"
        : "healthy";
    const delegation: HermesDelegationSummary = {
      state,
      checkedAt: checked,
      totalTasks: tasks.length,
      queuedCount: tasks.filter((task) => task.state === "queued").length,
      activeCount: tasks.filter((task) => activeStates.has(task.state)).length,
      awaitingReviewCount: tasks.filter(
        (task) => task.state === "awaiting-review",
      ).length,
      completedCount: tasks.filter((task) => task.state === "completed").length,
      failedCount:
        tasks.filter((task) => failedStates.has(task.state)).length +
        invalidTaskCount,
      latestTask,
    };
    return {
      protocol: "Cola JSON local",
      delegation,
      service: {
        id: "hermes-broker",
        name: "Puente Codex → Hermes",
        role: "Delegación local",
        state,
        detail: `${delegation.activeCount} activas · ${delegation.awaitingReviewCount} por revisar · ${delegation.completedCount} validadas`,
        latencyMs: latency(start),
        checkedAt: checked,
        metrics: {
          totalTasks: delegation.totalTasks,
          activeTasks: delegation.activeCount,
          awaitingReview: delegation.awaitingReviewCount,
          completedTasks: delegation.completedCount,
        },
      },
    };
  } catch (error) {
    return {
      ...failedProbe(
        "hermes-broker",
        "Puente Codex → Hermes",
        "Delegación local",
        "Cola JSON local",
        start,
        error,
      ),
      delegation: empty,
    };
  }
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

function buildWorkflow(
  services: ServiceHealth[],
  graph: KnowledgeGraphSummary,
  delegation: HermesDelegationSummary,
  observedAt: string,
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const byId = new Map(services.map((service) => [service.id, service]));
  const stateOf = (id: string): HealthState => byId.get(id)?.state ?? "unknown";
  const hasTaskEvidence = delegation.totalTasks > 0;
  const taskState: HealthState =
    delegation.latestTask &&
    ["failed", "blocked", "validation-failed"].includes(
      delegation.latestTask.state,
    )
      ? "degraded"
      : hasTaskEvidence
        ? "healthy"
        : "unknown";
  const nodes: WorkflowNode[] = [
    {
      id: "operator",
      label: "Operador",
      role: "Entrada",
      detail: "Solicitudes locales",
      state: "healthy",
      kind: "observer",
      x: 7,
      y: 24,
    },
    {
      id: "codex",
      label: "Codex",
      role: "Director y revisor",
      detail: "Diseña, delega y valida",
      state: graph.codexIntegrated ? "healthy" : "degraded",
      kind: "agent",
      x: 22,
      y: 24,
    },
    {
      id: "graphify",
      label: "Graphify",
      role: "Contexto acotado",
      detail: `${graph.nodeCount.toLocaleString("es-DO")} nodos`,
      state: graph.state,
      kind: "graph",
      x: 38,
      y: 12,
    },
    {
      id: "hermes-broker",
      label: "Contrato local",
      role: "Cola controlada",
      detail: `${delegation.activeCount} activas · ${delegation.awaitingReviewCount} revisión`,
      state: delegation.state,
      kind: "queue",
      x: 38,
      y: 48,
    },
    {
      id: "graph-store",
      label: "Grafo global",
      role: "Conocimiento",
      detail: `${graph.projectCount} proyectos indexados`,
      state: graph.state,
      kind: "graph",
      x: 55,
      y: 12,
    },
    {
      id: "hermes",
      label: "Hermes",
      role: "Ejecutor local",
      detail: byId.get("hermes")?.detail ?? "Sin datos",
      state: stateOf("hermes"),
      kind: "agent",
      x: 55,
      y: 48,
    },
    {
      id: "project-catalog",
      label: "Catálogo",
      role: "Proyectos autorizados",
      detail: `${graph.projectCount} proyectos conocidos`,
      state: graph.state,
      kind: "project",
      x: 72,
      y: 12,
    },
    {
      id: "worktree",
      label: "Worktree aislado",
      role: "Edición reversible",
      detail: hasTaskEvidence ? "Parche local capturado" : "En espera",
      state: taskState,
      kind: "workspace",
      x: 72,
      y: 42,
    },
    {
      id: "codex-review",
      label: "Revisión Codex",
      role: "Puerta de calidad",
      detail: delegation.latestTask
        ? `${delegation.latestTask.state} · ${delegation.latestTask.filesChanged} archivos`
        : "Sin tareas recientes",
      state: taskState,
      kind: "review",
      x: 88,
      y: 42,
    },
    {
      id: "lm-studio",
      label: "LM Studio",
      role: "Inferencia local",
      detail: byId.get("lm-studio")?.detail ?? "Sin datos",
      state: stateOf("lm-studio"),
      kind: "model",
      x: 72,
      y: 76,
    },
    {
      id: "rx9070",
      label: "RX 9070",
      role: "GPU + RAM",
      detail: byId.get("rx9070")?.detail ?? "Sin datos",
      state: stateOf("rx9070"),
      kind: "compute",
      x: 88,
      y: 76,
    },
    {
      id: "dashboard",
      label: "TRAMA",
      role: "Observador",
      detail: "Solo estados y métricas",
      state: "healthy",
      kind: "observer",
      x: 7,
      y: 84,
    },
  ];

  const edge = (
    source: string,
    target: string,
    label: string,
    state: HealthState,
    evidence: WorkflowEdge["evidence"],
  ): WorkflowEdge => ({
    id: `${source}-${target}`,
    source,
    target,
    label,
    state,
    evidence,
    lastObservedAt: observedAt,
  });
  const edges: WorkflowEdge[] = [
    edge("operator", "codex", "tarea", "healthy", "configured"),
    edge(
      "codex",
      "graphify",
      "consulta primero",
      graph.codexIntegrated ? "healthy" : "degraded",
      "configured",
    ),
    edge(
      "codex",
      "hermes-broker",
      "delega contrato",
      delegation.state,
      hasTaskEvidence ? "observed" : "configured",
    ),
    edge("graphify", "graph-store", "consulta", graph.state, "observed"),
    edge("graph-store", "project-catalog", "ubica", graph.state, "indexed"),
    edge(
      "hermes-broker",
      "hermes",
      "ejecuta local",
      stateOf("hermes"),
      hasTaskEvidence ? "observed" : "configured",
    ),
    edge(
      "hermes",
      "worktree",
      "crea parche",
      taskState,
      hasTaskEvidence ? "observed" : "configured",
    ),
    edge(
      "worktree",
      "codex-review",
      "diff + evidencia",
      taskState,
      hasTaskEvidence ? "observed" : "configured",
    ),
    edge(
      "codex-review",
      "project-catalog",
      "aplica validado",
      taskState,
      hasTaskEvidence ? "observed" : "configured",
    ),
    edge("hermes", "lm-studio", "OpenAI local", stateOf("lm-studio"), "observed"),
    edge("lm-studio", "rx9070", "capas GPU", stateOf("rx9070"), "observed"),
    edge("dashboard", "graphify", "metadatos", graph.state, "observed"),
    edge(
      "dashboard",
      "hermes-broker",
      "estados",
      delegation.state,
      "observed",
    ),
    edge("dashboard", "lm-studio", "estado REST", stateOf("lm-studio"), "observed"),
  ];
  return { nodes, edges };
}

async function collect(): Promise<TelemetrySnapshot> {
  const [
    lmStudioProbe,
    hermesProbe,
    dockerProbe,
    wslProbe,
    mariadbProbe,
    apacheProbe,
    graphProbe,
    gpuProbe,
    hermesBrokerProbe,
  ] = await Promise.all([
    probeLmStudio(),
    probeHermes(),
    probeDocker(),
    probeWsl(),
    probeTcp("mariadb", "MariaDB", "Datos locales", 3306),
    probeTcp("apache", "Apache", "Aplicaciones XAMPP", 80),
    probeGraphify(),
    probeGpu(),
    probeHermesBroker(),
  ]);
  const probes: Probe[] = [
    lmStudioProbe,
    hermesProbe,
    dockerProbe,
    wslProbe,
    mariadbProbe,
    apacheProbe,
    graphProbe,
    gpuProbe,
    hermesBrokerProbe,
  ];
  const services = probes.map(({ service }) => service);
  updateEvents(services);
  const free = freemem();
  const total = totalmem();
  const generatedAt = checkedAt();
  sequence += 1;
  return {
    generatedAt,
    sequence,
    overallState: services.some((service) => service.state !== "healthy")
      ? "degraded"
      : "healthy",
    services,
    connections: probes.map(connectionFrom),
    events: [...events],
    graph: graphProbe.graph,
    delegation: hermesBrokerProbe.delegation,
    workflow: buildWorkflow(
      services,
      graphProbe.graph,
      hermesBrokerProbe.delegation,
      generatedAt,
    ),
    system: {
      memoryUsedGiB: Number(((total - free) / 1024 ** 3).toFixed(2)),
      memoryTotalGiB: Number((total / 1024 ** 3).toFixed(2)),
      memoryUsagePercent: Number((((total - free) / total) * 100).toFixed(1)),
      uptimeSeconds: Math.round(uptime()),
      gpuDedicatedUsedGiB: gpuProbe.dedicatedUsedGiB,
      gpuSharedUsedGiB: gpuProbe.sharedUsedGiB,
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
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    current = await collect();
    const payload = `event: snapshot\ndata: ${JSON.stringify(current)}\n\n`;
    for (const client of clients) client.write(payload);
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
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
