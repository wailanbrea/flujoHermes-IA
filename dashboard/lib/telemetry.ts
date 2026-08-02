export type HealthState = "healthy" | "degraded" | "offline" | "unknown";

export interface ServiceHealth {
  id: string;
  name: string;
  role: string;
  state: HealthState;
  detail: string;
  latencyMs: number | null;
  version?: string;
  checkedAt: string;
  metrics?: Record<string, number | string | boolean>;
}

export interface ConnectionHealth {
  id: string;
  source: string;
  target: string;
  label: string;
  protocol: string;
  state: HealthState;
  latencyMs: number | null;
  successfulChecks: number;
  failedChecks: number;
}

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  severity: "info" | "success" | "warning" | "error";
  source: string;
  message: string;
}

export type WorkflowEvidence = "observed" | "configured" | "indexed";

export interface WorkflowNode {
  id: string;
  label: string;
  role: string;
  detail: string;
  state: HealthState;
  kind:
    | "user"
    | "interface"
    | "control"
    | "memory"
    | "router"
    | "factory"
    | "policy"
    | "gateway"
    | "executor"
    | "validation"
    | "result"
    | "learning"
    | "observer";
  stageId: WorkflowStageId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  state: HealthState;
  evidence: WorkflowEvidence;
  stageId: WorkflowStageId;
  lastObservedAt: string;
}

export interface GraphRepositorySummary {
  id: string;
  label: string;
  nodeCount: number;
  edgeCount: number;
  rootAlias: string | null;
  relativePath: string | null;
  hasGit: boolean | null;
  gitScope: "own" | "inherited" | "none" | "unknown";
  gitBranch: string | null;
  gitDirty: boolean | null;
  graphStatus:
    | "ready"
    | "metadata-only"
    | "failed"
    | "inventory-only"
    | "unknown";
}

export interface KnowledgeGraphSummary {
  state: HealthState;
  checkedAt: string;
  updatedAt: string | null;
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
  projectCount: number;
  codexIntegrated: boolean;
  claudeIntegrated: boolean;
  antigravityIntegrated: boolean;
  openCodeIntegrated: boolean;
  hermesIntegrated: boolean;
  repositories: GraphRepositorySummary[];
  nodeTypes: Array<{ label: string; count: number }>;
  relations: Array<{ label: string; count: number }>;
}

export type HermesTaskState =
  | "isolated"
  | "editing"
  | "sealed"
  | "queued"
  | "preparing"
  | "executing"
  | "awaiting-review"
  | "validating"
  | "applied-cleanup-pending"
  | "completed"
  | "failed"
  | "blocked"
  | "validation-failed";

export const WORKFLOW_STAGES = [
  { id: "input", label: "Usuario & Telegram Gateway" },
  { id: "auth", label: "Autenticación & Idempotencia" },
  { id: "normalize", label: "Normalizador & Contrato" },
  { id: "preclassify", label: "Clasificador Preliminar (L0-L4)" },
  { id: "brain", label: "Hermes Brain & Graphify" },
  { id: "routing", label: "Model Router & VRAM" },
  { id: "atomic-plan", label: "Atomic Planner & Grafo DAG" },
  { id: "plan", label: "Execution Gateway" },
  { id: "sandbox", label: "Sandbox, Tools & Playwright" },
  { id: "evidence", label: "Patch Gate & Evidencia" },
  { id: "integration", label: "Integración & Ensamblaje" },
  { id: "validated", label: "Quality Gates Determinísticos" },
  { id: "audit", label: "Auditoría Post-Ejecución" },
  { id: "repair", label: "Repair Loop & Regresión" },
  { id: "learning", label: "Learning Engine Saneado" },
  { id: "promotion", label: "Promoción, Memoria & Entrega" },
] as const;

export type WorkflowStageId = (typeof WORKFLOW_STAGES)[number]["id"];
export type WorkflowExecutionMode = "idle" | "live" | "waiting" | "last";

export interface HermesTaskSummary {
  taskId: string;
  projectName: string;
  requestedBy: "Codex" | "Claude" | "Antigravity" | "OpenCode";
  mode: "analysis" | "execute";
  phase: "plan" | "edit" | "browser";
  state: HermesTaskState;
  updatedAt: string;
  filesChanged: number;
  patchBytes: number;
  validationPassed: boolean | null;
  lastActivityAt: string | null;
  elapsedSeconds: number;
  noProgressSeconds: number;
  progressKind: string;
  errorCode: string | null;
  addedLines: number;
  removedLines: number;
  patchPolicyPassed: boolean | null;
  taskUsageCaptured: boolean;
  localTokens: number;
  avoidedGpt56SolCostUsd: number;
}

export interface HermesBenchmarkSummary {
  state: HealthState;
  generatedAt: string | null;
  model: string;
  gpuOffload: number;
  total: number;
  passed: number;
  tokensPerSecond: number;
  tests: Array<{
    id: string;
    passed: boolean;
    durationMs: number;
    category: string;
  }>;
}

export interface HermesModelPerformance {
  model: string;
  displayName: string;
  role: "primary" | "fallback";
  contextLength: number;
  parallel: number;
  gpuOffload: string;
  mtpEnabled: boolean;
  tokensPerSecond: number;
  gpuComputeAveragePercent: number;
  gpuComputePeakPercent: number;
  dedicatedMemoryGiB: number;
  sharedMemoryGiB: number;
  fullAgentPassSeconds: number;
}

export interface HermesInsightsSummary {
  state: HealthState;
  generatedAt: string | null;
  days: number;
  pricing: {
    referenceModel: string;
    tier: string;
    inputPerMillionUsd: number;
    outputPerMillionUsd: number;
    localInputPerMillionUsd: number;
    localOutputPerMillionUsd: number;
    source: string;
    checkedAt: string;
  };
  overview: {
    sessions: number;
    messages: number;
    userMessages: number;
    assistantMessages: number;
    toolMessages: number;
    toolCalls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    activeHours: number;
    averageSessionSeconds: number;
    averageMessagesPerSession: number;
    avoidedCloudTokens: number;
    localCostUsd: number;
    avoidedGpt56SolCostUsd: number;
  };
  models: Array<{
    model: string;
    sessions: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens: number;
    apiCalls: number;
    toolCalls: number;
    localCostUsd: number;
    avoidedGpt56SolCostUsd: number;
  }>;
  platforms: Array<{
    platform: string;
    sessions: number;
    messages: number;
    totalTokens: number;
    toolCalls: number;
  }>;
  tools: Array<{ tool: string; calls: number; percentage: number }>;
  skills: {
    totalLoads: number;
    totalEdits: number;
    distinct: number;
    top: Array<{ skill: string; loads: number; edits: number; total: number }>;
  };
  activity: {
    byDay: Array<{ day: string; count: number }>;
    byHour: Array<{ hour: number; count: number }>;
    busiestDay: string;
    busiestHour: number;
    activeDays: number;
    maxStreak: number;
  };
  topSessions: Array<{ label: string; value: string; date: string }>;
}

export interface HermesDelegationSummary {
  state: HealthState;
  historyState: HealthState;
  checkedAt: string;
  totalTasks: number;
  invalidTaskCount: number;
  staleActiveCount: number;
  queuedCount: number;
  activeCount: number;
  awaitingReviewCount: number;
  completedCount: number;
  failedCount: number;
  latestTask: HermesTaskSummary | null;
  focusTask: HermesTaskSummary | null;
  benchmark: HermesBenchmarkSummary;
  modelPerformance: HermesModelPerformance[];
  insights: HermesInsightsSummary;
  efficiency: {
    capturedTasks: number;
    localTokens: number;
    avoidedGpt56SolCostUsd: number;
    reviewedTasks: number;
    acceptedTasks: number;
    acceptanceRate: number;
    schemaFailures: number;
  };
}

export interface WorkflowExecutionSummary {
  mode: WorkflowExecutionMode;
  stageId: WorkflowStageId;
  stageIndex: number;
  label: string;
  observedAt: string;
  taskId: string | null;
  projectName: string | null;
  requestedBy: HermesTaskSummary["requestedBy"] | null;
  taskState: HermesTaskState | null;
  progressKind: string | null;
  terminal: boolean;
}

export interface BrainRoute {
  capability: string;
  profile: string;
  executor: string;
  fallback: string;
}

export interface BrainTask {
  taskId: string;
  projectName: string;
  requestedBy: "Codex" | "Claude" | "Antigravity" | "OpenCode";
  state: string;
  updatedAt: string;
  filesChanged?: number;
  patchBytes?: number;
  stale?: boolean;
}

export interface BrainSummary {
  state: HealthState;
  version: number;
  memory: {
    state: HealthState;
    graphNodes: number;
    graphEdges: number;
    policy: string;
  };
  router: {
    state: HealthState;
    routes: BrainRoute[];
    localOptional: boolean;
    enforced: boolean;
  };
  agents: {
    state: HealthState;
    profiles: string[];
    operatorCount: number;
    advisoryCount: number;
    advisoryOnly: boolean;
  };
  skills: {
    state: HealthState;
    configured: string[];
    installed: string[];
    roleAware: boolean;
    profiles: Array<{
      profileId: string;
      runtimeId: string;
      configured: number;
      present: number;
      missing: string[];
      writeApproval: boolean;
      state: HealthState;
    }>;
  };
  learning: {
    state: HealthState;
    promotionState: HealthState;
    pendingApproval: number;
    counts: Record<string, number>;
    last: Record<string, unknown> | null;
  };
  sandbox: {
    state: HealthState;
    counts: Record<string, number>;
    staleCount: number;
    active: BrainTask[];
  };
  lastValidatedOutcome: BrainTask | null;
  curator: { state: HealthState; consolidation?: string };
  kanban: { state: HealthState; manualDecomposition?: boolean };
  moa: { state: HealthState; active?: boolean; optional?: boolean };
}

export interface PromptBudgetProfile {
  profile: string;
  mode: string;
  state: "healthy" | "unavailable";
  model: string | null;
  tools: number;
  systemPromptBytes: number;
  skillsIndexBytes: number;
  toolSchemaBytes: number;
  totalFixedBytes: number;
  estimatedFixedTokens: number;
}

export interface PromptBudgetSummary {
  state: HealthState;
  generatedAt: string | null;
  estimation: "bytes-divided-by-four";
  summary: {
    configuredProfiles: number;
    availableProfiles: number;
    minimumEstimatedTokens: number;
    maximumEstimatedTokens: number;
  };
  profiles: PromptBudgetProfile[];
}

export interface TelemetrySnapshot {
  generatedAt: string;
  sequence: number;
  overallState: HealthState;
  services: ServiceHealth[];
  connections: ConnectionHealth[];
  events: TelemetryEvent[];
  graph: KnowledgeGraphSummary;
  brain: BrainSummary;
  promptBudget: PromptBudgetSummary;
  delegation: HermesDelegationSummary;
  execution: WorkflowExecutionSummary;
  workflow: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
  system: {
    memoryUsedGiB: number;
    memoryTotalGiB: number;
    memoryUsagePercent: number;
    uptimeSeconds: number;
    gpuDedicatedUsedGiB: number | null;
    gpuSharedUsedGiB: number | null;
    gpuComputePercent: number | null;
  };
  privacy: { capturesContent: false; binding: "127.0.0.1" };
}
