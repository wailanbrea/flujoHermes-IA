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
  HermesBenchmarkSummary,
  HermesInsightsSummary,
  HermesModelPerformance,
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
const HERMES_BENCHMARK_PATH = resolve(
  WORKSPACE_ROOT,
  "telemetry",
  "runtime",
  "hermes-benchmark.json",
);
const HERMES_INSIGHTS_PATH = resolve(
  WORKSPACE_ROOT,
  "telemetry",
  "runtime",
  "hermes-insights.json",
);
const HERMES_MODEL_REPORT_PATH = resolve(
  WORKSPACE_ROOT,
  "reports",
  "models",
  "hermes-model-comparison.json",
);
const HERMES_SUBMIT_SCRIPT = resolve(
  WORKSPACE_ROOT,
  "scripts",
  "windows",
  "submit-hermes-task.ps1",
);
const CODEX_GRAPHIFY_SKILL = resolve(homedir(), ".codex", "skills", "graphify", "SKILL.md");
const CLAUDE_GLOBAL_RULES = resolve(homedir(), ".claude", "CLAUDE.md");
const ANTIGRAVITY_GLOBAL_RULES = resolve(homedir(), ".gemini", "GEMINI.md");
const OPENCODE_GLOBAL_RULES = resolve(
  homedir(),
  ".config",
  "opencode",
  "AGENTS.md",
);
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
  requestedBy: z
    .enum(["Codex", "Claude", "Antigravity", "OpenCode"])
    .default("Codex"),
  mode: z.enum(["analysis", "execute"]),
  phase: z.enum(["plan", "edit", "browser"]).default("plan"),
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
  lastActivityAt: z.string().nullable().default(null),
  elapsedSeconds: z.number().int().nonnegative().default(0),
  noProgressSeconds: z.number().int().nonnegative().default(0),
  progressKind: z.string().max(40).default("unknown"),
  addedLines: z.number().int().nonnegative().default(0),
  removedLines: z.number().int().nonnegative().default(0),
  patchPolicyPassed: z.boolean().nullable().default(null),
  taskUsageCaptured: z.boolean().default(false),
  localTokens: z.number().int().nonnegative().default(0),
  avoidedGpt56SolCostUsd: z.number().nonnegative().default(0),
  errorCode: z.string().nullable().default(null),
});
const hermesBenchmarkSchema = z.object({
  generatedAt: z.string(),
  model: z.string(),
  gpuOffload: z.number().min(0).max(1),
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  tokensPerSecond: z.number().nonnegative(),
  tests: z.array(
    z.object({
      id: z.string().max(40),
      passed: z.boolean(),
      durationMs: z.number().int().nonnegative(),
      category: z.string().max(40),
    }),
  ),
});
const hermesModelReportSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  primaryModel: z.string(),
  fallbackModel: z.string(),
  models: z.array(
    z.object({
      model: z.string(),
      displayName: z.string(),
      role: z.enum(["primary", "fallback"]),
      contextLength: z.number().int().positive(),
      parallel: z.number().int().positive(),
      gpuOffload: z.string(),
      mtpEnabled: z.boolean(),
      tokensPerSecond: z.number().nonnegative(),
      gpuComputeAveragePercent: z.number().min(0).max(100),
      gpuComputePeakPercent: z.number().min(0).max(100),
      dedicatedMemoryGiB: z.number().nonnegative(),
      sharedMemoryGiB: z.number().nonnegative(),
      fullAgentPassSeconds: z.number().nonnegative(),
    }),
  ),
});
const hermesInsightsSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  days: z.number().int().positive(),
  pricing: z.object({
    referenceModel: z.string(),
    tier: z.string(),
    inputPerMillionUsd: z.number().nonnegative(),
    outputPerMillionUsd: z.number().nonnegative(),
    localInputPerMillionUsd: z.number().nonnegative(),
    localOutputPerMillionUsd: z.number().nonnegative(),
    source: z.string(),
    checkedAt: z.string(),
  }),
  overview: z.object({
    sessions: z.number().int().nonnegative(),
    messages: z.number().int().nonnegative(),
    userMessages: z.number().int().nonnegative(),
    assistantMessages: z.number().int().nonnegative(),
    toolMessages: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    activeHours: z.number().nonnegative(),
    averageSessionSeconds: z.number().nonnegative(),
    averageMessagesPerSession: z.number().nonnegative(),
    avoidedCloudTokens: z.number().int().nonnegative(),
    localCostUsd: z.number().nonnegative(),
    avoidedGpt56SolCostUsd: z.number().nonnegative(),
  }),
  models: z.array(z.object({
    model: z.string(),
    sessions: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
    apiCalls: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    localCostUsd: z.number().nonnegative(),
    avoidedGpt56SolCostUsd: z.number().nonnegative(),
  })),
  platforms: z.array(z.object({
    platform: z.string(),
    sessions: z.number().int().nonnegative(),
    messages: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
  })),
  tools: z.array(z.object({
    tool: z.string(),
    calls: z.number().int().nonnegative(),
    percentage: z.number().min(0).max(100),
  })),
  skills: z.object({
    totalLoads: z.number().int().nonnegative(),
    totalEdits: z.number().int().nonnegative(),
    distinct: z.number().int().nonnegative(),
    top: z.array(z.object({
      skill: z.string(),
      loads: z.number().int().nonnegative(),
      edits: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })),
  }),
  activity: z.object({
    byDay: z.array(z.object({ day: z.string(), count: z.number().int().nonnegative() })),
    byHour: z.array(z.object({ hour: z.number().int().min(0).max(23), count: z.number().int().nonnegative() })),
    busiestDay: z.string(),
    busiestHour: z.number().int().min(0).max(23),
    activeDays: z.number().int().nonnegative(),
    maxStreak: z.number().int().nonnegative(),
  }),
  topSessions: z.array(z.object({
    label: z.string(),
    value: z.string(),
    date: z.string(),
  })),
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
  computePercent: number | null;
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

async function hasGovernanceMarker(path: string): Promise<boolean> {
  try {
    const content = await readFile(path, "utf8");
    return content.includes("<!-- LOCAL_AI_GOVERNANCE:START -->");
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

const emptyHermesBenchmark = (): HermesBenchmarkSummary => ({
  state: "unknown",
  generatedAt: null,
  model: "Sin benchmark",
  gpuOffload: 0,
  total: 0,
  passed: 0,
  tokensPerSecond: 0,
  tests: [],
});

async function readHermesBenchmark(): Promise<HermesBenchmarkSummary> {
  try {
    const body = await readFile(HERMES_BENCHMARK_PATH, "utf8");
    const benchmark = hermesBenchmarkSchema.parse(
      JSON.parse(body.replace(/^\uFEFF/, "")),
    );
    return {
      state: benchmark.total > 0 && benchmark.passed === benchmark.total
        ? "healthy"
        : "degraded",
      ...benchmark,
    };
  } catch {
    return emptyHermesBenchmark();
  }
}

const emptyHermesInsights = (): HermesInsightsSummary => ({
  state: "unknown",
  generatedAt: null,
  days: 0,
  pricing: {
    referenceModel: "gpt-5.6-sol",
    tier: "standard-short-context",
    inputPerMillionUsd: 5,
    outputPerMillionUsd: 30,
    localInputPerMillionUsd: 0,
    localOutputPerMillionUsd: 0,
    source: "https://developers.openai.com/api/docs/pricing",
    checkedAt: "2026-07-28",
  },
  overview: {
    sessions: 0,
    messages: 0,
    userMessages: 0,
    assistantMessages: 0,
    toolMessages: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    activeHours: 0,
    averageSessionSeconds: 0,
    averageMessagesPerSession: 0,
    avoidedCloudTokens: 0,
    localCostUsd: 0,
    avoidedGpt56SolCostUsd: 0,
  },
  models: [],
  platforms: [],
  tools: [],
  skills: { totalLoads: 0, totalEdits: 0, distinct: 0, top: [] },
  activity: {
    byDay: [],
    byHour: [],
    busiestDay: "",
    busiestHour: 0,
    activeDays: 0,
    maxStreak: 0,
  },
  topSessions: [],
});

async function readHermesInsights(): Promise<HermesInsightsSummary> {
  try {
    const body = await readFile(HERMES_INSIGHTS_PATH, "utf8");
    return {
      state: "healthy",
      ...hermesInsightsSchema.parse(JSON.parse(body.replace(/^\uFEFF/, ""))),
    };
  } catch {
    return emptyHermesInsights();
  }
}

async function readHermesModelPerformance(): Promise<HermesModelPerformance[]> {
  try {
    const body = await readFile(HERMES_MODEL_REPORT_PATH, "utf8");
    return hermesModelReportSchema.parse(
      JSON.parse(body.replace(/^\uFEFF/, "")),
    ).models;
  } catch {
    return [];
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
    const configValue = (key: string) =>
      run("hermes.exe", ["--profile", "localai", "config", "get", key]);
    const [model, provider, fallbackModel, fallbackProvider] = await Promise.all([
      configValue("model.default"),
      configValue("model.provider"),
      configValue("fallback_model.model"),
      configValue("fallback_model.provider"),
    ]);
    const valid =
      provider === "lmstudio" &&
      model === "google/gemma-4-12b" &&
      fallbackProvider === "lmstudio" &&
      fallbackModel === "qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive";
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
        metrics: { profileIsolated: true, provider, model, fallbackModel },
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
    claudeIntegrated: false,
    antigravityIntegrated: false,
    openCodeIntegrated: false,
    hermesIntegrated: false,
    repositories: [],
    nodeTypes: [],
    relations: [],
  };

  try {
    const [
      graphData,
      codexIntegrated,
      claudeIntegrated,
      antigravityIntegrated,
      openCodeIntegrated,
      hermesIntegrated,
      localGraphExists,
      catalog,
    ] =
      await Promise.all([
        readGraphData(),
        pathExists(CODEX_GRAPHIFY_SKILL),
        hasGovernanceMarker(CLAUDE_GLOBAL_RULES),
        hasGovernanceMarker(ANTIGRAVITY_GLOBAL_RULES),
        hasGovernanceMarker(OPENCODE_GLOBAL_RULES),
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
      claudeIntegrated &&
      antigravityIntegrated &&
      openCodeIntegrated &&
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
      claudeIntegrated,
      antigravityIntegrated,
      openCodeIntegrated,
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
          claudeIntegrated,
          antigravityIntegrated,
          openCodeIntegrated,
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
    "$samples=(Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage','\\GPU Adapter Memory(*)\\Shared Usage','\\GPU Engine(*engtype_Compute*)\\Utilization Percentage').CounterSamples",
    "$dedicated=@($samples|Where-Object {$_.Path -like '*dedicated usage'}|Sort-Object CookedValue -Descending)[0].CookedValue",
    "$shared=@($samples|Where-Object {$_.Path -like '*shared usage'}|Sort-Object CookedValue -Descending)[0].CookedValue",
    "$computeSample=@($samples|Where-Object {$_.Path -like '*engtype_compute*'}|Sort-Object CookedValue -Descending)[0]",
    "$compute=if($computeSample){$computeSample.CookedValue}else{0}",
    "[pscustomobject]@{dedicatedGiB=[math]::Round($dedicated/1GB,2);sharedGiB=[math]::Round($shared/1GB,2);computePercent=[math]::Round($compute,1)}|ConvertTo-Json -Compress",
  ].join("; ");
  try {
    const output = await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ]);
    const metrics = z
      .object({
        dedicatedGiB: z.number(),
        sharedGiB: z.number(),
        computePercent: z.number(),
      })
      .parse(JSON.parse(output));
    const state: HealthState = metrics.sharedGiB > 0.75 ? "degraded" : "healthy";
    return {
      protocol: "Windows GPU counters",
      dedicatedUsedGiB: metrics.dedicatedGiB,
      sharedUsedGiB: metrics.sharedGiB,
      computePercent: metrics.computePercent,
      service: {
        id: "rx9070",
        name: "Radeon RX 9070",
        role: "Cómputo principal",
        state,
        detail: `${metrics.computePercent.toFixed(1)}% compute · ${metrics.dedicatedGiB.toFixed(2)} GiB VRAM · ${metrics.sharedGiB.toFixed(2)} GiB compartida`,
        latencyMs: latency(start),
        checkedAt: checkedAt(),
        metrics: {
          dedicatedUsedGiB: metrics.dedicatedGiB,
          sharedUsedGiB: metrics.sharedGiB,
          computePercent: metrics.computePercent,
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
      computePercent: null,
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
    benchmark: emptyHermesBenchmark(),
    modelPerformance: [],
    insights: emptyHermesInsights(),
    efficiency: {
      capturedTasks: 0,
      localTokens: 0,
      avoidedGpt56SolCostUsd: 0,
      reviewedTasks: 0,
      acceptedTasks: 0,
      acceptanceRate: 0,
      schemaFailures: 0,
    },
  };
  try {
    if (!(await pathExists(HERMES_SUBMIT_SCRIPT))) {
      throw new Error("puente local no instalado");
    }
    const [benchmark, modelPerformance, insights] = await Promise.all([
      readHermesBenchmark(),
      readHermesModelPerformance(),
      readHermesInsights(),
    ]);
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
    const reviewedTasks = tasks.filter((task) =>
      ["completed", "rejected", "validation-failed"].includes(task.state),
    );
    const acceptedTasks = reviewedTasks.filter(
      (task) => task.state === "completed",
    ).length;
    const capturedTasks = tasks.filter((task) => task.taskUsageCaptured);
    const efficiency = {
      capturedTasks: capturedTasks.length,
      localTokens: capturedTasks.reduce((sum, task) => sum + task.localTokens, 0),
      avoidedGpt56SolCostUsd: Number(
        capturedTasks
          .reduce((sum, task) => sum + task.avoidedGpt56SolCostUsd, 0)
          .toFixed(6),
      ),
      reviewedTasks: reviewedTasks.length,
      acceptedTasks,
      acceptanceRate: reviewedTasks.length
        ? Number(((acceptedTasks / reviewedTasks.length) * 100).toFixed(1))
        : 0,
      schemaFailures: tasks.filter((task) =>
        /schema|tool_call|missing required argument/i.test(task.errorCode ?? ""),
      ).length,
    };
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
      benchmark,
      modelPerformance,
      insights,
      efficiency,
    };
    return {
      protocol: "Cola JSON local",
      delegation,
      service: {
        id: "hermes-broker",
        name: "Puente IA → Hermes",
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
          benchmarkPassed: benchmark.passed,
          benchmarkTotal: benchmark.total,
          tokensPerSecond: benchmark.tokensPerSecond,
          totalTokens: insights.overview.totalTokens,
          avoidedGpt56SolCostUsd: insights.overview.avoidedGpt56SolCostUsd,
          delegatedLocalTokens: efficiency.localTokens,
          delegatedAvoidedCostUsd: efficiency.avoidedGpt56SolCostUsd,
          acceptanceRate: efficiency.acceptanceRate,
        },
      },
    };
  } catch (error) {
    return {
      ...failedProbe(
        "hermes-broker",
        "Puente IA → Hermes",
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
  const directorsIntegrated =
    graph.codexIntegrated &&
    graph.claudeIntegrated &&
    graph.antigravityIntegrated &&
    graph.openCodeIntegrated;
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
      id: "directors",
      label: "Directores IA",
      role: "Dirección y revisión",
      detail: "Codex · Claude · Antigravity · OpenCode",
      state: directorsIntegrated ? "healthy" : "degraded",
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
      id: "director-review",
      label: "Revisión del director",
      role: "Puerta de calidad",
      detail: delegation.latestTask
        ? `${delegation.latestTask.requestedBy} · ${delegation.latestTask.state} · ${delegation.latestTask.filesChanged} archivos`
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
    edge("operator", "directors", "tarea", "healthy", "configured"),
    edge(
      "directors",
      "graphify",
      "consulta primero",
      directorsIntegrated ? "healthy" : "degraded",
      "configured",
    ),
    edge(
      "directors",
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
      "director-review",
      "diff + evidencia",
      taskState,
      hasTaskEvidence ? "observed" : "configured",
    ),
    edge(
      "director-review",
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
      gpuComputePercent: gpuProbe.computePercent,
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
