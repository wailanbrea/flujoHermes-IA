import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { mkdirSync, watch, type FSWatcher } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { freemem, homedir, hostname, totalmem, uptime } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { WORKFLOW_STAGES } from "../lib/telemetry";
import type {
  BrainSummary,
  ConnectionHealth,
  GraphRepositorySummary,
  HealthState,
  HermesDelegationSummary,
  HermesBenchmarkSummary,
  HermesInsightsSummary,
  HermesModelPerformance,
  HermesTaskSummary,
  KnowledgeGraphSummary,
  PromptBudgetSummary,
  ServiceHealth,
  TelemetryEvent,
  TelemetrySnapshot,
  WorkflowEdge,
  WorkflowExecutionSummary,
  WorkflowNode,
  WorkflowStageId,
} from "../lib/telemetry";

const execFileAsync = promisify(execFile);
const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.TELEMETRY_PORT ?? "4311", 10);
const INTERVAL_MS = 15000;
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
const HERMES_BRAIN_STATUS_PATH = resolve(
  WORKSPACE_ROOT,
  "telemetry",
  "runtime",
  "hermes-brain-status.json",
);
const HERMES_PROMPT_BUDGET_PATH = resolve(
  WORKSPACE_ROOT,
  "telemetry",
  "runtime",
  "hermes-prompt-budget.json",
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
// El gateway de Hermes publica aquí el estado ya saneado de cada canal. TRAMA lo
// lee en vez de exigir TELEGRAM_BOT_TOKEN: la política dice que el observador
// recibe estados, nunca secretos, y este archivo además refleja la conexión real
// en vez de limitarse a comprobar que una variable exista.
const HERMES_GATEWAY_STATE = resolve(
  homedir(),
  "AppData",
  "Local",
  "hermes",
  "gateway_state.json",
);
const allowedOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1):(?:3000|4310)$/;
const healthStateSchema = z.enum(["healthy", "degraded", "offline", "unknown"]);
const brainTaskSchema = z.object({
  taskId: z.string(),
  projectName: z.string(),
  requestedBy: z.enum(["Codex", "Claude", "Antigravity", "OpenCode"]).default("Codex"),
  state: z.string(),
  updatedAt: z.string(),
  filesChanged: z.number().int().nonnegative().optional(),
  patchBytes: z.number().int().nonnegative().optional(),
  stale: z.boolean().optional(),
});
const brainStatusSchema = z.object({
  brain: z.object({
    state: healthStateSchema,
    version: z.number().int().positive(),
    memory: z.object({
      state: healthStateSchema,
      graphNodes: z.number().int().nonnegative(),
      graphEdges: z.number().int().nonnegative(),
      policy: z.string(),
    }),
    router: z.object({
      state: healthStateSchema,
      routes: z.array(z.object({
        capability: z.string(),
        profile: z.string(),
        executor: z.string(),
        fallback: z.string(),
      })),
      localOptional: z.boolean(),
      enforced: z.boolean(),
    }),
    agents: z.object({
      state: healthStateSchema,
      profiles: z.array(z.string()),
      operatorCount: z.number().int().nonnegative(),
      advisoryCount: z.number().int().nonnegative(),
      advisoryOnly: z.boolean(),
    }),
    skills: z.object({
      state: healthStateSchema,
      configured: z.array(z.string()),
      installed: z.array(z.string()),
      roleAware: z.boolean(),
      profiles: z.array(z.object({
        profileId: z.string(),
        runtimeId: z.string(),
        configured: z.number().int().nonnegative(),
        present: z.number().int().nonnegative(),
        missing: z.array(z.string()),
        writeApproval: z.boolean(),
        state: healthStateSchema,
      })),
    }),
    learning: z.object({
      state: healthStateSchema,
      promotionState: healthStateSchema,
      pendingApproval: z.number().int().nonnegative(),
      counts: z.record(z.string(), z.number().int().nonnegative()),
      last: z.record(z.string(), z.unknown()).nullable(),
    }),
    sandbox: z.object({
      state: healthStateSchema,
      counts: z.record(z.string(), z.number().int().nonnegative()),
      staleCount: z.number().int().nonnegative(),
      active: z.array(brainTaskSchema),
    }),
    lastValidatedOutcome: brainTaskSchema.nullable(),
    curator: z.object({
      state: healthStateSchema,
      consolidation: z.string().optional(),
    }),
    kanban: z.object({
      state: healthStateSchema,
      manualDecomposition: z.boolean().optional(),
    }),
    moa: z.object({
      state: healthStateSchema,
      active: z.boolean().optional(),
      optional: z.boolean().optional(),
    }),
  }),
});
const promptBudgetSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  state: healthStateSchema,
  estimation: z.literal("bytes-divided-by-four"),
  summary: z.object({
    configuredProfiles: z.number().int().nonnegative(),
    availableProfiles: z.number().int().nonnegative(),
    minimumEstimatedTokens: z.number().int().nonnegative(),
    maximumEstimatedTokens: z.number().int().nonnegative(),
  }),
  profiles: z.array(z.object({
    profile: z.string(),
    mode: z.string(),
    state: z.enum(["healthy", "unavailable"]),
    model: z.string().nullable(),
    tools: z.number().int().nonnegative(),
    systemPromptBytes: z.number().int().nonnegative(),
    skillsIndexBytes: z.number().int().nonnegative(),
    toolSchemaBytes: z.number().int().nonnegative(),
    totalFixedBytes: z.number().int().nonnegative(),
    estimatedFixedTokens: z.number().int().nonnegative(),
  })),
});
const lmSchema = z.object({
  models: z.array(
    z.object({
      key: z.string(),
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
  state: z.preprocess(
    (value) => (value === "rejected" ? "blocked" : value),
    z.enum([
      "isolated",
      "editing",
      "sealed",
      "queued",
      "preparing",
      "executing",
      "awaiting-review",
      "validating",
      "applied-cleanup-pending",
      "completed",
      "failed",
      "blocked",
      "validation-failed",
    ]),
  ),
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
  errorCode: z
    .string()
    .nullable()
    .default(null)
    .transform((value) =>
      value &&
      [
        "correction-attempts-exhausted",
        "patch-check-failed",
        "no-progress",
        "execution-timeout",
        "patch-policy-failed",
        "hermes-exit-nonzero",
        "worker-failed",
      ].includes(value)
        ? value
        : value
          ? "legacy-failure"
          : null,
    ),
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
let hermesWatcher: FSWatcher | null = null;
let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let fullRefreshInterval: ReturnType<typeof setInterval> | null = null;
let brokerRefreshPromise: Promise<void> | null = null;
let fullRefreshCount = 0;
let scheduledFullRefreshCount = 0;
let brokerRefreshCount = 0;
const LINE_FEED = String.fromCharCode(10);

function materialSnapshot(snapshot: TelemetrySnapshot): string {
  const { checkedAt: _graphCheckedAt, ...graph } = snapshot.graph;
  const { checkedAt: _delegationCheckedAt, ...delegation } = snapshot.delegation;
  const { observedAt: _executionObservedAt, ...execution } = snapshot.execution;
  return JSON.stringify({
    overallState: snapshot.overallState,
    services: snapshot.services.map(({ checkedAt: _checkedAt, latencyMs: _latency, ...service }) => service),
    connections: snapshot.connections.map(
      ({ latencyMs: _latency, successfulChecks: _success, failedChecks: _failure, ...connection }) =>
        connection,
    ),
    events: snapshot.events,
    graph,
    brain: snapshot.brain,
    promptBudget: snapshot.promptBudget,
    delegation,
    execution,
    workflow: {
      nodes: snapshot.workflow.nodes,
      edges: snapshot.workflow.edges.map(({ lastObservedAt: _observedAt, ...edge }) => edge),
    },
    system: {
      ...snapshot.system,
      uptimeSeconds: 0,
    },
    privacy: snapshot.privacy,
  });
}

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

const emptyBrain = (): BrainSummary => ({
  state: "unknown",
  version: 1,
  memory: {
    state: "unknown",
    graphNodes: 0,
    graphEdges: 0,
    policy: "validated-and-sanitized-only",
  },
  router: {
    state: "unknown",
    routes: [],
    localOptional: true,
    enforced: false,
  },
  agents: {
    state: "unknown",
    profiles: [],
    operatorCount: 0,
    advisoryCount: 0,
    advisoryOnly: true,
  },
  skills: {
    state: "unknown",
    configured: [],
    installed: [],
    roleAware: true,
    profiles: [],
  },
  learning: {
    state: "unknown",
    promotionState: "unknown",
    pendingApproval: 0,
    counts: {},
    last: null,
  },
  sandbox: { state: "unknown", counts: {}, staleCount: 0, active: [] },
  lastValidatedOutcome: null,
  curator: { state: "unknown" },
  kanban: { state: "unknown", manualDecomposition: true },
  moa: { state: "unknown", optional: true },
});

async function readBrainStatus(): Promise<BrainSummary> {
  try {
    const body = await readFile(HERMES_BRAIN_STATUS_PATH, "utf8");
    return brainStatusSchema.parse(JSON.parse(body.replace(/^\uFEFF/, ""))).brain;
  } catch {
    return emptyBrain();
  }
}

const emptyPromptBudget = (): PromptBudgetSummary => ({
  state: "unknown",
  generatedAt: null,
  estimation: "bytes-divided-by-four",
  summary: {
    configuredProfiles: 0,
    availableProfiles: 0,
    minimumEstimatedTokens: 0,
    maximumEstimatedTokens: 0,
  },
  profiles: [],
});

async function readPromptBudget(): Promise<PromptBudgetSummary> {
  try {
    const body = await readFile(HERMES_PROMPT_BUDGET_PATH, "utf8");
    const { schemaVersion: _schemaVersion, ...budget } =
      promptBudgetSchema.parse(JSON.parse(body.replace(/^\uFEFF/, "")));
    return budget;
  } catch {
    return emptyPromptBudget();
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
    const activeKey = active?.model.key.toLowerCase() ?? "";
    const approvedModel = new Set([
      "google/gemma-4-12b-qat",
      "agents-a1-4b",
      "qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive",
    ]).has(activeKey);
    const approvedPreset =
      loaded.length === 1 &&
      approvedModel &&
      active?.instance.config.context_length === 65_536 &&
      active.instance.config.parallel === 4;
    return {
      protocol: "HTTP / REST",
      service: {
        id: "lm-studio",
        name: "LM Studio",
        role: "Inferencia local",
        state: approvedPreset ? "healthy" : "degraded",
        detail: active
          ? `${active.model.display_name} · ${(active.instance.config.context_length / 1024).toFixed(0)}K contexto`
          : "Servidor activo, sin modelo cargado",
        latencyMs: latency(start),
        checkedAt: checkedAt(),
        metrics: {
          loadedModels: loaded.length,
          contextTokens: active?.instance.config.context_length ?? 0,
          parallelSlots: active?.instance.config.parallel ?? 0,
          approvedModel,
          approvedPreset,
          residencyPolicy: activeKey === "qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive"
            ? "manual-ttl-900"
            : "primary-resident",
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
      model === "google/gemma-4-12b-qat" &&
      fallbackProvider === "lmstudio" &&
      fallbackModel === "google/gemma-4-12b-qat";
    return {
      protocol: "CLI / OpenAI API",
      service: {
        id: "hermes",
        name: "Hermes Agent",
        role: "Asesoría local opcional",
        state: valid ? "healthy" : "degraded",
        detail: valid
          ? "Perfil localai advisory · Gemma 4 12B QAT"
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
    const memoryPressure =
      metrics.sharedGiB > 2 || metrics.dedicatedGiB > 15.5;
    const activity = metrics.computePercent >= 1 ? "busy" : "idle";
    const state: HealthState = memoryPressure ? "degraded" : "healthy";
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
        detail: `${activity} · ${metrics.computePercent.toFixed(1)}% compute · ${metrics.dedicatedGiB.toFixed(2)}/16 GiB VRAM · ${metrics.sharedGiB.toFixed(2)} GiB compartida`,
        latencyMs: latency(start),
        checkedAt: checkedAt(),
        metrics: {
          dedicatedUsedGiB: metrics.dedicatedGiB,
          sharedUsedGiB: metrics.sharedGiB,
          computePercent: metrics.computePercent,
          activity,
          memoryPressure,
          approvedSharedBaselineGiB: 1.16,
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

async function probeRtk(): Promise<Probe> {
  const start = performance.now();
  try {
    const [versionOutput, gainOutput] = await Promise.all([
      run("rtk.exe", ["--version"]),
      run("rtk.exe", ["gain", "--all", "--format", "json"]),
    ]);
    const gain = z.object({
      summary: z.object({
        total_commands: z.number().int().nonnegative(),
        total_saved: z.number().int().nonnegative(),
        avg_savings_pct: z.number().nonnegative(),
      }),
    }).parse(JSON.parse(gainOutput));
    return {
      protocol: "RTK local analytics",
      service: {
        id: "rtk",
        name: "RTK",
        role: "Compresión de terminal",
        state: "healthy",
        detail: `${gain.summary.total_commands} comandos · ${gain.summary.total_saved.toLocaleString("es-DO")} tokens evitados`,
        latencyMs: latency(start),
        checkedAt: checkedAt(),
        metrics: {
          version: versionOutput.trim(),
          totalCommands: gain.summary.total_commands,
          totalSavedTokens: gain.summary.total_saved,
          averageSavingsPercent: gain.summary.avg_savings_pct,
        },
      },
    };
  } catch (error) {
    return failedProbe(
      "rtk",
      "RTK",
      "Compresión de terminal",
      "RTK local analytics",
      start,
      error,
    );
  }
}


async function probeTelegram(): Promise<Probe> {
  const start = performance.now();
  const checked = checkedAt();

  let state: HealthState = "unknown";
  let detail = "Gateway de Hermes sin estado publicado";
  let reported = "unknown";
  let activeAgents = 0;
  let busy = false;

  try {
    const raw = await readFile(HERMES_GATEWAY_STATE, "utf8");
    const parsed: unknown = JSON.parse(raw);
    const root =
      parsed && typeof parsed === "object"
        ? (parsed as {
            platforms?: Record<string, { state?: unknown }>;
            gateway_state?: unknown;
            active_agents?: unknown;
          })
        : undefined;
    const telegram = root?.platforms?.telegram;
    if (telegram && typeof telegram.state === "string") {
      reported = telegram.state;
      // El gateway distingue connecting/disconnected de un fallo real, así que
      // 'degraded' se reserva para cuando está configurado pero no operativo.
      state =
        reported === "connected"
          ? "healthy"
          : reported === "connecting"
            ? "degraded"
            : "offline";
    }
    // active_agents es del gateway completo, no por plataforma. Con Telegram
    // como único canal configurado, un agente activo es atribuible a él; si
    // algún día se añade otro canal, este dato dejará de ser exclusivo suyo.
    if (typeof root?.active_agents === "number") {
      activeAgents = root.active_agents;
    }
    busy =
      root?.gateway_state === "running" && activeAgents > 0 && state === "healthy";
    detail =
      state !== "healthy"
        ? `Canal no operativo (${reported})`
        : busy
          ? `Atendiendo ${activeAgents} petición(es) ahora`
          : "Canal conectado · en espera";
  } catch {
    // Sin gateway instalado o sin permisos: se reporta como desconocido en vez
    // de afirmar que el canal está caído.
    state = "unknown";
    detail = "Estado del gateway no disponible";
  }

  return {
    protocol: "Telegram Bot API",
    service: {
      id: "telegram",
      name: "Telegram",
      role: "Canal de chat",
      state,
      detail,
      latencyMs: latency(start),
      checkedAt: checked,
      metrics: { reported, activeAgents, busy },
    },
  };
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
    historyState: "unknown",
    checkedAt: checked,
    totalTasks: 0,
    invalidTaskCount: 0,
    staleActiveCount: 0,
    queuedCount: 0,
    activeCount: 0,
    awaitingReviewCount: 0,
    completedCount: 0,
    failedCount: 0,
    latestTask: null,
    focusTask: null,
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
    const activeStates = new Set([
      "isolated",
      "editing",
      "sealed",
      "validating",
      "applied-cleanup-pending",
      "preparing",
      "executing",
    ]);
    const waitingStates = new Set(["queued", "awaiting-review"]);
    const failedStates = new Set(["failed", "blocked", "validation-failed"]);
    const latestTask = tasks[0] ?? null;
    const staleCutoff = Date.now() - 2 * 60 * 60 * 1000;
    const focusTask =
      tasks.find(
        (task) =>
          (activeStates.has(task.state) || waitingStates.has(task.state)) &&
          Date.parse(task.updatedAt) >= staleCutoff,
      ) ?? latestTask;
    const state: HealthState = "healthy";
    const historyState: HealthState =
      invalidTaskCount > 0 ||
      (latestTask && failedStates.has(latestTask.state))
        ? "degraded"
        : "healthy";
    const staleActiveCount = tasks.filter(
      (task) =>
        activeStates.has(task.state) &&
        Date.parse(task.updatedAt) < staleCutoff,
    ).length;
    const reviewedTasks = tasks.filter((task) =>
      ["completed", "blocked", "validation-failed"].includes(task.state),
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
      historyState,
      checkedAt: checked,
      totalTasks: directories.length,
      invalidTaskCount,
      staleActiveCount,
      queuedCount: tasks.filter((task) => task.state === "queued").length,
      activeCount: tasks.filter(
        (task) =>
          activeStates.has(task.state) &&
          Date.parse(task.updatedAt) >= staleCutoff,
      ).length,
      awaitingReviewCount: tasks.filter(
        (task) => ["sealed", "awaiting-review"].includes(task.state),
      ).length,
      completedCount: tasks.filter((task) => task.state === "completed").length,
      failedCount: tasks.filter((task) => failedStates.has(task.state)).length,
      latestTask,
      focusTask,
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
          invalidTasks: delegation.invalidTaskCount,
          staleActiveTasks: delegation.staleActiveCount,
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

function buildBrainWorkflow(
  brain: BrainSummary,
  execution: WorkflowExecutionSummary,
  openClawState: HealthState,
  telegramState: HealthState,
  observedAt: string,
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const latest = brain.lastValidatedOutcome;
  const status = brain.state;
  const executionState: HealthState =
    execution.taskState &&
    ["failed", "blocked", "validation-failed"].includes(execution.taskState)
      ? "degraded"
      : execution.mode === "idle"
        ? "unknown"
        : status;
  const nodes: WorkflowNode[] = [
    { id: "user", label: "Usuario", role: "Solicitud", detail: "Objetivo, alcance y límites", state: "healthy", kind: "user", stageId: "input", x: 390, y: 10, width: 220, height: 38 },
    { id: "telegram", label: "Telegram Gateway", role: "Canal de chat", detail: "Gateway de Hermes; sin autoridad de integración", state: telegramState, kind: "interface", stageId: "input", x: 390, y: 64, width: 220, height: 42 },
    { id: "brain", label: "HERMES BRAIN", role: "Plano de control persistente", detail: "Coordina memoria, políticas, ejecución y aprendizaje", state: status, kind: "control", stageId: "brain", x: 350, y: 122, width: 300, height: 52 },
    { id: "memory", label: "Memoria y Graphify", role: "Recuperación estructural", detail: `${brain.memory.graphNodes} nodos · conocimiento saneado`, state: brain.memory.state, kind: "memory", stageId: "routing", x: 60, y: 216, width: 230, height: 48 },
    { id: "router", label: "Model Router", role: "Selección por capacidad", detail: `${brain.router.routes.length} rutas · fallback cloud`, state: brain.router.state, kind: "router", stageId: "routing", x: 385, y: 216, width: 230, height: 48 },
    { id: "agents", label: "Agent Factory", role: "Especialistas reemplazables", detail: `${brain.agents.operatorCount} operador · ${brain.agents.advisoryCount} asesores`, state: brain.agents.state, kind: "factory", stageId: "routing", x: 710, y: 216, width: 230, height: 48 },
    { id: "plan", label: "Plan y políticas", role: "Decisión verificable", detail: "Alcance, permisos y criterios de salida", state: status, kind: "policy", stageId: "context", x: 365, y: 302, width: 270, height: 46 },
    { id: "execution-gateway", label: "Execution Gateway", role: "Control de ejecución", detail: "Allowlist, task ID y permisos", state: brain.sandbox.state, kind: "gateway", stageId: "plan", x: 350, y: 380, width: 300, height: 50 },
    { id: "code-sandbox", label: "Sandbox de código", role: "Worktree aislado", detail: `${brain.sandbox.active.length} tareas activas`, state: brain.sandbox.state, kind: "executor", stageId: "sandbox", x: 60, y: 470, width: 230, height: 48 },
    { id: "playwright", label: "Playwright", role: "Validación en navegador", detail: "Navegador real bajo alcance", state: brain.sandbox.state, kind: "executor", stageId: "sandbox", x: 385, y: 470, width: 230, height: 48 },
    { id: "automations", label: "Automatizaciones", role: "Operaciones controladas", detail: "Acciones explícitas y acotadas", state: brain.sandbox.state, kind: "executor", stageId: "sandbox", x: 710, y: 470, width: 230, height: 48 },
    { id: "evidence", label: "Tests · Evidencia · Aprobación", role: "Puerta determinista", detail: "LF · SHA-256 · allowlist · validación independiente", state: executionState, kind: "validation", stageId: "evidence", x: 330, y: 554, width: 340, height: 48 },
    { id: "validated", label: "Resultado validado", role: "Integración única", detail: latest ? `${latest.projectName} · ${latest.state}` : "Integración verificada", state: "healthy", kind: "result", stageId: "validated", x: 385, y: 628, width: 230, height: 44 },
    { id: "learning", label: "Learning Engine", role: "Después de completar", detail: `${brain.learning.counts.candidate ?? 0} candidatas`, state: brain.learning.state, kind: "learning", stageId: "learning", x: 385, y: 694, width: 230, height: 42 },
    { id: "promotion", label: "Memoria · Skill · Benchmark", role: "Promoción controlada", detail: "Benchmark y aprobación explícita", state: brain.learning.promotionState, kind: "learning", stageId: "promotion", x: 350, y: 752, width: 300, height: 24 },
    { id: "trama", label: "TRAMA", role: "Observador lateral", detail: "SSE read-only · sin autoridad", state: "healthy", kind: "observer", stageId: "brain", x: 60, y: 122, width: 210, height: 52 },
  ];
  const observedThrough = execution.mode === "idle" ? -1 : execution.stageIndex;
  const evidenceFor = (stageId: WorkflowStageId): WorkflowEdge["evidence"] =>
    WORKFLOW_STAGES.findIndex((stage) => stage.id === stageId) <= observedThrough
      ? "observed"
      : "configured";
  const link = (
    source: string,
    target: string,
    label: string,
    stageId: WorkflowStageId,
    state: HealthState = status,
    evidence: WorkflowEdge["evidence"] = evidenceFor(stageId),
  ): WorkflowEdge => ({
    id: `${source}-${target}`,
    source,
    target,
    label,
    state,
    evidence,
    stageId,
    lastObservedAt: observedAt,
  });
  return {
    nodes,
    edges: [
      link("user", "telegram", "Solicita", "input"),
      link("telegram", "brain", "Mensaje saneado", "brain", telegramState),
      link("brain", "memory", "Recupera", "routing", brain.memory.state),
      link("brain", "router", "Enruta", "routing", brain.router.state),
      link("brain", "agents", "Selecciona", "routing", brain.agents.state),
      link("memory", "plan", "Contexto", "context", brain.memory.state),
      link("router", "plan", "Capacidad", "context", brain.router.state),
      link("agents", "plan", "Briefs", "context", brain.agents.state),
      link("plan", "execution-gateway", "Autoriza alcance", "plan"),
      link("execution-gateway", "code-sandbox", "Código", "sandbox", brain.sandbox.state),
      link("execution-gateway", "playwright", "Navegador", "sandbox", brain.sandbox.state, "configured"),
      link("execution-gateway", "automations", "Operaciones", "sandbox", brain.sandbox.state, "configured"),
      link("code-sandbox", "evidence", "Diff y tests", "evidence", executionState),
      link("playwright", "evidence", "Evidencia visual", "evidence", executionState, "configured"),
      link("automations", "evidence", "Registro", "evidence", executionState, "configured"),
      link("evidence", "validated", "Completa", "validated", executionState),
      link("validated", "learning", "Sanea", "learning", brain.learning.state),
      link("learning", "promotion", "Evalúa", "promotion", brain.learning.promotionState),
      link("brain", "trama", "Telemetría read-only", "brain", "healthy"),
    ],
  };
}
function buildWorkflowExecution(
  delegation: HermesDelegationSummary,
  brain: BrainSummary,
  observedAt: string,
): WorkflowExecutionSummary {
  const task = delegation.focusTask;
  if (!task) {
    return {
      mode: "idle",
      stageId: "input",
      stageIndex: 0,
      label: WORKFLOW_STAGES[0].label,
      observedAt,
      taskId: null,
      projectName: null,
      requestedBy: null,
      taskState: null,
      progressKind: null,
      terminal: false,
    };
  }

  const terminalStates = new Set(["completed", "failed", "blocked", "validation-failed"]);
  const waitingStates = new Set(["queued", "sealed", "awaiting-review"]);
  const learning = brain.learning.last;
  const learningMatches =
    typeof learning?.task_id === "string" && learning.task_id === task.taskId;
  const benchmark = learningMatches ? learning?.benchmark_result : null;
  const benchmarkApproved =
    typeof benchmark === "object" &&
    benchmark !== null &&
    "approved" in benchmark &&
    benchmark.approved === true;
  const learningState = learningMatches && typeof learning?.state === "string"
    ? learning.state
    : null;

  let stageId: WorkflowExecutionSummary["stageId"];
  if (task.state === "completed" && (learningState === "promoted" || benchmarkApproved)) {
    stageId = "promotion";
  } else if (task.state === "completed" && learningMatches) {
    stageId = "learning";
  } else {
    stageId = {
      queued: "input",
      preparing: "routing",
      isolated: "sandbox",
      editing: "sandbox",
      executing: "sandbox",
      sealed: "evidence",
      "awaiting-review": "evidence",
      validating: "evidence",
      "validation-failed": "evidence",
      failed: "evidence",
      blocked: "evidence",
      "applied-cleanup-pending": "validated",
      completed: "validated",
    }[task.state] as WorkflowExecutionSummary["stageId"] | undefined ?? "brain";
  }
  const stageIndex = WORKFLOW_STAGES.findIndex((stage) => stage.id === stageId);

  return {
    mode: terminalStates.has(task.state)
      ? "last"
      : waitingStates.has(task.state)
        ? "waiting"
        : "live",
    stageId,
    stageIndex,
    label: WORKFLOW_STAGES[stageIndex].label,
    observedAt,
    taskId: task.taskId,
    projectName: task.projectName,
    requestedBy: task.requestedBy,
    taskState: task.state,
    progressKind: task.progressKind,
    terminal: terminalStates.has(task.state),
  };
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
    rtkProbe,
    hermesBrokerProbe,
    telegramProbe,
    brain,
    promptBudget,
  ] = await Promise.all([
    probeLmStudio(),
    probeHermes(),
    probeDocker(),
    probeWsl(),
    probeTcp("mariadb", "MariaDB", "Datos locales", 3306),
    probeTcp("apache", "Apache", "Aplicaciones XAMPP", 80),
    probeGraphify(),
    probeGpu(),
    probeRtk(),
    probeHermesBroker(),
    probeTelegram(),
    readBrainStatus(),
    readPromptBudget(),
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
    rtkProbe,
    hermesBrokerProbe,
    telegramProbe,
  ];
  const services = probes.map(({ service }) => service);
  updateEvents(services);
  const free = freemem();
  const total = totalmem();
  const generatedAt = checkedAt();
  sequence += 1;
  const execution = buildWorkflowExecution(
    hermesBrokerProbe.delegation,
    brain,
    generatedAt,
  );
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
    brain,
    promptBudget,
    delegation: hermesBrokerProbe.delegation,
    execution,
    workflow: buildBrainWorkflow(
      brain,
      execution,
      telegramProbe.service.state,
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

async function refreshHermesBroker(): Promise<void> {
  if (brokerRefreshPromise) return brokerRefreshPromise;
  brokerRefreshPromise = (async () => {
    brokerRefreshCount += 1;
    const probe = await probeHermesBroker();

    if (!current) return;

    const oldServices = current.services.map((s) => ({ ...s }));
    const oldConnections = current.connections.map((c) => ({ ...c }));

    const newService = probe.service;
    const newConnection = connectionFrom(probe);

    const updatedServices = oldServices.map((s) =>
      s.id === "hermes-broker" ? newService : s,
    );
    const updatedConnections = oldConnections.map((c) =>
      c.target === "hermes-broker" ? newConnection : c,
    );

    const brokerOld = oldServices.find((s) => s.id === "hermes-broker");
    const stableOld = JSON.stringify({
      service: { state: brokerOld?.state, detail: brokerOld?.detail },
      delegation: {
        totalTasks: current.delegation.totalTasks,
        activeCount: current.delegation.activeCount,
        staleActiveCount: current.delegation.staleActiveCount,
        invalidTaskCount: current.delegation.invalidTaskCount,
        historyState: current.delegation.historyState,
        completedCount: current.delegation.completedCount,
        failedCount: current.delegation.failedCount,
        efficiency: current.delegation.efficiency,
        latestTask: current.delegation.latestTask,
        focusTask: current.delegation.focusTask,
      },
    });
    const stableNew = JSON.stringify({
      service: { state: newService.state, detail: newService.detail },
      delegation: {
        totalTasks: probe.delegation.totalTasks,
        activeCount: probe.delegation.activeCount,
        staleActiveCount: probe.delegation.staleActiveCount,
        invalidTaskCount: probe.delegation.invalidTaskCount,
        historyState: probe.delegation.historyState,
        completedCount: probe.delegation.completedCount,
        failedCount: probe.delegation.failedCount,
        efficiency: probe.delegation.efficiency,
        latestTask: probe.delegation.latestTask,
        focusTask: probe.delegation.focusTask,
      },
    });

    if (stableOld === stableNew) return;

    sequence += 1;
    const generatedAt = checkedAt();
    const execution = buildWorkflowExecution(
      probe.delegation,
      current.brain,
      generatedAt,
    );
    // Esta ruta sólo refresca hermes-broker, así que para los demás servicios
    // current.services y updatedServices llevan el mismo valor.
    const telegramState =
      current.services.find((service) => service.id === "telegram")?.state ??
      "unknown";
    updateEvents(updatedServices);
    current = {
      ...current,
      generatedAt,
      sequence,
      services: updatedServices,
      connections: updatedConnections,
      delegation: probe.delegation,
      execution,
      workflow: buildBrainWorkflow(
        current.brain,
        execution,
        telegramState,
        generatedAt,
      ),
      events: [...events],
    };
    const payload = `event: snapshot${LINE_FEED}data: ${JSON.stringify(current)}${LINE_FEED}${LINE_FEED}`;
    for (const client of clients) client.write(payload);
  })().catch((err) => {
    console.error(`[telemetry] broker refresh error: ${safeError(err)}`);
  }).finally(() => {
    brokerRefreshPromise = null;
  });
  return brokerRefreshPromise;
}

function startHermesWatcher(): void {
  if (hermesWatcher) return;
  try {
    mkdirSync(HERMES_JOBS_PATH, { recursive: true });
    hermesWatcher = watch(
      HERMES_JOBS_PATH,
      { recursive: true },
      (_event, _filename) => {
        const normalized = _filename?.replaceAll("\\", "/");
        if (
          normalized?.endsWith("status.json") &&
          (normalized.includes("hermes-") || normalized === "status.json")
        ) {
          if (debounceTimeout) clearTimeout(debounceTimeout);
          debounceTimeout = setTimeout(() => {
            refreshHermesBroker().catch(() => {});
          }, 150);
        }
      },
    ).on("error", (err) => {
      console.error(`[telemetry] hermes watcher error: ${safeError(err)}`);
      if (hermesWatcher) {
        hermesWatcher.close();
        hermesWatcher = null;
      }
    });
  } catch (err) {
    console.error(`[telemetry] failed to start hermes watcher: ${safeError(err)}`);
  }
}

async function refresh(): Promise<void> {
  if (!hermesWatcher) startHermesWatcher();
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    fullRefreshCount += 1;
    const next = await collect();
    const changed = !current || materialSnapshot(current) !== materialSnapshot(next);
    current = next;
    if (!changed) return;
    const payload = `event: snapshot\ndata: ${JSON.stringify(next)}\n\n`;
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
      diagnostics: {
        fullRefreshCount,
        scheduledFullRefreshCount,
        brokerRefreshCount,
      },
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
  startHermesWatcher();
  fullRefreshInterval = setInterval(() => {
    scheduledFullRefreshCount += 1;
    void refresh();
  }, INTERVAL_MS);
  fullRefreshInterval.unref();
  heartbeatInterval = setInterval(() => {
    for (const client of clients) {
      client.write(`:heartbeat${LINE_FEED}${LINE_FEED}`);
    }
  }, 15000);
  heartbeatInterval.unref();
});

function shutdown(): void {
  if (debounceTimeout) clearTimeout(debounceTimeout);
  debounceTimeout = null;
  if (hermesWatcher) {
    hermesWatcher.close();
    hermesWatcher = null;
  }
  if (fullRefreshInterval) clearInterval(fullRefreshInterval);
  fullRefreshInterval = null;
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = null;
  for (const client of clients) client.end();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
