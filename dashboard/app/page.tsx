import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { WORKFLOW_STAGES } from "../lib/telemetry";
import type {
  HealthState,
  TelemetrySnapshot,
  WorkflowEdge,
  WorkflowExecutionSummary,
  WorkflowNode,
  WorkflowPort,
} from "../lib/telemetry";
import "./globals.css";

const viteEnvironment = (
  import.meta as ImportMeta & { env?: Record<string, string | undefined> }
).env;
const API_URL = viteEnvironment?.VITE_TELEMETRY_URL ?? "http://127.0.0.1:4311";
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.1;
const VIEW_PADDING = 48;

type StreamState = "connecting" | "live" | "retrying";
type MobileMode = "canvas" | "list";
type Point = { x: number; y: number };

const MACRO_PHASES = [
  { id: "ingress", label: "Ingesta", from: 0, to: 3 },
  { id: "planning", label: "Planificación", from: 4, to: 6 },
  { id: "execution", label: "Ejecución", from: 7, to: 9 },
  { id: "verification", label: "Verificación", from: 10, to: 13 },
  { id: "learning", label: "Aprendizaje", from: 14, to: 14 },
  { id: "delivery", label: "Entrega", from: 15, to: 15 },
] as const;

const idleExecution: WorkflowExecutionSummary = {
  mode: "idle",
  stageId: "input",
  stageIndex: 0,
  label: WORKFLOW_STAGES[0].label,
  observedAt: "",
  taskId: null,
  projectName: null,
  requestedBy: null,
  taskState: null,
  progressKind: null,
  terminal: false,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function stateClass(state: HealthState): string {
  return `state-${state}`;
}

function formatAge(value?: string | null): string {
  if (!value) return "Sin datos";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "No disponible";
  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) return `hace ${seconds}s`;
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)}m`;
  return `hace ${Math.floor(seconds / 3600)}h`;
}

function formatClock(value?: string | null): string {
  if (!value) return "Sin datos";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "No disponible";
  return new Date(parsed).toLocaleTimeString("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function calculateWorkflowBounds(nodes: WorkflowNode[]) {
  if (!nodes.length) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
  }
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function portPoint(node: WorkflowNode, port: WorkflowPort): Point {
  switch (port) {
    case "top":
      return { x: node.x + node.width / 2, y: node.y };
    case "right":
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    case "left":
      return { x: node.x, y: node.y + node.height / 2 };
    case "bottom":
      return { x: node.x + node.width / 2, y: node.y + node.height };
  }
}

function inferredPorts(source: WorkflowNode, target: WorkflowNode): [WorkflowPort, WorkflowPort] {
  const deltaX = target.x + target.width / 2 - (source.x + source.width / 2);
  const deltaY = target.y + target.height / 2 - (source.y + source.height / 2);
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? ["right", "left"] : ["left", "right"];
  }
  return deltaY >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

function edgePathData(
  edge: WorkflowEdge,
  nodesById: Map<string, WorkflowNode>,
  bounds: ReturnType<typeof calculateWorkflowBounds>,
): { path: string; labelX: number; labelY: number; verticalLabel?: boolean } | null {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  if (!source || !target) return null;

  const inferred = inferredPorts(source, target);
  const sourcePort = edge.sourcePort ?? inferred[0];
  const targetPort = edge.targetPort ?? inferred[1];
  const start = portPoint(source, sourcePort);
  const end = portPoint(target, targetPort);

  if (edge.route === "loop") {
    const corridorX = edge.corridorX ?? bounds.maxX + 70;
    const path = `M ${start.x} ${start.y} H ${corridorX} V ${end.y} H ${end.x}`;
    return {
      path,
      labelX: corridorX - 14,
      labelY: (start.y + end.y) / 2,
      verticalLabel: true,
    };
  }

  const horizontal = sourcePort === "left" || sourcePort === "right";
  if (horizontal) {
    const middleX = (start.x + end.x) / 2;
    return {
      path: `M ${start.x} ${start.y} H ${middleX} V ${end.y} H ${end.x}`,
      labelX: middleX,
      labelY: Math.min(start.y, end.y) - 16,
    };
  }

  const middleY = (start.y + end.y) / 2;
  return {
    path: `M ${start.x} ${start.y} V ${middleY} H ${end.x} V ${end.y}`,
    labelX: (start.x + end.x) / 2,
    labelY: middleY,
  };
}

function StageIcon({ kind }: { kind: WorkflowNode["kind"] }) {
  const iconPaths: Record<WorkflowNode["kind"], string> = {
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
    interface: "M4 7h16v10H4zM8 3h8M8 21h8",
    control: "M12 3 4 7v5c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7l-8-4Zm-3 9 2 2 4-5",
    memory: "M5 5h14v14H5zM8 9h8M8 13h8M8 17h5",
    router: "M4 6h7v5H4zM13 13h7v5h-7zM11 8h4v7",
    factory: "M5 12h4l2-4 3 8 2-4h3M4 5h16v14H4z",
    policy: "M7 3h10l3 3v15H4V6l3-3Zm1 6h8M8 13h8M8 17h5",
    gateway: "M4 12h13M13 8l4 4-4 4M4 5h16v14H4",
    executor: "M5 4h14v16H5zM8 8h8M8 12h5M8 16h7",
    validation: "M4 5h16v14H4zM8 10l2 2 5-5M8 16h8",
    result: "M4 12h5l2 4 3-9 2 5h4M4 4h16v16H4",
    learning: "M4 19V5M4 19h16M7 15l4-4 3 2 5-6",
    observer: "M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={iconPaths[kind]} />
    </svg>
  );
}

function BrainDiagram({ snapshot }: { snapshot: TelemetrySnapshot }) {
  const workflow = snapshot.workflow;
  const execution = snapshot.execution ?? idleExecution;
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; origin: Point; pan: Point } | null>(null);
  const pendingPanRef = useRef<Point | null>(null);
  const frameRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState("brain");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mobileMode, setMobileMode] = useState<MobileMode>("canvas");

  const nodesById = useMemo(
    () => new Map(workflow.nodes.map((node) => [node.id, node])),
    [workflow.nodes],
  );
  const bounds = useMemo(() => calculateWorkflowBounds(workflow.nodes), [workflow.nodes]);
  const selectedNode = nodesById.get(selected) ?? nodesById.get("brain") ?? workflow.nodes[0];
  const activeStageIndex = clamp(execution.stageIndex, 0, WORKFLOW_STAGES.length - 1);
  const activeStage = WORKFLOW_STAGES[activeStageIndex];
  const activePhase = MACRO_PHASES.find(
    (phase) => activeStageIndex >= phase.from && activeStageIndex <= phase.to,
  )?.id;
  const activeNode = workflow.nodes.find((node) => node.stageId === execution.stageId);
  const incomingEdges = workflow.edges.filter((edge) => edge.target === selectedNode?.id);
  const outgoingEdges = workflow.edges.filter((edge) => edge.source === selectedNode?.id);
  const relatedIds = useMemo(() => {
    const ids = new Set([selectedNode?.id]);
    for (const edge of workflow.edges) {
      if (edge.source === selectedNode?.id) ids.add(edge.target);
      if (edge.target === selectedNode?.id) ids.add(edge.source);
    }
    return ids;
  }, [selectedNode?.id, workflow.edges]);

  const fitWorkflowToViewport = useCallback((behavior: ScrollBehavior = "auto") => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const availableWidth = Math.max(1, viewport.clientWidth - VIEW_PADDING * 2);
    const availableHeight = Math.max(1, viewport.clientHeight - VIEW_PADDING * 2);
    const nextZoom = clamp(
      Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    const nextPan = {
      x: viewport.clientWidth / 2 - (bounds.minX + bounds.width / 2) * nextZoom,
      y: viewport.clientHeight / 2 - (bounds.minY + bounds.height / 2) * nextZoom,
    };
    if (behavior === "smooth") {
      viewport.classList.add("view-animating");
      window.setTimeout(() => viewport.classList.remove("view-animating"), 260);
    }
    setZoom(nextZoom);
    setPan(nextPan);
  }, [bounds]);

  const centerNode = useCallback((node?: WorkflowNode) => {
    const viewport = viewportRef.current;
    if (!viewport || !node) return;
    viewport.classList.add("view-animating");
    setPan({
      x: viewport.clientWidth / 2 - (node.x + node.width / 2) * zoom,
      y: viewport.clientHeight / 2 - (node.y + node.height / 2) * zoom,
    });
    window.setTimeout(() => viewport.classList.remove("view-animating"), 260);
  }, [zoom]);

  useEffect(() => {
    fitWorkflowToViewport();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => fitWorkflowToViewport());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitWorkflowToViewport]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const zoomAround = useCallback((nextZoom: number, focal?: Point) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const anchor = focal ?? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    setPan((currentPan) => {
      const worldX = (anchor.x - currentPan.x) / zoom;
      const worldY = (anchor.y - currentPan.y) / zoom;
      return {
        x: anchor.x - worldX * clampedZoom,
        y: anchor.y - worldY * clampedZoom,
      };
    });
    setZoom(clampedZoom);
  }, [zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0012);
      zoomAround(zoom * factor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [zoom, zoomAround]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if ((event.target as HTMLElement).closest("button, .node-inspector")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      pan,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    pendingPanRef.current = {
      x: drag.pan.x + event.clientX - drag.origin.x,
      y: drag.pan.y + event.clientY - drag.origin.y,
    };
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      if (pendingPanRef.current) setPan(pendingPanRef.current);
      pendingPanRef.current = null;
      frameRef.current = null;
    });
  };

  const endPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleMinimapPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const worldX = bounds.minX + ((event.clientX - rect.left) / rect.width) * bounds.width;
    const worldY = bounds.minY + ((event.clientY - rect.top) / rect.height) * bounds.height;
    setPan({
      x: viewport.clientWidth / 2 - worldX * zoom,
      y: viewport.clientHeight / 2 - worldY * zoom,
    });
  };

  const selectNode = (node: WorkflowNode) => {
    setSelected(node.id);
    setInspectorOpen(true);
  };

  const averageLatency = useMemo(() => {
    const observed = snapshot.services
      .map((service) => service.latencyMs)
      .filter((value): value is number => typeof value === "number");
    if (!observed.length) return null;
    return Math.round(observed.reduce((sum, value) => sum + value, 0) / observed.length);
  }, [snapshot.services]);
  const gpu = snapshot.services.find((service) => service.id === "rx9070");
  const gpuCompute = typeof gpu?.metrics?.computePercent === "number"
    ? gpu.metrics.computePercent
    : null;
  const gpuMemory = typeof gpu?.metrics?.dedicatedUsedGiB === "number"
    ? gpu.metrics.dedicatedUsedGiB
    : null;
  const executionModeLabel = {
    idle: "Sin tarea",
    live: "En vivo",
    waiting: "En espera",
    last: "Último resultado",
  }[execution.mode];
  const viewportWorld = viewportRef.current
    ? {
        x: (-pan.x - bounds.minX * zoom) / zoom,
        y: (-pan.y - bounds.minY * zoom) / zoom,
        width: viewportRef.current.clientWidth / zoom,
        height: viewportRef.current.clientHeight / zoom,
      }
    : { x: 0, y: 0, width: bounds.width, height: bounds.height };
  const minimapScaleX = 220 / bounds.width;
  const minimapScaleY = 132 / bounds.height;

  return (
    <section className="holographic-console" aria-label="Diagrama operativo interactivo de Hermes Brain">
      <header className="console-header">
        <div className="console-brand">
          <span className="brand-orbit" aria-hidden="true"><i /><i /><i /></span>
          <div>
            <p>Orquestador IA · flujo observable</p>
            <h2>Hermes Brain</h2>
          </div>
        </div>
        <nav className="macro-phases" aria-label="Macrofases operativas">
          {MACRO_PHASES.map((phase, index) => (
            <button
              type="button"
              key={phase.id}
              className={phase.id === activePhase ? "active" : ""}
              aria-current={phase.id === activePhase ? "step" : undefined}
              onClick={() => {
                const stage = WORKFLOW_STAGES[phase.from];
                const node = workflow.nodes.find((candidate) => candidate.stageId === stage.id);
                if (node) {
                  selectNode(node);
                  centerNode(node);
                }
              }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {phase.label}
            </button>
          ))}
        </nav>
        <div className="console-status">
          <span>Estado del sistema</span>
          <strong className={stateClass(snapshot.overallState)}>
            <i /> {snapshot.overallState}
          </strong>
          <time>{formatClock(snapshot.generatedAt)}</time>
        </div>
      </header>

      <div className="task-strip" aria-live="polite">
        <span><b>Etapa activa</b>{String(activeStageIndex + 1).padStart(2, "0")} · {activeStage.label}</span>
        <span><b>Tarea</b>{execution.taskId ?? "Sin tarea autorizada"}</span>
        <span><b>Proyecto</b>{execution.projectName ?? "No observado"}</span>
        <span><b>Agente</b>{execution.requestedBy ?? "No asignado"}</span>
        <em className={`execution-mode mode-${execution.mode}`}>{executionModeLabel}</em>
      </div>

      <div className={`console-workspace${leftOpen ? "" : " left-collapsed"}${rightOpen ? "" : " right-collapsed"}`}>
        <aside className="metrics-panel side-panel">
          <button
            type="button"
            className="panel-collapse"
            aria-label="Plegar métricas"
            title="Plegar métricas"
            onClick={() => setLeftOpen(false)}
          >‹</button>
          <p className="panel-eyebrow">Métricas observadas</p>
          <Metric label="Solicitudes" value={snapshot.delegation.totalTasks.toLocaleString("es-DO")} />
          <Metric label="Latencia promedio" value={averageLatency === null ? "No observado" : `${averageLatency} ms`} />
          <Metric label="Tasa de éxito" value={snapshot.delegation.efficiency.reviewedTasks
            ? `${snapshot.delegation.efficiency.acceptanceRate.toFixed(1)}%`
            : "Sin datos"} />
          <Metric label="CPU" value="No observado" />
          <Metric
            label="VRAM"
            value={gpuMemory === null ? "No observado" : `${gpuMemory.toFixed(2)} / 16 GiB`}
            progress={gpuMemory === null ? undefined : (gpuMemory / 16) * 100}
          />
          <Metric
            label="GPU compute"
            value={gpuCompute === null ? "No observado" : `${gpuCompute.toFixed(1)}%`}
            progress={gpuCompute ?? undefined}
          />
          <Metric label="Memoria RAM" value="No observado" />
          <Metric label="Disco" value="No observado" />
          <div className="events-compact">
            <p className="panel-eyebrow">Eventos recientes</p>
            {snapshot.events.slice(0, 5).map((event) => (
              <div key={event.id} className={`event-${event.severity}`}>
                <time>{formatClock(event.timestamp)}</time>
                <span>{event.message}</span>
              </div>
            ))}
            {!snapshot.events.length && <span className="panel-empty">Sin eventos observados</span>}
          </div>
        </aside>

        {!leftOpen && (
          <button
            type="button"
            className="panel-restore restore-left"
            aria-label="Mostrar métricas"
            title="Mostrar métricas"
            onClick={() => setLeftOpen(true)}
          >›</button>
        )}

        <div className="floating-shell">
          <div className="mobile-view-switch" aria-label="Vista móvil">
            <button type="button" className={mobileMode === "canvas" ? "active" : ""} onClick={() => setMobileMode("canvas")}>Canvas</button>
            <button type="button" className={mobileMode === "list" ? "active" : ""} onClick={() => setMobileMode("list")}>Lista</button>
          </div>
          <div
            ref={viewportRef}
            className={`workflow-viewport mode-${mobileMode}${dragging ? " is-dragging" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPointerDrag}
            onPointerCancel={endPointerDrag}
          >
            <div
              className="workflow-transform-layer"
              style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
            >
              <svg
                className="workflow-connections"
                width={bounds.maxX + 100}
                height={bounds.maxY + 80}
                viewBox={`0 0 ${bounds.maxX + 100} ${bounds.maxY + 80}`}
                aria-hidden="true"
              >
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" />
                  </marker>
                  <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" />
                  </marker>
                  <marker id="arrow-loop" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" />
                  </marker>
                </defs>
                <g className="workflow-lanes">
                  <rect x={20} y={35} width={1780} height={165} rx={20} />
                  <rect x={20} y={205} width={1780} height={430} rx={20} />
                  <rect x={20} y={630} width={1780} height={170} rx={20} />
                  <rect x={20} y={830} width={1780} height={175} rx={20} />
                </g>
                <g className="brain-links">
                  {workflow.edges.map((edge) => {
                    const data = edgePathData(edge, nodesById, bounds);
                    if (!data) return null;
                    const traversing = (execution.mode === "live" || execution.mode === "waiting")
                      && edge.evidence === "observed"
                      && edge.stageId === execution.stageId;
                    const related = edge.source === selectedNode?.id || edge.target === selectedNode?.id;
                    const dimmed = selectedNode && !related;
                    const labelWidth = clamp(edge.label.length * 5.8 + 24, 88, 238);
                    return (
                      <g
                        key={edge.id}
                        className={`edge-group route-${edge.route ?? "forward"} evidence-${edge.evidence}${traversing ? " telemetry-active" : ""}${related ? " related" : ""}${dimmed ? " dimmed" : ""}`}
                      >
                        <path
                          className="flow-path"
                          d={data.path}
                          markerEnd={edge.route === "loop" ? "url(#arrow-loop)" : traversing ? "url(#arrow-active)" : "url(#arrow)"}
                        />
                        <g
                          className="edge-label-pill"
                          transform={`translate(${data.labelX}, ${data.labelY})${data.verticalLabel ? " rotate(-90)" : ""}`}
                        >
                          <rect x={-labelWidth / 2} y={-11} width={labelWidth} height={22} rx={11} />
                          <text textAnchor="middle" dominantBaseline="middle">{edge.label}</text>
                        </g>
                      </g>
                    );
                  })}
                </g>
              </svg>

              <div className="workflow-nodes">
                {workflow.nodes.map((node) => {
                  const evidence = node.evidence
                    ?? workflow.edges.find((edge) => edge.target === node.id)?.evidence
                    ?? "configured";
                  const current = node.stageId === execution.stageId;
                  const isSelected = node.id === selectedNode?.id;
                  const dimmed = selectedNode && !relatedIds.has(node.id);
                  return (
                    <button
                      type="button"
                      key={node.id}
                      className={`brain-node-card kind-${node.kind} state-${node.state}${current ? " sequence-active" : ""}${isSelected ? " selected" : ""}${dimmed ? " dimmed" : ""}`}
                      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
                      aria-label={`Etapa ${node.stageNumber ?? "auxiliar"}: ${node.label}. Estado ${node.state}. Evidencia ${evidence}.`}
                      aria-current={current ? "step" : undefined}
                      onClick={() => selectNode(node)}
                    >
                      <span className="node-icon"><StageIcon kind={node.kind} /></span>
                      <span className="card-badge-header">
                        <span className="stage-num-tag">{node.stageNumber ? String(node.stageNumber).padStart(2, "0") : "OBS"}</span>
                        <span className={`evidence-tag evidence-${evidence}`}>{evidence}</span>
                        <span className={`state-tag state-${node.state}`}><i />{node.state}</span>
                      </span>
                      <strong className="card-title-text">{node.label}</strong>
                      <span className="card-purpose-desc">{node.purpose ?? node.detail}</span>
                      <small className="card-metric-footer">{node.detail}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            {inspectorOpen && selectedNode && (
              <aside className="node-inspector" aria-live="polite" aria-label="Inspector del nodo">
                <button type="button" className="inspector-close" aria-label="Cerrar inspector" title="Cerrar inspector" onClick={() => setInspectorOpen(false)}>×</button>
                <p>Inspector operativo · etapa {selectedNode.stageNumber ?? "auxiliar"}</p>
                <h3>{selectedNode.label}</h3>
                <span className="inspector-purpose">{selectedNode.purpose ?? selectedNode.detail}</span>
                <dl>
                  <div><dt>Rol</dt><dd>{selectedNode.role}</dd></div>
                  <div><dt>Fase</dt><dd>{selectedNode.phase ?? "Sin fase"}</dd></div>
                  <div><dt>Entrada</dt><dd>{selectedNode.input ?? "No especificada"}</dd></div>
                  <div><dt>Salida</dt><dd>{selectedNode.output ?? "No especificada"}</dd></div>
                  <div><dt>Estado</dt><dd className={stateClass(selectedNode.state)}>{selectedNode.state}</dd></div>
                  <div><dt>Evidencia</dt><dd>{selectedNode.evidence ?? "configured"}</dd></div>
                  <div><dt>Autoridad</dt><dd>{selectedNode.authority ?? "bounded"}</dd></div>
                  <div><dt>Observación</dt><dd>{formatAge(snapshot.generatedAt)}</dd></div>
                  <div><dt>Entradas</dt><dd>{incomingEdges.length ? incomingEdges.map((edge) => edge.label).join(" · ") : "Sin conexión"}</dd></div>
                  <div><dt>Salidas</dt><dd>{outgoingEdges.length ? outgoingEdges.map((edge) => edge.label).join(" · ") : "Sin conexión"}</dd></div>
                </dl>
                <button type="button" className="center-inspected" onClick={() => centerNode(selectedNode)}>Centrar este nodo</button>
              </aside>
            )}
          </div>

          <ol className={`workflow-mobile-list mode-${mobileMode}`} aria-label="Lista ordenada de etapas">
            {WORKFLOW_STAGES.map((stage, index) => {
              const stageNodes = workflow.nodes.filter((node) => node.stageId === stage.id);
              return (
                <li key={stage.id} className={index === activeStageIndex ? "active" : ""}>
                  <header><span>{String(index + 1).padStart(2, "0")}</span><strong>{stage.label}</strong></header>
                  {stageNodes.map((node) => (
                    <button type="button" key={node.id} onClick={() => selectNode(node)}>
                      <span>{node.role}</span>
                      <small>{node.purpose ?? node.detail}</small>
                      <em className={stateClass(node.state)}>{node.state} · {node.evidence ?? "configured"}</em>
                    </button>
                  ))}
                  {stage.id === "repair" && <p>↺ Replanificación hacia 07 · Atomic Planner</p>}
                </li>
              );
            })}
          </ol>
        </div>

        {!rightOpen && (
          <button
            type="button"
            className="panel-restore restore-right"
            aria-label="Mostrar controles"
            title="Mostrar controles"
            onClick={() => setRightOpen(true)}
          >‹</button>
        )}

        <aside className="controls-panel side-panel">
          <button
            type="button"
            className="panel-collapse"
            aria-label="Plegar controles"
            title="Plegar controles"
            onClick={() => setRightOpen(false)}
          >›</button>
          <p className="panel-eyebrow">Navegación</p>
          <div className="zoom-cluster">
            <button type="button" aria-label="Aumentar zoom" title="Aumentar zoom" onClick={() => zoomAround(zoom + ZOOM_STEP)}>+</button>
            <button type="button" aria-label="Disminuir zoom" title="Disminuir zoom" onClick={() => zoomAround(zoom - ZOOM_STEP)}>−</button>
            <output aria-label="Nivel de zoom">{Math.round(zoom * 100)}%</output>
          </div>
          <button type="button" className="control-action" title="Ajustar todo el flujo" onClick={() => fitWorkflowToViewport("smooth")}>Ajustar a pantalla</button>
          <button type="button" className="control-action" title="Centrar etapa activa" disabled={!activeNode} onClick={() => centerNode(activeNode)}>Centrar activa</button>
          <button type="button" className="control-action" title="Restablecer vista" onClick={() => {
            setZoom(1);
            setPan({ x: VIEW_PADDING, y: VIEW_PADDING });
          }}>Restablecer vista</button>

          <p className="panel-eyebrow minimap-title">Vista general</p>
          <svg
            className="workflow-minimap"
            viewBox="0 0 220 132"
            role="img"
            aria-label="Minimap interactivo del flujo"
            onPointerDown={handleMinimapPointer}
          >
            <g transform={`translate(${-bounds.minX * minimapScaleX} ${-bounds.minY * minimapScaleY})`}>
              {workflow.edges.map((edge) => {
                const source = nodesById.get(edge.source);
                const target = nodesById.get(edge.target);
                if (!source || !target) return null;
                return (
                  <line
                    key={edge.id}
                    x1={(source.x + source.width / 2) * minimapScaleX}
                    y1={(source.y + source.height / 2) * minimapScaleY}
                    x2={(target.x + target.width / 2) * minimapScaleX}
                    y2={(target.y + target.height / 2) * minimapScaleY}
                    className={edge.route === "loop" ? "loop" : ""}
                  />
                );
              })}
              {workflow.nodes.map((node) => (
                <rect
                  key={node.id}
                  x={node.x * minimapScaleX}
                  y={node.y * minimapScaleY}
                  width={Math.max(3, node.width * minimapScaleX)}
                  height={Math.max(3, node.height * minimapScaleY)}
                  rx="1.5"
                  className={node.id === activeNode?.id ? "active" : ""}
                />
              ))}
              <rect
                className="minimap-window"
                x={(bounds.minX + viewportWorld.x) * minimapScaleX}
                y={(bounds.minY + viewportWorld.y) * minimapScaleY}
                width={Math.min(220, viewportWorld.width * minimapScaleX)}
                height={Math.min(132, viewportWorld.height * minimapScaleY)}
              />
            </g>
          </svg>

          <p className="panel-eyebrow">Información</p>
          <dl className="diagram-info">
            <div><dt>Nodos</dt><dd>{workflow.nodes.length}</dd></div>
            <div><dt>Conexiones</dt><dd>{workflow.edges.length}</dd></div>
            <div><dt>Ramas</dt><dd>{workflow.edges.filter((edge) => edge.route === "branch").length}</dd></div>
            <div><dt>Loops</dt><dd>{workflow.edges.filter((edge) => edge.route === "loop").length}</dd></div>
            <div><dt>Etapa activa</dt><dd>{String(activeStageIndex + 1).padStart(2, "0")}</dd></div>
            <div><dt>Actualizado</dt><dd>{formatClock(snapshot.generatedAt)}</dd></div>
          </dl>
        </aside>
      </div>
    </section>
  );
}

function Metric({ label, value, progress }: { label: string; value: string; progress?: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {progress !== undefined && (
        <i aria-hidden="true"><b style={{ width: `${clamp(progress, 0, 100)}%` }} /></i>
      )}
    </div>
  );
}

function Home() {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [stream, setStream] = useState<StreamState>("connecting");

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/status`)
      .then((response) => {
        if (!response.ok) throw new Error(`API ${response.status}`);
        return response.json() as Promise<TelemetrySnapshot>;
      })
      .then((value) => active && setSnapshot(value))
      .catch(() => active && setStream("retrying"));
    const source = new EventSource(`${API_URL}/api/events`);
    source.addEventListener("snapshot", (event) => {
      setSnapshot(JSON.parse((event as MessageEvent).data) as TelemetrySnapshot);
      setStream("live");
    });
    source.onopen = () => setStream("live");
    source.onerror = () => setStream("retrying");
    return () => {
      active = false;
      source.close();
    };
  }, []);

  const activeSandboxes = snapshot?.brain.sandbox.active.filter((task) => !task.stale) ?? [];
  const learningTotal = useMemo(
    () => Object.values(snapshot?.brain.learning.counts ?? {}).reduce((sum, value) => sum + value, 0),
    [snapshot],
  );

  return (
    <main>
      <div className="ambient-grid" aria-hidden="true" />
      <div className="ambient-particles" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} />)}</div>
      <header className="topbar">
        <div>
          <p className="kicker">TRAMA / Plano de control local</p>
          <h1>Hermes Brain</h1>
        </div>
        <div className={`stream ${stream}`}>
          <i />
          <span>{stream === "live" ? "telemetría en vivo" : stream}</span>
        </div>
      </header>

      {snapshot ? <BrainDiagram snapshot={snapshot} /> : <div className="loading">Esperando snapshot saneado…</div>}

      <section className="status-rail" aria-label="Resumen operativo">
        <article><span>Brain</span><strong className={stateClass(snapshot?.brain.state ?? "unknown")}>{snapshot?.brain.state ?? "unknown"}</strong></article>
        <article><span>Graphify</span><strong>{snapshot?.brain.memory.graphNodes.toLocaleString("es-DO") ?? "—"} nodos</strong></article>
        <article><span>Relaciones</span><strong>{snapshot?.brain.memory.graphEdges.toLocaleString("es-DO") ?? "—"}</strong></article>
        <article><span>Sandboxes</span><strong>{activeSandboxes.length} activos</strong></article>
        <article><span>Aprendizajes</span><strong>{learningTotal}</strong></article>
        <article><span>Actualizado</span><strong>{formatAge(snapshot?.generatedAt)}</strong></article>
      </section>

      <section className="lower-grid">
        <article className="ledger">
          <header><div><p className="kicker">Evidencia reciente</p><h2>Último resultado validado</h2></div></header>
          {snapshot?.brain.lastValidatedOutcome ? (
            <dl className="outcome">
              <div><dt>Proyecto</dt><dd>{snapshot.brain.lastValidatedOutcome.projectName}</dd></div>
              <div><dt>Director</dt><dd>{snapshot.brain.lastValidatedOutcome.requestedBy}</dd></div>
              <div><dt>Estado</dt><dd className="state-healthy">{snapshot.brain.lastValidatedOutcome.state}</dd></div>
              <div><dt>Actualizado</dt><dd>{formatAge(snapshot.brain.lastValidatedOutcome.updatedAt)}</dd></div>
            </dl>
          ) : <p className="empty">Aún no hay un resultado validado en el lifecycle.</p>}
        </article>
        <article className="ledger">
          <header><div><p className="kicker">Runtime</p><h2>Salud y eventos</h2></div></header>
          <div className="rows">
            {snapshot?.services.map((service) => (
              <div className="row" key={service.id}><span>{service.name}</span><b className={stateClass(service.state)}>{service.state}</b><small>{service.detail}</small></div>
            ))}
          </div>
        </article>
      </section>

      <footer>
        <span>Loopback 127.0.0.1</span>
        <span>Sin prompts, código ni credenciales</span>
        <span>API {API_URL}/api/status</span>
      </footer>
    </main>
  );
}

export default Home;
