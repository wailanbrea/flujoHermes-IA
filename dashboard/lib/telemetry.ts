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

export interface TelemetrySnapshot {
  generatedAt: string;
  sequence: number;
  overallState: HealthState;
  services: ServiceHealth[];
  connections: ConnectionHealth[];
  events: TelemetryEvent[];
  system: {
    memoryUsedGiB: number;
    memoryTotalGiB: number;
    memoryUsagePercent: number;
    uptimeSeconds: number;
  };
  privacy: { capturesContent: false; binding: "127.0.0.1" };
}
