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
    | "observer"
    | "agent"
    | "model"
    | "compute"
    | "graph"
    | "project"
    | "queue"
    | "workspace"
    | "review";
  x: number;
  y: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  state: HealthState;
  evidence: WorkflowEvidence;
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
  | "queued"
  | "preparing"
  | "executing"
  | "awaiting-review"
  | "validating"
  | "completed"
  | "failed"
  | "blocked"
  | "validation-failed";

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
  checkedAt: string;
  totalTasks: number;
  queuedCount: number;
  activeCount: number;
  awaitingReviewCount: number;
  completedCount: number;
  failedCount: number;
  latestTask: HermesTaskSummary | null;
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

export interface TelemetrySnapshot {
  generatedAt: string;
  sequence: number;
  overallState: HealthState;
  services: ServiceHealth[];
  connections: ConnectionHealth[];
  events: TelemetryEvent[];
  graph: KnowledgeGraphSummary;
  delegation: HermesDelegationSummary;
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
