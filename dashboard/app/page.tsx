import { useEffect, useMemo, useRef, useState } from "react";
import { WORKFLOW_STAGES } from "../lib/telemetry";
import type {
  HealthState,
  TelemetrySnapshot,
  WorkflowEdge,
  WorkflowExecutionSummary,
  WorkflowNode,
} from "../lib/telemetry";
import "./globals.css";

const API_URL = "http://127.0.0.1:4311";

type StreamState = "connecting" | "live" | "retrying";

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

function edgePathData(
  edge: WorkflowEdge,
  nodesById: Map<string, WorkflowNode>,
): { path: string; labelX: number; labelY: number } | null {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  if (!source || !target) return null;

  if (edge.route === "loop") {
    const corridorX = edge.corridorX ?? 1460;
    const startX = source.x + source.width;
    const startY = Math.round(source.y + source.height / 2);
    const endX = target.x + target.width;
    const endY = Math.round(target.y + target.height / 2);
    const path = `M ${startX} ${startY} H ${corridorX} V ${endY} H ${endX}`;
    return { path, labelX: corridorX - 10, labelY: Math.round((startY + endY) / 2) };
  }

  if (edge.route === "observer") {
    const startX = source.x;
    const startY = Math.round(source.y + source.height / 2);
    const endX = target.x + target.width;
    const endY = Math.round(target.y + target.height / 2);
    const path = `M ${startX} ${startY} H ${endX}`;
    return { path, labelX: Math.round((startX + endX) / 2), labelY: startY - 10 };
  }

  const startX = Math.round(source.x + source.width / 2);
  const startY = source.y + source.height;
  const endX = Math.round(target.x + target.width / 2);
  const endY = target.y;
  const middleY = Math.round((startY + endY) / 2);
  const path = `M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}`;
  return { path, labelX: Math.round((startX + endX) / 2), labelY: middleY };
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
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const selectedNode = nodesById.get(selected) ?? nodesById.get("brain") ?? workflow.nodes[0];
  const diagramScroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const activeStageIndex = Math.max(0, execution.stageIndex);
  const activeStage = WORKFLOW_STAGES[activeStageIndex] ?? WORKFLOW_STAGES[0];
  const executionMode = execution.mode;
  const executionIsActive = executionMode === "live" || executionMode === "waiting";
  const executionModeLabel = {
    idle: "Sin tarea",
    live: "En vivo",
    waiting: "En espera",
    last: "Último resultado",
  }[executionMode];
  const executionDetail = execution.taskId
    ? `${execution.projectName} · ${execution.requestedBy} · ${execution.taskState}`
    : "Esperando una tarea autorizada";

  useEffect(() => {
    const centerOnEntry = () => {
      const scroller = diagramScroller.current;
      if (!scroller || window.innerWidth > 700) return;
      scroller.scrollLeft = Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
    };

    centerOnEntry();
    window.addEventListener("resize", centerOnEntry);
    return () => window.removeEventListener("resize", centerOnEntry);
  }, []);

  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.min(130, Math.max(70, prev + delta)));
  };

  const centerActiveStage = () => {
    const activeNode = workflow.nodes.find((n) => n.stageId === execution.stageId);
    if (activeNode && diagramScroller.current) {
      diagramScroller.current.scrollTop = Math.max(0, activeNode.y - 120);
    }
  };

  const phases = [
    { id: "ingress", label: "FASE A — INGRESO Y CONTRATO", subtitle: "Recibir, autorizar, normalizar y clasificar la solicitud", y: 40, height: 730 },
    { id: "context", label: "FASE B — CONTEXTO Y ENRUTAMIENTO", subtitle: "Hermes Brain, Graphify AST, Model Router & Agent Factory", y: 790, height: 320 },
    { id: "execution", label: "FASE C — PLANIFICACIÓN Y EJECUCIÓN", subtitle: "Descomposición Atómica, Execution Gateway y Sandbox de Trabajo", y: 1120, height: 590 },
    { id: "quality", label: "FASE D — INTEGRACIÓN, CALIDAD Y REPARACIÓN", subtitle: "Quality Gates Determinísticos, Auditoría Post-Ejecución & Repair Loop", y: 1730, height: 440 },
    { id: "delivery", label: "FASE E — APRENDIZAJE Y ENTREGA", subtitle: "Learning Engine Saneado, Promoción y Entrega Verificada", y: 2180, height: 300 },
  ];

  return (
    <div className="diagram-layout" data-execution-mode={executionMode}>
      {/* SELECCIÓN Y BARRA SUPERIOR DE SECUENCIA OPERATIVA 16 ETAPAS */}
      <div className="execution-sequence" aria-live="polite">
        <div className="execution-readout">
          <span>
            Secuencia operativa (16 Etapas Atómicas)
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

        {/* BARRA DESPLAZABLE DE LAS 16 ETAPAS CON NOMBRES CORTOS */}
        <div
          className="execution-stages-row"
          aria-label={`Fase ${activeStageIndex + 1} de ${WORKFLOW_STAGES.length}: ${activeStage.label}`}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={WORKFLOW_STAGES.length}
          aria-valuenow={activeStageIndex + 1}
        >
          {WORKFLOW_STAGES.map((stage, index) => {
            const isCurrent = index === activeStageIndex;
            const isPassed = index < activeStageIndex;
            const targetNode = workflow.nodes.find((n) => n.stageId === stage.id);
            return (
              <button
                className={`stage-pill ${isCurrent ? "active" : isPassed ? "passed" : ""}`}
                key={stage.id}
                title={`[${String(index + 1).padStart(2, "0")}] ${stage.label}`}
                onClick={() => targetNode && onSelect(targetNode.id)}
              >
                <span className="stage-num">{String(index + 1).padStart(2, "0")}</span>
                <span className="stage-name">{stage.label.split("&")[0].trim()}</span>
              </button>
            );
          })}
        </div>

        {/* CONTROLES DE ZOOM Y LEYENDA */}
        <div className="diagram-toolbar">
          <div className="zoom-controls">
            <button title="Disminuir zoom" onClick={() => handleZoom(-10)}>−</button>
            <span>{zoom}%</span>
            <button title="Aumentar zoom" onClick={() => handleZoom(10)}>+</button>
            <button title="Restablecer 100%" onClick={() => setZoom(100)}>100%</button>
            <button title="Centrar en etapa activa" onClick={centerActiveStage}>Centrar activa</button>
          </div>
          <div className="legend-strip">
            <span className="legend-item"><i className="legend-dot healthy" /> Sano</span>
            <span className="legend-item"><i className="legend-dot degraded" /> Degradado</span>
            <span className="legend-item"><i className="legend-dot observed" /> Observado</span>
            <span className="legend-item"><i className="legend-dot configured" /> Configurado</span>
            <span className="legend-item"><i className="legend-dot loop" /> Repair Loop</span>
          </div>
        </div>
      </div>

      {/* LIENZO PRINCIPAL CON TARJETAS HTML SOBRE CAPA DE CONECTORES SVG */}
      <div ref={diagramScroller} className="diagram-scroll" aria-label="Flujo operativo ampliado de Hermes Brain">
        {/* VISTA DESKTOP / TABLET: HÍBRIDO HTML + SVG (1550 x 2500 px) */}
        <div
          className="diagram-canvas-container"
          style={{
            position: "relative",
            width: 1550,
            height: 2500,
            transform: `scale(${zoom / 100})`,
            transformOrigin: "top left",
          }}
        >
          {/* CAPA DE SVG PARA BANDAS DE FASE, CONECTORES Y ETIQUETAS */}
          <svg className="brain-svg-overlay" style={{ position: "absolute", top: 0, left: 0, width: 1550, height: 2500, pointerEvents: "none" }} viewBox="0 0 1550 2500">
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

            {/* BANDAS DE FONDO DE FASE A-E */}
            <g className="phase-bands">
              {phases.map((phase) => (
                <g className={`phase-band phase-${phase.id}`} key={phase.id}>
                  <rect x={40} y={phase.y} width={1470} height={phase.height} rx={8} fill="#0d1b22" opacity={0.4} stroke="#1b3644" strokeWidth={1} strokeDasharray="6 6" />
                  <text x={60} y={phase.y + 26} fill="#628696" fontSize={11} fontFamily="IBM Plex Mono, monospace" fontWeight="bold" letterSpacing="0.08em">
                    {phase.label}
                  </text>
                  <text x={60} y={phase.y + 42} fill="#3d5866" fontSize={10} fontFamily="Manrope, sans-serif">
                    {phase.subtitle}
                  </text>
                </g>
              ))}
            </g>

            {/* ENLACES Y ETIQUETAS DE CONEXIÓN */}
            <g className="brain-links">
              {workflow.edges.map((edge) => {
                const data = edgePathData(edge, nodesById);
                if (!data) return null;
                const isTraversing = executionIsActive && edge.evidence === "observed" && edge.stageId === execution.stageId;
                const isLoop = edge.route === "loop";
                const isObserver = edge.route === "observer";

                return (
                  <g key={edge.id} className={`edge-group ${isLoop ? "loop-edge" : ""} ${isObserver ? "observer-edge" : ""}`}>
                    <path
                      className={`flow-path evidence-${edge.evidence}${isTraversing ? " telemetry-active" : ""}${isLoop ? " loop-path" : ""}`}
                      d={data.path}
                      stroke={isLoop ? "#ffb86c" : isObserver ? "#4a7485" : "#54727f"}
                      strokeWidth={isLoop ? 2 : 1.5}
                      strokeDasharray={isObserver ? "4 4" : isLoop ? "6 4" : "none"}
                      fill="none"
                      markerEnd={isLoop ? "url(#arrow-loop)" : isTraversing ? "url(#arrow-active)" : "url(#arrow)"}
                    />
                    {/* ETIQUETA SOBRE LA LÍNEA DE CONEXIÓN */}
                    <g className="edge-label-pill" transform={`translate(${data.labelX}, ${data.labelY})`}>
                      <rect x={-Math.min(100, edge.label.length * 4)} y={-10} width={Math.min(200, edge.label.length * 8)} height={18} rx={4} fill="#0d1b22" stroke="#254350" strokeWidth={1} />
                      <text fill="#a8c5d1" fontSize={9} fontFamily="IBM Plex Mono, monospace" textAnchor="middle" y={3}>
                        {edge.label}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* TARJETAS HTML POSICIONADAS PARA LOS NODOS */}
          {workflow.nodes.map((node) => {
            const active = node.id === selected;
            const isSequenceActive = node.stageId === execution.stageId;
            const stageNum = node.stageNumber ?? WORKFLOW_STAGES.findIndex((s) => s.id === node.stageId) + 1;
            const edgeEvidence = workflow.edges.find((e) => e.target === node.id || e.source === node.id)?.evidence ?? "configured";

            return (
              <article
                className={`brain-node-card kind-${node.kind} state-${node.state}${active ? " selected" : ""}${isSequenceActive ? " sequence-active" : ""}`}
                key={node.id}
                style={{
                  position: "absolute",
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                  pointerEvents: "auto",
                }}
                role="button"
                tabIndex={0}
                aria-label={`${node.label}: ${node.role}`}
                aria-current={isSequenceActive ? "step" : undefined}
                onClick={() => onSelect(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(node.id);
                }}
              >
                <header className="card-badge-header">
                  <span className="stage-num-tag">[{String(stageNum).padStart(2, "0")}/16]</span>
                  <span className={`state-tag state-${node.state}`}>{node.state.toUpperCase()}</span>
                  <span className={`evidence-tag evidence-${edgeEvidence}`}>{edgeEvidence.toUpperCase()}</span>
                </header>
                <h4 className="card-title-text">{node.label}</h4>
                <div className="card-role-sub"><strong className="role-lbl">Rol:</strong> {node.role}</div>
                <p className="card-purpose-desc">{node.purpose ?? node.detail}</p>
                {node.detail && node.detail !== node.purpose && (
                  <div className="card-metric-footer">⚡ {node.detail}</div>
                )}
              </article>
            );
          })}
        </div>

        {/* VISTA MÓVIL REEMPLAZANTE: LISTA VERTICAL ORDENADA SIN DEFORMACIÓN */}
        <ol className="workflow-mobile-list" aria-label="Lista ordenada de 16 etapas operativas">
          {WORKFLOW_STAGES.map((stage, index) => {
            const node = workflow.nodes.find((n) => n.stageId === stage.id);
            const isCurrent = index === activeStageIndex;
            const isPassed = index < activeStageIndex;
            return (
              <li
                className={`mobile-stage-card ${isCurrent ? "active" : isPassed ? "passed" : ""}`}
                key={stage.id}
                onClick={() => node && onSelect(node.id)}
              >
                <div className="mobile-card-top">
                  <span className="mobile-stage-badge">Etapa {String(index + 1).padStart(2, "0")} / 16</span>
                  <span className={`state-tag state-${node?.state ?? "unknown"}`}>{node?.state ?? "unknown"}</span>
                </div>
                <h5>{node?.label ?? stage.label}</h5>
                <p className="mobile-role">{node?.role}</p>
                <p className="mobile-purpose">{node?.purpose ?? node?.detail}</p>
                {stage.id === "repair" && (
                  <div className="mobile-loop-note">↺ Retorna a Etapa 07 — Atomic Planner & Grafo DAG</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* INSPECTOR LATERAL DETALLADO */}
      <aside className="node-inspector" aria-live="polite">
        <span>Inspector Operativo</span>
        <h3>{selectedNode?.label ?? "Workflow"}</h3>
        <p className="inspector-purpose">{selectedNode?.purpose ?? selectedNode?.detail ?? "Sin detalle disponible."}</p>
        <dl className="inspector-dl">
          <div><dt>Etapa</dt><dd>[{String(selectedNode?.stageNumber ?? 0).padStart(2, "0")}/16] {selectedNode?.stageId}</dd></div>
          <div><dt>Fase</dt><dd>{selectedNode?.phase?.toUpperCase() ?? "INFERRED"}</dd></div>
          <div><dt>Rol</dt><dd>{selectedNode?.role ?? "desconocido"}</dd></div>
          <div><dt>Estado Operativo</dt><dd className={stateClass(selectedNode?.state ?? "unknown")}>{selectedNode?.state ?? "unknown"}</dd></div>
          <div><dt>Autoridad</dt><dd>{selectedNode?.authority ?? "bounded"}</dd></div>
          <div><dt>Nivel de Evidencia</dt><dd>{workflow.edges.find((e) => e.target === selectedNode?.id || e.source === selectedNode?.id)?.evidence.toUpperCase() ?? "CONFIGURADO"}</dd></div>
          <div><dt>Métrica / Detalle</dt><dd>{selectedNode?.detail ?? "—"}</dd></div>
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
