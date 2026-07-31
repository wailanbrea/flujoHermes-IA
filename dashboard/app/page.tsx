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

function edgePath(
  edge: WorkflowEdge,
  nodesById: Map<string, WorkflowNode>,
): string {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  if (!source || !target) return "";

  const sourceX = source.x + source.width / 2;
  const sourceY = source.y + source.height / 2;
  const targetX = target.x + target.width / 2;
  const targetY = target.y + target.height / 2;
  if (Math.abs(targetY - sourceY) < 8) {
    const goesRight = targetX > sourceX;
    return `M ${goesRight ? source.x + source.width : source.x} ${sourceY} H ${goesRight ? target.x : target.x + target.width}`;
  }

  const goesDown = targetY > sourceY;
  const startY = goesDown ? source.y + source.height : source.y;
  const endY = goesDown ? target.y : target.y + target.height;
  const middleY = Math.round((startY + endY) / 2);
  return `M ${sourceX} ${startY} V ${middleY} H ${targetX} V ${endY}`;
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
      if (!scroller || window.innerWidth > 600) return;
      scroller.scrollLeft = Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
    };

    centerOnEntry();
    window.addEventListener("resize", centerOnEntry);
    return () => window.removeEventListener("resize", centerOnEntry);
  }, []);

  return (
    <div className="diagram-layout" data-execution-mode={executionMode}>
      <div className="execution-sequence" aria-live="polite">
        <div className="execution-readout">
          <span>
            Secuencia operativa
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
          className="execution-progress"
          aria-label={`Fase ${activeStageIndex + 1} de ${WORKFLOW_STAGES.length}: ${activeStage.label}`}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={WORKFLOW_STAGES.length}
          aria-valuenow={activeStageIndex + 1}
        >
          {WORKFLOW_STAGES.map((stage, index) => (
            <i
              className={index === activeStageIndex ? "active" : index < activeStageIndex ? "passed" : ""}
              key={stage.id}
            />
          ))}
        </div>
      </div>
      <div ref={diagramScroller} className="diagram-scroll" aria-label="Flujo fijo de Hermes Brain">
        <svg className="brain-svg" viewBox="0 0 1000 780" role="img" aria-labelledby="brain-title brain-desc">
          <title id="brain-title">Flujo operativo de Hermes Brain</title>
          <desc id="brain-desc">Arquitectura operativa publicada por la telemetría local.</desc>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
            <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          <g className="brain-links">
            {workflow.edges.map((edge) => {
              const path = edgePath(edge, nodesById);
              const isTraversing =
                executionIsActive &&
                edge.evidence === "observed" &&
                edge.stageId === execution.stageId;
              return path ? (
                <path
                  className={`flow-path evidence-${edge.evidence}${isTraversing ? " telemetry-active" : ""}`}
                  d={path}
                  data-evidence={edge.evidence}
                  key={edge.id}
                  markerEnd={isTraversing ? "url(#arrow-active)" : "url(#arrow)"}
                />
              ) : null;
            })}
          </g>
          {workflow.nodes.map((node) => {
            const active = node.id === selected;
            const isSequenceActive = node.stageId === execution.stageId;
            const showRole = node.height >= 40 && Boolean(node.role);
            return (
              <g
                className={`brain-node kind-${node.kind} ${stateClass(node.state)}${active ? " selected" : ""}${isSequenceActive ? " sequence-active" : ""}`}
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${node.label}: ${node.role}`}
                aria-current={isSequenceActive ? "step" : undefined}
                onClick={() => onSelect(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(node.id);
                }}
              >
                <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="4" />
                <circle cx={node.x + 14} cy={node.y + 14} r="4" />
                <text className="node-title" x={node.x + node.width / 2} y={node.y + (showRole ? 20 : node.height / 2 + 5)} textAnchor="middle">
                  {node.label}
                </text>
                {showRole && (
                  <text className="node-subtitle" x={node.x + node.width / 2} y={node.y + 35} textAnchor="middle">
                    {node.role}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <aside className="node-inspector" aria-live="polite">
        <span>Inspector</span>
        <h3>{selectedNode?.label ?? "Workflow"}</h3>
        <p>{selectedNode?.detail ?? "Sin detalle disponible."}</p>
        <dl>
          <div><dt>Rol</dt><dd>{selectedNode?.role ?? "desconocido"}</dd></div>
          <div><dt>Estado</dt><dd className={stateClass(selectedNode?.state ?? "unknown")}>{selectedNode?.state ?? "unknown"}</dd></div>
          <div><dt>Autoridad</dt><dd>{selectedNode?.kind === "control" ? "control" : selectedNode?.kind === "observer" ? "observación" : "acotada"}</dd></div>
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
          <p>OpenClaw canaliza solicitudes. Hermes razona bajo políticas. La evidencia decide.</p>
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
