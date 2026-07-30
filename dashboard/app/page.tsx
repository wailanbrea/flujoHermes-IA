import { useEffect, useMemo, useRef, useState } from "react";
import { WORKFLOW_STAGES } from "../lib/telemetry";
import type {
  BrainSummary,
  HealthState,
  TelemetrySnapshot,
  WorkflowExecutionSummary,
  WorkflowStageId,
} from "../lib/telemetry";
import "./globals.css";

const API_URL = "http://127.0.0.1:4311";
const MOTION_PREFERENCE_KEY = "trama.motion-enabled";

type StreamState = "connecting" | "live" | "retrying";
type NodeId =
  | "user"
  | "brain"
  | "memory"
  | "router"
  | "agents"
  | "cases"
  | "engines"
  | "experts"
  | "plan"
  | "sandbox"
  | "evidence"
  | "validated"
  | "learning"
  | "promotion";

interface DiagramNode {
  id: NodeId;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  subtitle: string;
}

interface ExecutionStage {
  id: WorkflowStageId;
  label: string;
  nodes: NodeId[];
  edgeIndexes: number[];
}

const EXECUTION_STEP_MS = 1_100;

const executionStages: ExecutionStage[] = [
  { ...WORKFLOW_STAGES[0], nodes: ["user"], edgeIndexes: [] },
  { ...WORKFLOW_STAGES[1], nodes: ["brain"], edgeIndexes: [0] },
  {
    ...WORKFLOW_STAGES[2],
    nodes: ["memory", "router", "agents"],
    edgeIndexes: [1, 2, 3],
  },
  {
    ...WORKFLOW_STAGES[3],
    nodes: ["cases", "engines", "experts"],
    edgeIndexes: [4, 5, 6],
  },
  { ...WORKFLOW_STAGES[4], nodes: ["plan"], edgeIndexes: [7, 8, 9] },
  { ...WORKFLOW_STAGES[5], nodes: ["sandbox"], edgeIndexes: [10] },
  { ...WORKFLOW_STAGES[6], nodes: ["evidence"], edgeIndexes: [11] },
  { ...WORKFLOW_STAGES[7], nodes: ["validated"], edgeIndexes: [12] },
  { ...WORKFLOW_STAGES[8], nodes: ["learning"], edgeIndexes: [13] },
  { ...WORKFLOW_STAGES[9], nodes: ["promotion"], edgeIndexes: [14] },
];

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

const nodes: DiagramNode[] = [
  { id: "user", x: 410, y: 14, width: 180, height: 42, title: "Usuario", subtitle: "Objetivo y límites" },
  { id: "brain", x: 360, y: 82, width: 280, height: 58, title: "HERMES BRAIN", subtitle: "Plano de control persistente" },
  { id: "memory", x: 70, y: 190, width: 230, height: 54, title: "Memoria y Graphify", subtitle: "Recuperación estructural" },
  { id: "router", x: 385, y: 190, width: 230, height: 54, title: "Model Router", subtitle: "Capacidad, no identidad" },
  { id: "agents", x: 700, y: 190, width: 230, height: 54, title: "Agent Factory", subtitle: "Especialistas advisory" },
  { id: "cases", x: 70, y: 286, width: 230, height: 48, title: "Casos anteriores", subtitle: "Sólo resultados validados" },
  { id: "engines", x: 385, y: 286, width: 230, height: 48, title: "Local / Cloud", subtitle: "Motores reemplazables" },
  { id: "experts", x: 700, y: 286, width: 230, height: 48, title: "Agentes expertos", subtitle: "Briefs de sólo lectura" },
  { id: "plan", x: 385, y: 382, width: 230, height: 48, title: "Plan de solución", subtitle: "Decisión del director cloud" },
  { id: "sandbox", x: 385, y: 458, width: 230, height: 48, title: "Ejecutor en sandbox", subtitle: "Worktree aislado" },
  { id: "evidence", x: 350, y: 534, width: 300, height: 48, title: "Tests + revisión + evidencia", subtitle: "LF · SHA-256 · allowlist" },
  { id: "validated", x: 385, y: 610, width: 230, height: 48, title: "Resultado validado", subtitle: "Integración idempotente" },
  { id: "learning", x: 385, y: 686, width: 230, height: 48, title: "Learning Engine", subtitle: "Después de completar" },
  { id: "promotion", x: 350, y: 746, width: 300, height: 30, title: "Memoria · Skill · Benchmark", subtitle: "" },
];

const paths = [
  "M500 56 V82",
  "M500 140 V164 H185 V190",
  "M500 140 V190",
  "M500 164 H815 V190",
  "M185 244 V286",
  "M500 244 V286",
  "M815 244 V286",
  "M185 334 V356 H500 V382",
  "M500 334 V382",
  "M815 334 V356 H500 V382",
  "M500 430 V458",
  "M500 506 V534",
  "M500 582 V610",
  "M500 658 V686",
  "M500 734 V746",
];

const nodeCopy: Record<NodeId, string> = {
  user: "Entrega el objetivo, el alcance y la autorización. No decide detalles internos del runtime.",
  brain: "Coordina memoria, routing, expertos, sandboxes, evidencia y aprendizaje. Sólo escribe dentro de ámbitos autorizados.",
  memory: "Graphify localiza símbolos y relaciones antes de cualquier recorrido amplio.",
  router: "Selecciona la capacidad requerida. El operador local actúa con permisos acotados y tiene fallback cloud.",
  agents: "Convoca perfiles especializados que sólo entregan briefs estructurados.",
  cases: "Recupera soluciones reproducibles y lecciones saneadas, nunca conversaciones completas.",
  engines: "Gemma puede operar herramientas en sandbox; los directores cloud siguen disponibles como fallback.",
  experts: "Arquitectura, seguridad, testing, frontend, backend, datos y aprendizaje.",
  plan: "El director integra hallazgos y define la implementación con criterios verificables.",
  sandbox: "Todo cambio ocurre dentro del worktree creado para un único task ID.",
  evidence: "El diff se sella en LF, se limita por allowlist y se verifica con hash y git apply.",
  validated: "Sólo Complete true aplica el parche una vez después de pruebas independientes.",
  learning: "Una tarea completada genera una lección pequeña y trazable.",
  promotion: "Ninguna skill se promueve sin benchmark aprobado y autorización explícita.",
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

function nodeState(id: NodeId, brain: BrainSummary): HealthState {
  if (["memory", "cases"].includes(id)) return brain.memory.state;
  if (["router", "engines"].includes(id)) return brain.router.state;
  if (["agents", "experts"].includes(id)) return brain.agents.state;
  if (id === "sandbox") return brain.sandbox.state;
  if (id === "learning") return brain.learning.state;
  if (id === "promotion") return brain.learning.promotionState;
  if (id === "validated") return brain.lastValidatedOutcome ? "healthy" : "unknown";
  return brain.state;
}

function BrainDiagram({
  brain,
  execution,
  selected,
  onSelect,
}: {
  brain: BrainSummary;
  execution: WorkflowExecutionSummary;
  selected: NodeId;
  onSelect: (id: NodeId) => void;
}) {
  const selectedNode = nodes.find((node) => node.id === selected) ?? nodes[1];
  const diagramScroller = useRef<HTMLDivElement>(null);
  const brainSvg = useRef<SVGSVGElement>(null);
  const [guideStageIndex, setGuideStageIndex] = useState(0);
  const [guideMode, setGuideMode] = useState(false);
  const [isMotionPlaying, setIsMotionPlaying] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [motionOverride, setMotionOverride] = useState(() => {
    try {
      return window.localStorage.getItem(MOTION_PREFERENCE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const motionAllowed = !prefersReducedMotion || motionOverride;
  const activeStageIndex = guideMode ? guideStageIndex : execution.stageIndex;
  const activeStage = executionStages[activeStageIndex];
  const executionMode = guideMode ? "guide" : execution.mode;
  const executionModeLabel = {
    guide: "Modo guía",
    idle: "Sin tarea",
    live: "En vivo",
    waiting: "En espera",
    last: "Último resultado",
  }[executionMode];
  const executionDetail = guideMode
    ? "Demostración local; no representa una tarea activa"
    : execution.taskId
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

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    if (!guideMode || !isMotionPlaying || !motionAllowed) return;
    const interval = window.setInterval(() => {
      setGuideStageIndex((current) => (current + 1) % executionStages.length);
    }, EXECUTION_STEP_MS);
    return () => window.clearInterval(interval);
  }, [guideMode, isMotionPlaying, motionAllowed]);

  useEffect(() => {
    if (execution.mode === "live" || execution.mode === "waiting") {
      setGuideMode(false);
      setIsMotionPlaying(true);
    }
  }, [execution.mode, execution.taskId, execution.taskState]);

  useEffect(() => {
    const svg = brainSvg.current;
    if (!svg) return;
    if (motionAllowed && isMotionPlaying) svg.unpauseAnimations();
    else svg.pauseAnimations();
  }, [isMotionPlaying, motionAllowed]);

  const enableMotion = () => {
    setMotionOverride(true);
    setIsMotionPlaying(true);
    try {
      window.localStorage.setItem(MOTION_PREFERENCE_KEY, "true");
    } catch {
      // Motion still works for this session if browser storage is unavailable.
    }
  };

  const respectSystemMotion = () => {
    setMotionOverride(false);
    try {
      window.localStorage.removeItem(MOTION_PREFERENCE_KEY);
    } catch {
      // The in-memory preference remains authoritative for this session.
    }
  };

  return (
    <div
      className={`diagram-layout${motionAllowed ? "" : " reduced-motion"}${isMotionPlaying ? "" : " motion-paused"}`}
      data-execution-mode={executionMode}
    >
      <div className="execution-sequence" aria-live="polite">
        <div className="execution-readout">
          <span>
            Secuencia operativa
            <em className={`execution-mode mode-${executionMode}`}>{executionModeLabel}</em>
          </span>
          <strong>
            {String(activeStageIndex + 1).padStart(2, "0")}
            <i>/</i>
            {String(executionStages.length).padStart(2, "0")}
            <b>{activeStage.label}</b>
          </strong>
          <small>{executionDetail}</small>
        </div>
        <div
          className="execution-progress"
          aria-label={`Fase ${activeStageIndex + 1} de ${executionStages.length}: ${activeStage.label}`}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={executionStages.length}
          aria-valuenow={activeStageIndex + 1}
        >
          {executionStages.map((stage, index) => (
            <i
              className={index === activeStageIndex ? "active" : index < activeStageIndex ? "passed" : ""}
              key={stage.label}
            />
          ))}
        </div>
        <div className="sequence-controls">
          <button
            className="sequence-toggle"
            type="button"
            onClick={() => {
              if (!motionAllowed) {
                enableMotion();
                return;
              }
              if (guideMode || execution.mode === "live" || execution.mode === "waiting") {
                setIsMotionPlaying((current) => !current);
                return;
              }
              setGuideStageIndex(0);
              setGuideMode(true);
              setIsMotionPlaying(true);
            }}
            aria-pressed={
              guideMode || execution.mode === "live" || execution.mode === "waiting"
                ? !isMotionPlaying
                : undefined
            }
          >
            {!motionAllowed
              ? "Activar animación"
              : guideMode
                ? isMotionPlaying
                  ? "Pausar guía"
                  : "Reanudar guía"
                : execution.mode === "live" || execution.mode === "waiting"
                  ? isMotionPlaying
                    ? "Pausar movimiento"
                    : "Reanudar movimiento"
                  : "Recorrer flujo"}
          </button>
          {guideMode && (
            <button className="sequence-toggle secondary" type="button" onClick={() => setGuideMode(false)}>
              Volver a telemetría
            </button>
          )}
          {prefersReducedMotion && motionOverride && !guideMode && (
            <button className="sequence-toggle secondary" type="button" onClick={respectSystemMotion}>
              Respetar sistema
            </button>
          )}
        </div>
      </div>
      <div ref={diagramScroller} className="diagram-scroll" aria-label="Flujo fijo de Hermes Brain">
        <svg ref={brainSvg} className="brain-svg" viewBox="0 0 1000 780" role="img" aria-labelledby="brain-title brain-desc">
          <title id="brain-title">Flujo operativo de Hermes Brain</title>
          <desc id="brain-desc">Del usuario a memoria, routing, agentes, sandbox, evidencia y aprendizaje.</desc>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
            <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          <g className="brain-links">
            {paths.map((path, index) => {
              const isTraversing = activeStage.edgeIndexes.includes(index);
              return (
                <path
                  className={isTraversing ? "sequence-active" : ""}
                  d={path}
                  key={path}
                  markerEnd={isTraversing ? "url(#arrow-active)" : "url(#arrow)"}
                />
              );
            })}
          </g>
          <g className="execution-pulses" aria-hidden="true">
            {activeStage.edgeIndexes.map((edgeIndex) => (
              <circle className="execution-pulse" key={`${activeStage.id}-${edgeIndex}`} r="5">
                <animateMotion
                  dur="850ms"
                  path={paths[edgeIndex]}
                  repeatCount="indefinite"
                />
              </circle>
            ))}
          </g>
          {nodes.map((node) => {
            const state = nodeState(node.id, brain);
            const active = node.id === selected;
            const isSequenceActive = activeStage.nodes.includes(node.id);
            return (
              <g
                className={`brain-node ${stateClass(state)}${active ? " selected" : ""}${isSequenceActive ? " sequence-active" : ""}`}
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${node.title}: ${node.subtitle}`}
                aria-current={isSequenceActive ? "step" : undefined}
                onClick={() => onSelect(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(node.id);
                }}
              >
                <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="4" />
                <circle cx={node.x + 14} cy={node.y + 14} r="4" />
                <text className="node-title" x={node.x + node.width / 2} y={node.y + (node.subtitle ? 23 : 20)} textAnchor="middle">
                  {node.title}
                </text>
                {node.subtitle && (
                  <text className="node-subtitle" x={node.x + node.width / 2} y={node.y + 40} textAnchor="middle">
                    {node.subtitle}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <aside className="node-inspector" aria-live="polite">
        <span>Inspector</span>
        <h3>{selectedNode.title}</h3>
        <p>{nodeCopy[selectedNode.id]}</p>
        <dl>
          <div><dt>Estado</dt><dd className={stateClass(nodeState(selected, brain))}>{nodeState(selected, brain)}</dd></div>
          <div><dt>Autoridad</dt><dd>{selected === "brain" ? "control" : "acotada"}</dd></div>
        </dl>
      </aside>
    </div>
  );
}

function Home() {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [stream, setStream] = useState<StreamState>("connecting");
  const [selected, setSelected] = useState<NodeId>("brain");

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
          <p>La IA local opera con límites. Los expertos asesoran. La evidencia decide.</p>
        </header>
        {snapshot ? (
          <BrainDiagram
            brain={snapshot.brain}
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
