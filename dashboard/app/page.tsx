import { useEffect, useMemo, useRef, useState } from "react";
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

const API_URL = "http://127.0.0.1:4311";
const CANVAS_WIDTH = 1720;
const CANVAS_HEIGHT = 3130;

type StreamState = "connecting" | "live" | "retrying";

const STAGE_SHORT_LABELS = [
  "Ingreso",
  "Autenticación",
  "Contrato",
  "Clasificación",
  "Brain",
  "Routing",
  "Plan atómico",
  "Gateway",
  "Sandbox",
  "Evidencia",
  "Integración",
  "Quality Gates",
  "Auditoría",
  "Repair Loop",
  "Learning",
  "Entrega",
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

function stateClass(state: HealthState): string {
  return `state-${state}`;
}

function formatAge(value?: string | null): string {
  if (!value) return "sin datos";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return `hace ${seconds}s`;
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)}m`;
  return `hace ${Math.floor(seconds / 3600)}h`;
}

function portPoint(node: WorkflowNode, port: WorkflowPort = "bottom") {
  switch (port) {
    case "top":
      return { x: Math.round(node.x + node.width / 2), y: node.y };
    case "right":
      return { x: node.x + node.width, y: Math.round(node.y + node.height / 2) };
    case "left":
      return { x: node.x, y: Math.round(node.y + node.height / 2) };
    case "bottom":
    default:
      return { x: Math.round(node.x + node.width / 2), y: node.y + node.height };
  }
}

function edgePathData(
  edge: WorkflowEdge,
  nodesById: Map<string, WorkflowNode>,
): { path: string; labelX: number; labelY: number; verticalLabel?: boolean } | null {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  if (!source || !target) return null;

  const start = portPoint(source, edge.sourcePort ?? (edge.route === "observer" ? "left" : "bottom"));
  const end = portPoint(target, edge.targetPort ?? (edge.route === "observer" ? "right" : "top"));

  if (edge.route === "loop") {
    const corridorX = edge.corridorX ?? CANVAS_WIDTH - 40;
    const path = `M ${start.x} ${start.y} H ${corridorX} V ${end.y} H ${end.x}`;
    return {
      path,
      labelX: corridorX - 12,
      labelY: Math.round((start.y + end.y) / 2),
      verticalLabel: true,
    };
  }

  if (edge.route === "observer" || (edge.sourcePort === "right" && edge.targetPort === "left")) {
    const middleX = Math.round((start.x + end.x) / 2);
    const path = `M ${start.x} ${start.y} H ${middleX} V ${end.y} H ${end.x}`;
    return { path, labelX: middleX, labelY: Math.min(start.y, end.y) - 14 };
  }

  const middleY = Math.round((start.y + end.y) / 2);
  const path = `M ${start.x} ${start.y} V ${middleY} H ${end.x} V ${end.y}`;
  return {
    path,
    labelX: Math.round((start.x + end.x) / 2),
    labelY: middleY,
  };
}

function BrainDiagram({
  workflow,
  execution,
  selected,
  onSelect,
}: {
  workflow: TelemetrySnapshot["workflow"];
  execution: WorkflowExecutionSummary;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const nodesById = useMemo(
    () => new Map(workflow.nodes.map((node) => [node.id, node])),
    [workflow.nodes],
  );
  const selectedNode = nodesById.get(selected) ?? nodesById.get("brain") ?? workflow.nodes[0];
  const diagramScroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [fitScale, setFitScale] = useState(1);
  const activeStageIndex = Math.max(0, execution.stageIndex);
  const activeStage = WORKFLOW_STAGES[activeStageIndex] ?? WORKFLOW_STAGES[0];
  const executionMode = execution.mode;
  const executionIsActive = executionMode === "live" || executionMode === "waiting";
  const effectiveScale = fitScale * (zoom / 100);
  const executionModeLabel = {
    idle: "Sin tarea",
    live: "En vivo",
    waiting: "En espera",
    last: "Último resultado",
  }[executionMode];
  const executionDetail = execution.taskId
    ? `${execution.projectName} · ${execution.requestedBy} · ${execution.taskState}`
    : "Esperando una tarea autorizada";

  const calculateFitScale = (force = false) => {
    const scroller = diagramScroller.current;
    if (!scroller) return;
    const availableWidth = Math.max(320, scroller.clientWidth - 32);
    const ratio = availableWidth / CANVAS_WIDTH;
    // En automático no reduce tanto que vuelva ilegibles los textos. El botón
    // "Ajustar ancho" sí puede comprimir un poco más cuando el usuario lo decide.
    const next = force
      ? Math.min(1.08, Math.max(0.72, ratio))
      : ratio >= 0.84
        ? Math.min(1.08, ratio)
        : 1;
    setFitScale(Number(next.toFixed(3)));
  };

  useEffect(() => {
    const scroller = diagramScroller.current;
    if (!scroller) return;
    calculateFitScale(false);
    const observer = new ResizeObserver(() => calculateFitScale(false));
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const handleZoom = (delta: number) => {
    setZoom((previous) => Math.min(130, Math.max(70, previous + delta)));
  };

  const centerNode = (node?: WorkflowNode) => {
    const scroller = diagramScroller.current;
    if (!node || !scroller) return;
    const scaledCenterX = (node.x + node.width / 2) * effectiveScale;
    const scaledTop = node.y * effectiveScale;
    scroller.scrollTo({
      left: Math.max(0, scaledCenterX - scroller.clientWidth / 2),
      top: Math.max(0, scaledTop - 130),
      behavior: "smooth",
    });
  };

  const centerActiveStage = () => {
    centerNode(workflow.nodes.find((node) => node.stageId === execution.stageId));
  };

  const selectStage = (stageId: string) => {
    const node = workflow.nodes.find((candidate) => candidate.stageId === stageId);
    if (!node) return;
    onSelect(node.id);
    centerNode(node);
  };

  const phases = [
    {
      id: "ingress",
      label: "FASE A — INGRESO Y CONTRATO",
      subtitle: "Recibir, autorizar, normalizar y clasificar la solicitud",
      y: 30,
      height: 955,
    },
    {
      id: "context",
      label: "FASE B — CONTEXTO Y ENRUTAMIENTO",
      subtitle: "Hermes Brain, Graphify, selección de modelo y especialistas",
      y: 1000,
      height: 405,
    },
    {
      id: "execution",
      label: "FASE C — PLANIFICACIÓN Y EJECUCIÓN",
      subtitle: "DAG atómico, autorización, sandbox y evidencia",
      y: 1420,
      height: 735,
    },
    {
      id: "quality",
      label: "FASE D — INTEGRACIÓN, CALIDAD Y REPARACIÓN",
      subtitle: "Integración, Quality Gates, auditoría y Repair Loop",
      y: 2170,
      height: 575,
    },
    {
      id: "delivery",
      label: "FASE E — APRENDIZAJE Y ENTREGA",
      subtitle: "Aprendizaje saneado y promoción verificable",
      y: 2760,
      height: 345,
    },
  ];

  const outgoingEdges = workflow.edges.filter((edge) => edge.source === selectedNode?.id);

  return (
    <div className="diagram-layout" data-execution-mode={executionMode}>
      <div className="execution-sequence" aria-live="polite">
        <div className="execution-readout">
          <span>
            Secuencia operativa · 16 etapas
            <em className={`execution-mode mode-${executionMode}`}>{executionModeLabel}</em>
          </span>
          <strong>
            {String(activeStageIndex + 1).padStart(2, "0")}
            <i>/</i>
            {String(WORKFLOW_STAGES.length).padStart(2, "0")}
            <b>{activeStage.label}</b>
          </strong>
          <small>{executionDetail}</small>
        </div>

        <div
          className="execution-stages-row"
          aria-label={`Etapa ${activeStageIndex + 1} de ${WORKFLOW_STAGES.length}: ${activeStage.label}`}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={WORKFLOW_STAGES.length}
          aria-valuenow={activeStageIndex + 1}
        >
          {WORKFLOW_STAGES.map((stage, index) => {
            const isCurrent = index === activeStageIndex;
            const isPassed = index < activeStageIndex;
            return (
              <button
                type="button"
                className={`stage-pill ${isCurrent ? "active" : isPassed ? "passed" : ""}`}
                key={stage.id}
                title={`[${String(index + 1).padStart(2, "0")}] ${stage.label}`}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => selectStage(stage.id)}
              >
                <span className="stage-num">{String(index + 1).padStart(2, "0")}</span>
                <span className="stage-name">{STAGE_SHORT_LABELS[index]}</span>
              </button>
            );
          })}
        </div>

        <div className="diagram-toolbar">
          <div className="zoom-controls">
            <button type="button" title="Disminuir zoom" onClick={() => handleZoom(-10)}>−</button>
            <span>{Math.round(effectiveScale * 100)}%</span>
            <button type="button" title="Aumentar zoom" onClick={() => handleZoom(10)}>+</button>
            <button type="button" title="Restablecer zoom" onClick={() => setZoom(100)}>100%</button>
            <button type="button" title="Ajustar el lienzo al ancho disponible" onClick={() => calculateFitScale(true)}>Ajustar ancho</button>
            <button type="button" title="Centrar en la etapa activa" onClick={centerActiveStage}>Etapa activa</button>
          </div>
          <div className="legend-strip" aria-label="Leyenda del workflow">
            <span className="legend-item"><i className="legend-dot healthy" /> Sano</span>
            <span className="legend-item"><i className="legend-dot degraded" /> Degradado</span>
            <span className="legend-item"><i className="legend-dot observed" /> Observado</span>
            <span className="legend-item"><i className="legend-dot configured" /> Configurado</span>
            <span className="legend-item"><i className="legend-dot loop" /> Reparación</span>
          </div>
        </div>
      </div>

      <div ref={diagramScroller} className="diagram-scroll" aria-label="Flujo operativo ampliado de Hermes Brain">
        <div
          className="diagram-canvas-stage"
          style={{
            width: CANVAS_WIDTH * effectiveScale,
            height: CANVAS_HEIGHT * effectiveScale,
          }}
        >
          <div
            className="diagram-canvas-container"
            style={{
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              transform: `scale(${effectiveScale})`,
            }}
          >
            <svg
              className="brain-svg-overlay"
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              aria-hidden="true"
            >
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#54727f" />
                </marker>
                <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#a4edff" />
                </marker>
                <marker id="arrow-loop" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffb86c" />
                </marker>
              </defs>

              <g className="phase-bands">
                {phases.map((phase) => (
                  <g className={`phase-band phase-${phase.id}`} key={phase.id}>
                    <rect x={20} y={phase.y} width={1680} height={phase.height} rx={12} />
                    <text className="phase-title" x={46} y={phase.y + 30}>{phase.label}</text>
                    <text className="phase-subtitle" x={46} y={phase.y + 50}>{phase.subtitle}</text>
                  </g>
                ))}
              </g>

              <g className="brain-links">
                {workflow.edges.map((edge) => {
                  const data = edgePathData(edge, nodesById);
                  if (!data) return null;
                  const isTraversing = executionIsActive && edge.evidence === "observed" && edge.stageId === execution.stageId;
                  const isLoop = edge.route === "loop";
                  const isObserver = edge.route === "observer";
                  const labelWidth = Math.min(260, Math.max(96, edge.label.length * 6.2));

                  return (
                    <g key={edge.id} className={`edge-group ${isLoop ? "loop-edge" : ""} ${isObserver ? "observer-edge" : ""}`}>
                      <path
                        className={`flow-path evidence-${edge.evidence}${isTraversing ? " telemetry-active" : ""}${isLoop ? " loop-path" : ""}`}
                        d={data.path}
                        markerEnd={isLoop ? "url(#arrow-loop)" : isTraversing ? "url(#arrow-active)" : "url(#arrow)"}
                      />
                      <g
                        className="edge-label-pill"
                        transform={`translate(${data.labelX}, ${data.labelY})${data.verticalLabel ? " rotate(-90)" : ""}`}
                      >
                        <rect x={-labelWidth / 2} y={-12} width={labelWidth} height={24} rx={6} />
                        <text textAnchor="middle" dominantBaseline="middle">{edge.label}</text>
                      </g>
                    </g>
                  );
                })}
              </g>
            </svg>

            {workflow.nodes.map((node) => {
              const active = node.id === selected;
              const isSequenceActive = node.stageId === execution.stageId;
              const stageNumber = node.stageNumber ?? WORKFLOW_STAGES.findIndex((stage) => stage.id === node.stageId) + 1;
              const evidence = node.evidence
                ?? workflow.edges.find((edge) => edge.target === node.id)?.evidence
                ?? "configured";

              return (
                <button
                  type="button"
                  className={`brain-node-card kind-${node.kind} state-${node.state}${active ? " selected" : ""}${isSequenceActive ? " sequence-active" : ""}`}
                  key={node.id}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                  }}
                  aria-label={`${node.label}. ${node.role}. ${node.purpose ?? node.detail}`}
                  aria-current={isSequenceActive ? "step" : undefined}
                  onClick={() => onSelect(node.id)}
                >
                  <span className="card-badge-header">
                    <span className="stage-num-tag">[{String(stageNumber).padStart(2, "0")}/16]</span>
                    <span className={`state-tag state-${node.state}`}>{node.state.toUpperCase()}</span>
                    <span className={`evidence-tag evidence-${evidence}`}>{evidence.toUpperCase()}</span>
                  </span>
                  <span className="card-title-text">{node.label}</span>
                  <span className="card-role-sub"><strong className="role-lbl">Rol:</strong> {node.role}</span>
                  <span className="card-purpose-desc">{node.purpose ?? node.detail}</span>
                  {node.detail && node.detail !== node.purpose && (
                    <span className="card-metric-footer">{node.detail}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <ol className="workflow-mobile-list" aria-label="Lista ordenada de etapas operativas">
          {WORKFLOW_STAGES.map((stage, index) => {
            const stageNodes = workflow.nodes.filter((node) => node.stageId === stage.id);
            const isCurrent = index === activeStageIndex;
            const isPassed = index < activeStageIndex;
            return (
              <li className={`mobile-stage-group ${isCurrent ? "active" : isPassed ? "passed" : ""}`} key={stage.id}>
                <header className="mobile-stage-heading">
                  <span>Etapa {String(index + 1).padStart(2, "0")} / 16</span>
                  <strong>{stage.label}</strong>
                </header>
                <div className="mobile-stage-nodes">
                  {stageNodes.map((node) => (
                    <button type="button" className="mobile-stage-card" key={node.id} onClick={() => onSelect(node.id)}>
                      <span className="mobile-card-top">
                        <span className={`state-tag state-${node.state}`}>{node.state}</span>
                        <span className={`evidence-tag evidence-${node.evidence ?? "configured"}`}>{node.evidence ?? "configured"}</span>
                      </span>
                      <strong>{node.label}</strong>
                      <span className="mobile-role">{node.role}</span>
                      <span className="mobile-purpose">{node.purpose ?? node.detail}</span>
                    </button>
                  ))}
                </div>
                {stage.id === "repair" && <div className="mobile-loop-note">↺ Retorna a la etapa 07 — Atomic Planner & Grafo DAG</div>}
              </li>
            );
          })}
        </ol>
      </div>

      <aside className="node-inspector" aria-live="polite">
        <div className="inspector-summary">
          <span>Inspector operativo</span>
          <h3>{selectedNode?.label ?? "Workflow"}</h3>
          <p className="inspector-purpose">{selectedNode?.purpose ?? selectedNode?.detail ?? "Sin detalle disponible."}</p>
        </div>
        <dl className="inspector-dl">
          <div><dt>Etapa</dt><dd>[{String(selectedNode?.stageNumber ?? 0).padStart(2, "0")}/16] {selectedNode?.stageId}</dd></div>
          <div><dt>Fase</dt><dd>{selectedNode?.phase?.toUpperCase() ?? "SIN FASE"}</dd></div>
          <div><dt>Rol</dt><dd>{selectedNode?.role ?? "desconocido"}</dd></div>
          <div><dt>Estado</dt><dd className={stateClass(selectedNode?.state ?? "unknown")}>{selectedNode?.state ?? "unknown"}</dd></div>
          <div><dt>Evidencia</dt><dd>{selectedNode?.evidence?.toUpperCase() ?? "CONFIGURADO"}</dd></div>
          <div><dt>Autoridad</dt><dd>{selectedNode?.authority ?? "bounded"}</dd></div>
          <div><dt>Detalle</dt><dd>{selectedNode?.detail ?? "—"}</dd></div>
          <div><dt>Salidas</dt><dd>{outgoingEdges.length ? outgoingEdges.map((edge) => edge.label).join(" · ") : "Sin transición"}</dd></div>
        </dl>
      </aside>
    </div>
  );
}

function Home() {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [stream, setStream] = useState<StreamState>("connecting");
  const [selected, setSelected] = useState("brain");

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

  const healthy = snapshot?.services.filter((service) => service.state === "healthy").length ?? 0;
  const activeSandboxes = snapshot?.brain.sandbox.active.filter((task) => !task.stale) ?? [];
  const routes = snapshot?.brain.router.routes ?? [];
  const learningTotal = useMemo(
    () => Object.values(snapshot?.brain.learning.counts ?? {}).reduce((sum, value) => sum + value, 0),
    [snapshot],
  );
  const largestPromptBudgets = useMemo(
    () => [...(snapshot?.promptBudget.profiles ?? [])]
      .filter((profile) => profile.state === "healthy")
      .sort((left, right) => right.estimatedFixedTokens - left.estimatedFixedTokens)
      .slice(0, 5),
    [snapshot],
  );

  return (
    <main>
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

      <section className="status-rail" aria-label="Resumen operativo">
        <article><span>Brain</span><strong className={stateClass(snapshot?.brain.state ?? "unknown")}>{snapshot?.brain.state ?? "unknown"}</strong></article>
        <article><span>Graphify</span><strong>{snapshot?.brain.memory.graphNodes.toLocaleString("es-DO") ?? "—"} nodos</strong></article>
        <article><span>Servicios</span><strong>{healthy}/{snapshot?.services.length ?? 0} sanos</strong></article>
        <article><span>Sandboxes</span><strong>{activeSandboxes.length} activos</strong></article>
        <article><span>Aprendizajes</span><strong>{learningTotal}</strong></article>
        <article><span>Actualizado</span><strong>{formatAge(snapshot?.generatedAt)}</strong></article>
      </section>

      <section className="diagram-section">
        <header className="section-heading">
          <div>
            <p className="kicker">Flujo real</p>
            <h2>Decisión, evidencia y memoria en un solo circuito</h2>
          </div>
          <p>Telegram Gateway canaliza solicitudes. Hermes Brain razona bajo políticas. La evidencia decide.</p>
        </header>
        {snapshot ? (
          <BrainDiagram
            workflow={snapshot.workflow}
            execution={snapshot.execution ?? idleExecution}
            selected={selected}
            onSelect={setSelected}
          />
        ) : (
          <div className="loading">Esperando snapshot saneado…</div>
        )}
      </section>

      <section className="control-grid">
        <article className="control-card">
          <header><span>01</span><h3>Memoria</h3><i className={stateClass(snapshot?.brain.memory.state ?? "unknown")} /></header>
          <strong>{snapshot?.brain.memory.graphNodes.toLocaleString("es-DO") ?? "—"} nodos · {snapshot?.brain.memory.graphEdges.toLocaleString("es-DO") ?? "—"} relaciones</strong>
          <p>Graphify primero; sólo conocimiento validado y saneado.</p>
        </article>
        <article className="control-card">
          <header><span>02</span><h3>Model Router</h3><i className={stateClass(snapshot?.brain.router.state ?? "unknown")} /></header>
          <strong>{routes.length} rutas de capacidad</strong>
          <ul>{routes.slice(0, 5).map((route) => <li key={route.capability}><b>{route.capability}</b><span>{route.executor}</span></li>)}</ul>
        </article>
        <article className="control-card">
          <header><span>03</span><h3>Agent Factory</h3><i className={stateClass(snapshot?.brain.agents.state ?? "unknown")} /></header>
          <strong>{snapshot?.brain.agents.operatorCount ?? 0} operador · {snapshot?.brain.agents.advisoryCount ?? 0} asesores</strong>
          <div className="chips">{snapshot?.brain.agents.profiles.map((profile) => <span key={profile}>{profile}</span>)}</div>
        </article>
        <article className="control-card">
          <header><span>04</span><h3>Skills</h3><i className={stateClass(snapshot?.brain.skills.state ?? "unknown")} /></header>
          <strong>{snapshot?.brain.skills.configured.length ?? 0} skills · {snapshot?.brain.skills.profiles.filter((profile) => profile.state === "healthy").length ?? 0}/{snapshot?.brain.skills.profiles.length ?? 0} perfiles conformes</strong>
          <div className="chips">{snapshot?.brain.skills.configured.slice(0, 8).map((skill) => <span key={skill}>{skill}</span>)}</div>
        </article>
        <article className="control-card">
          <header><span>05</span><h3>Curator y Learning</h3><i className={stateClass(snapshot?.brain.learning.state ?? "unknown")} /></header>
          <strong>Consolidación {snapshot?.brain.curator.consolidation ?? "desconocida"}</strong>
          <ul>{Object.entries(snapshot?.brain.learning.counts ?? {}).map(([state, count]) => <li key={state}><b>{state}</b><span>{count}</span></li>)}</ul>
        </article>
        <article className="control-card">
          <header><span>06</span><h3>Sandbox y evidencia</h3><i className={stateClass(snapshot?.brain.sandbox.state ?? "unknown")} /></header>
          <strong>{activeSandboxes.length} tareas en curso · {snapshot?.brain.sandbox.staleCount ?? 0} obsoletas</strong>
          <ul>{Object.entries(snapshot?.brain.sandbox.counts ?? {}).filter(([, count]) => count > 0).map(([state, count]) => <li key={state}><b>{state}</b><span>{count}</span></li>)}</ul>
        </article>
        <article className="control-card">
          <header><span>07</span><h3>Presupuesto de contexto</h3><i className={stateClass(snapshot?.promptBudget.state ?? "unknown")} /></header>
          <strong>{snapshot?.promptBudget.summary.maximumEstimatedTokens.toLocaleString("es-DO") ?? "—"} tokens fijos máximos</strong>
          <p>Estimación offline por perfil: bytes ÷ 4. No captura prompts, código ni comandos.</p>
          <ul>{largestPromptBudgets.map((profile) => <li key={profile.profile}><b>{profile.profile}</b><span>{profile.estimatedFixedTokens.toLocaleString("es-DO")} · {profile.tools} tools</span></li>)}</ul>
        </article>
        <article className="control-card">
          <header><span>08</span><h3>Ahorro vs Cloud</h3><i className="state-healthy" /></header>
          <strong style={{ color: "#70c5a1" }}>${(snapshot?.delegation.efficiency.avoidedGpt56SolCostUsd ?? 0).toFixed(2)} USD Ahorrados</strong>
          <p>Inferencia local $0 USD vs tarifas Cloud ($15/1M tokens).</p>
          <ul>
            <li><b>Tokens Locales</b><span>{(snapshot?.delegation.efficiency.localTokens ?? 0).toLocaleString("es-DO")} tok</span></li>
            <li><b>Tasa de Éxito</b><span>{snapshot?.delegation.efficiency.acceptanceRate ?? 100}%</span></li>
          </ul>
        </article>
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
          ) : <p className="empty">Aún no hay un resultado validado en el nuevo lifecycle.</p>}
          <h3>Sandboxes activos</h3>
          <div className="rows">
            {activeSandboxes.length ? activeSandboxes.map((task) => (
              <div className="row" key={task.taskId}><span>{task.projectName}</span><b>{task.state}</b><small>{task.requestedBy}</small></div>
            )) : <p className="empty">Sin sandboxes activos.</p>}
          </div>
        </article>
        <article className="ledger">
          <header><div><p className="kicker">Runtime</p><h2>Salud y eventos</h2></div></header>
          <div className="rows">
            {snapshot?.services.map((service) => (
              <div className="row" key={service.id}><span>{service.name}</span><b className={stateClass(service.state)}>{service.state}</b><small>{service.detail}</small></div>
            ))}
          </div>
          <h3>Eventos saneados</h3>
          <div className="events">
            {snapshot?.events.slice(0, 6).map((event) => <p key={event.id}><time>{new Date(event.timestamp).toLocaleTimeString("es-DO")}</time>{event.message}</p>)}
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
