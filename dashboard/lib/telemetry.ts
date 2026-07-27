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
  kind: "observer" | "agent" | "model" | "compute" | "graph" | "project";
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
  hermesIntegrated: boolean;
  repositories: GraphRepositorySummary[];
  nodeTypes: Array<{ label: string; count: number }>;
  relations: Array<{ label: string; count: number }>;
}

export interface TelemetrySnapshot {
  generatedAt: string;
  sequence: number;
  overallState: HealthState;
  services: ServiceHealth[];
  connections: ConnectionHealth[];
  events: TelemetryEvent[];
  graph: KnowledgeGraphSummary;
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
  };
  privacy: { capturesContent: false; binding: "127.0.0.1" };
}
