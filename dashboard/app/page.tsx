import { useEffect, useState } from "react";
import type {
  HealthState,
  HermesBenchmarkSummary,
  HermesInsightsSummary,
  HermesModelPerformance,
  HermesTaskState,
  HermesTaskSummary,
  ServiceHealth,
  TelemetrySnapshot,
  WorkflowEdge,
  WorkflowNode,
} from "../lib/telemetry";

const API_URL =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_TELEMETRY_URL
    ? process.env.NEXT_PUBLIC_TELEMETRY_URL
    : "http://127.0.0.1:4311";

const stateLabels: Record<HealthState, string> = {
  healthy: "Operativo",
  degraded: "Atención",
  offline: "Sin conexión",
  unknown: "Sin datos",
};

const evidenceLabels: Record<WorkflowEdge["evidence"], string> = {
  observed: "Observada ahora",
  configured: "Configurada",
  indexed: "Indexada",
};

const taskStateLabels: Record<HermesTaskState, string> = {
  queued: "En cola",
  preparing: "Preparando",
  executing: "Ejecutando",
  "awaiting-review": "Esperando revisión",
  validating: "Validando",
  completed: "Completada",
  failed: "Fallida",
  blocked: "Bloqueada",
  "validation-failed": "Validación fallida",
};

const taskStages: Array<{
  state: HermesTaskState;
  label: string;
  nodeId: string;
}> = [
  { state: "queued", label: "Contrato", nodeId: "hermes-broker" },
  { state: "preparing", label: "Contexto", nodeId: "graphify" },
  { state: "executing", label: "Ejecución", nodeId: "hermes" },
  { state: "awaiting-review", label: "Revisión", nodeId: "director-review" },
  { state: "validating", label: "Validación", nodeId: "director-review" },
  { state: "completed", label: "Cierre", nodeId: "director-review" },
];

const unsuccessfulTaskStates = new Set<HermesTaskState>([
  "failed",
  "blocked",
  "validation-failed",
]);

const progressLabels: Record<string, string> = {
  queued: "En cola",
  starting: "Iniciando agente",
  "waiting-model": "Esperando al modelo",
  "agent-cpu": "Procesando localmente",
  "agent-event": "Interactuando con el modelo",
  "workspace-change": "Editando el workspace",
  "awaiting-review": "Listo para revisión",
  stalled: "Sin progreso",
  failed: "Interrumpido",
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatAge(value: string | null): string {
  if (!value) return "sin fecha";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.floor(hours / 24)} d`;
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days} d ${hours % 24} h` : `${hours} h`;
}

function StatePill({ state }: { state: HealthState }) {
  return (
    <span className={`state-pill state-${state}`}>
      <span className="state-dot" aria-hidden="true" />
      {stateLabels[state]}
    </span>
  );
}

function ServiceNode({
  service,
  index,
}: {
  service: ServiceHealth;
  index: number;
}) {
  return (
    <article
      className={`service-node state-border-${service.state}`}
      style={{ "--node-delay": `${index * 55}ms` } as React.CSSProperties}
    >
      <div className="node-terminal" aria-hidden="true" />
      <div className="node-topline">
        <span className="node-role">{service.role}</span>
        <StatePill state={service.state} />
      </div>
      <h3>{service.name}</h3>
      <p>{service.detail}</p>
      <div className="node-meta">
        <span>{service.latencyMs === null ? "—" : `${service.latencyMs} ms`}</span>
        <span>{formatTime(service.checkedAt)}</span>
      </div>
    </article>
  );
}

function WorkflowMap({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const selectedNode = selectedNodeId ? byId.get(selectedNodeId) ?? null : null;
  const selectedEdges = selectedNode
    ? edges.filter(
        (edge) => edge.source === selectedNode.id || edge.target === selectedNode.id,
      )
    : [];
  const relatedNodeIds = new Set<string>([selectedNodeId ?? ""]);
  for (const edge of selectedEdges) {
    relatedNodeIds.add(edge.source);
    relatedNodeIds.add(edge.target);
  }

  return (
    <div className="workflow-explorer">
      <div className="workflow-scroll">
        <div className="workflow-canvas" aria-label="Flujo de trabajo real">
          <svg
            className="workflow-links"
            viewBox="0 0 1000 520"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" />
              </marker>
            </defs>
            {edges.map((edge, index) => {
              const source = byId.get(edge.source);
              const target = byId.get(edge.target);
              if (!source || !target) return null;
              const x1 = source.x * 10;
              const y1 = source.y * 5.2;
              const x2 = target.x * 10;
              const y2 = target.y * 5.2;
              const bend = Math.max(24, Math.abs(x2 - x1) * 0.42);
              const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
              const connected = selectedEdges.some((item) => item.id === edge.id);
              return (
                <g
                  key={edge.id}
                  className={`flow-edge evidence-${edge.evidence} state-stroke-${edge.state}${
                    selectedNode ? (connected ? " edge-selected" : " edge-dimmed") : ""
                  }`}
                >
                  <path d={path} markerEnd="url(#arrow)" />
                  {edge.evidence === "observed" && (
                    <circle r="3.6">
                      <animateMotion
                        dur={`${2.8 + (index % 3) * 0.45}s`}
                        repeatCount="indefinite"
                        path={path}
                      />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>

          {nodes.map((node) => {
            const selected = node.id === selectedNodeId;
            const dimmed = selectedNode && !relatedNodeIds.has(node.id);
            return (
              <button
                key={node.id}
                type="button"
                className={`workflow-node node-kind-${node.kind} state-border-${node.state}${
                  selected ? " node-selected" : ""
                }${dimmed ? " node-dimmed" : ""}`}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                aria-pressed={selected}
                aria-controls="workflow-inspector"
                onClick={() => onSelectNode(selected ? null : node.id)}
              >
                <span className="workflow-role">{node.role}</span>
                <strong>{node.label}</strong>
                <small>{node.detail}</small>
              </button>
            );
          })}
        </div>
      </div>

      <aside
        className={`workflow-inspector${selectedNode ? " inspector-open" : ""}`}
        id="workflow-inspector"
        aria-live="polite"
      >
        {selectedNode ? (
          <>
            <div className="inspector-heading">
              <div>
                <span>{selectedNode.role}</span>
                <h3>{selectedNode.label}</h3>
              </div>
              <button
                type="button"
                className="inspector-close"
                onClick={() => onSelectNode(null)}
                aria-label="Cerrar detalle del nodo"
              >
                Cerrar
              </button>
            </div>
            <div className="inspector-summary">
              <StatePill state={selectedNode.state} />
              <p>{selectedNode.detail}</p>
            </div>
            <div className="inspector-connections">
              {selectedEdges.length > 0 ? (
                selectedEdges.map((edge) => {
                  const outgoing = edge.source === selectedNode.id;
                  const peer = byId.get(outgoing ? edge.target : edge.source);
                  return (
                    <article key={edge.id}>
                      <span>{outgoing ? "Salida" : "Entrada"}</span>
                      <strong>
                        {outgoing ? "→" : "←"} {peer?.label ?? "Nodo desconocido"}
                      </strong>
                      <p>{edge.label}</p>
                      <small>
                        {evidenceLabels[edge.evidence]} · {stateLabels[edge.state]} ·{" "}
                        {formatAge(edge.lastObservedAt)}
                      </small>
                    </article>
                  );
                })
              ) : (
                <p className="inspector-empty">Este nodo no tiene conexiones registradas.</p>
              )}
            </div>
          </>
        ) : (
          <div className="inspector-placeholder">
            <span>Explorar el circuito</span>
            <p>Selecciona un nodo para ver qué recibe, qué entrega y cuándo se observó.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function TaskJourney({
  task,
  onNavigate,
}: {
  task: HermesTaskSummary | null;
  onNavigate: (nodeId: string) => void;
}) {
  const currentIndex = task
    ? taskStages.findIndex((stage) => stage.state === task.state)
    : -1;
  const unsuccessful = task ? unsuccessfulTaskStates.has(task.state) : false;

  return (
    <div className="task-journey" aria-label="Recorrido de la última tarea Hermes">
      <div className="journey-heading">
        <div>
          <span>Recorrido de tarea</span>
          <strong>
            {task
              ? `${task.requestedBy} → ${task.projectName}`
              : "Sin tareas registradas"}
          </strong>
        </div>
        <span className={`journey-state${unsuccessful ? " journey-state-error" : ""}`}>
          {task ? taskStateLabels[task.state] : "En espera"}
        </span>
      </div>
      <ol className="journey-stages">
        {taskStages.map((stage, index) => {
          const active = task?.state === stage.state;
          const complete = currentIndex >= 0 && index < currentIndex;
          return (
            <li
              key={stage.state}
              className={`${active ? "stage-active" : ""}${
                complete ? "stage-complete" : ""
              }`}
            >
              <button type="button" onClick={() => onNavigate(stage.nodeId)}>
                <i aria-hidden="true">{complete ? "✓" : index + 1}</i>
                <span>{stage.label}</span>
                <small>
                  {active ? taskStateLabels[stage.state] : complete ? "Lista" : "Pendiente"}
                </small>
              </button>
            </li>
          );
        })}
        {unsuccessful && task && (
          <li className="stage-active stage-error">
            <button type="button" onClick={() => onNavigate("director-review")}>
              <i aria-hidden="true">!</i>
              <span>Incidencia</span>
              <small>{taskStateLabels[task.state]}</small>
            </button>
          </li>
        )}
      </ol>
      {task && (
        <p className="journey-meta">
          {task.phase} · {task.filesChanged} archivos · {task.patchBytes.toLocaleString("es-DO")} bytes
          de parche · {progressLabels[task.progressKind] ?? task.progressKind} ·{" "}
          {task.elapsedSeconds} s · actualizado {formatAge(task.updatedAt)}
        </p>
      )}
    </div>
  );
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

function HermesLab({
  benchmark,
  computePercent,
  modelPerformance,
  insights,
}: {
  benchmark: HermesBenchmarkSummary;
  computePercent: number | null;
  modelPerformance: HermesModelPerformance[];
  insights: HermesInsightsSummary;
}) {
  const maxToolCalls = Math.max(...insights.tools.map((tool) => tool.calls), 1);
  const maxDailySessions = Math.max(
    ...insights.activity.byDay.map((day) => day.count),
    1,
  );

  return (
    <section className="hermes-lab" aria-labelledby="hermes-lab-title">
      <div className="lab-intro">
        <p className="eyebrow">Hermes Lab · evidencia local saneada</p>
        <h3 id="hermes-lab-title">Modelos, uso y ahorro, en una sola lectura.</h3>
        <p>
          Métricas agregadas de SessionDB e InsightsEngine. No conserva prompts,
          respuestas, IDs de sesión ni argumentos de herramientas.
        </p>
      </div>

      <div className="model-rack" aria-label="Comparación de modelos Hermes">
        {modelPerformance.map((model) => (
          <article className={`model-card model-${model.role}`} key={model.model}>
            <div className="model-heading">
              <span>{model.role === "primary" ? "Principal" : "Fallback"}</span>
              <strong>{model.displayName}</strong>
              <small>{model.model}</small>
            </div>
            <div className="model-speed">
              <strong>{model.tokensPerSecond.toFixed(2)}</strong>
              <span>tokens / segundo sostenidos</span>
            </div>
            <dl>
              <div><dt>Contexto</dt><dd>{(model.contextLength / 1024).toFixed(0)}K</dd></div>
              <div><dt>Paralelo</dt><dd>{model.parallel}</dd></div>
              <div><dt>GPU</dt><dd>{model.gpuOffload}</dd></div>
              <div><dt>MTP</dt><dd>{model.mtpEnabled ? "Sí" : "No"}</dd></div>
              <div><dt>Compute medio / pico</dt><dd>{model.gpuComputeAveragePercent}% / {model.gpuComputePeakPercent}%</dd></div>
              <div><dt>VRAM / compartida</dt><dd>{model.dedicatedMemoryGiB} / {model.sharedMemoryGiB} GiB</dd></div>
              <div><dt>Agente completo</dt><dd>PASS · {model.fullAgentPassSeconds} s</dd></div>
            </dl>
          </article>
        ))}
      </div>

      <div className="insights-hero">
        <div>
          <span>Tokens locales</span>
          <strong>{insights.overview.totalTokens.toLocaleString("es-DO")}</strong>
          <small>{insights.overview.sessions} sesiones · {insights.overview.messages} mensajes</small>
        </div>
        <div className="savings-cell">
          <span>Ahorro vs. GPT-5.6 Sol</span>
          <strong>{formatUsd(insights.overview.avoidedGpt56SolCostUsd)}</strong>
          <small>Costo local {formatUsd(insights.overview.localCostUsd)}</small>
        </div>
        <div>
          <span>GPU ahora</span>
          <strong>{computePercent === null ? "—" : `${computePercent.toFixed(1)}%`}</strong>
          <small>Compute instantáneo RX 9070</small>
        </div>
        <div>
          <span>Herramientas</span>
          <strong>{insights.overview.toolCalls.toLocaleString("es-DO")}</strong>
          <small>{insights.skills.totalLoads} cargas de skills</small>
        </div>
      </div>

      <div className="insights-grid">
        <article className="insight-panel token-ledger">
          <header><span>Consumo agregado</span><strong>Tokens y sesiones</strong></header>
          <dl className="dense-stats">
            <div><dt>Entrada</dt><dd>{insights.overview.inputTokens.toLocaleString("es-DO")}</dd></div>
            <div><dt>Salida</dt><dd>{insights.overview.outputTokens.toLocaleString("es-DO")}</dd></div>
            <div><dt>Evitados en nube</dt><dd>{insights.overview.avoidedCloudTokens.toLocaleString("es-DO")}</dd></div>
            <div><dt>Mensajes usuario</dt><dd>{insights.overview.userMessages}</dd></div>
            <div><dt>Mensajes asistente</dt><dd>{insights.overview.assistantMessages}</dd></div>
            <div><dt>Mensajes tool</dt><dd>{insights.overview.toolMessages}</dd></div>
            <div><dt>Horas activas</dt><dd>{insights.overview.activeHours}</dd></div>
            <div><dt>Promedio sesión</dt><dd>{insights.overview.averageSessionSeconds} s</dd></div>
            <div><dt>Mensajes / sesión</dt><dd>{insights.overview.averageMessagesPerSession}</dd></div>
          </dl>
          <p className="pricing-note">
            Referencia {insights.pricing.referenceModel}: {formatUsd(insights.pricing.inputPerMillionUsd)}/M entrada · {formatUsd(insights.pricing.outputPerMillionUsd)}/M salida · {insights.pricing.tier}
          </p>
        </article>

        <article className="insight-panel model-usage">
          <header><span>Distribución</span><strong>Uso por modelo</strong></header>
          {insights.models.map((model) => (
            <div className="usage-row" key={model.model}>
              <strong>{model.model}</strong>
              <span>{model.totalTokens.toLocaleString("es-DO")} tokens · {model.sessions} sesiones</span>
              <small>
                {model.inputTokens.toLocaleString("es-DO")} in · {model.outputTokens.toLocaleString("es-DO")} out · {model.reasoningTokens.toLocaleString("es-DO")} reasoning · {model.apiCalls} API · {model.toolCalls} tools · ahorro {formatUsd(model.avoidedGpt56SolCostUsd)} · local {formatUsd(model.localCostUsd)}
              </small>
            </div>
          ))}
        </article>

        <article className="insight-panel tool-usage">
          <header><span>Operación</span><strong>Herramientas</strong></header>
          {insights.tools.map((tool) => (
            <div className="meter-row" key={tool.tool}>
              <span>{tool.tool}</span>
              <i><b style={{ width: `${(tool.calls / maxToolCalls) * 100}%` }} /></i>
              <strong>{tool.calls}</strong>
              <small>{tool.percentage}%</small>
            </div>
          ))}
        </article>

        <article className="insight-panel platform-usage">
          <header><span>Superficies</span><strong>Plataformas y skills</strong></header>
          {insights.platforms.map((platform) => (
            <div className="usage-row" key={platform.platform}>
              <strong>{platform.platform}</strong>
              <span>{platform.sessions} sesiones · {platform.messages} mensajes</span>
              <small>{platform.totalTokens.toLocaleString("es-DO")} tokens · {platform.toolCalls} tools</small>
            </div>
          ))}
          <div className="skill-summary">
            <span>{insights.skills.distinct} skills distintas</span>
            <strong>{insights.skills.totalLoads} cargas · {insights.skills.totalEdits} ediciones</strong>
          </div>
          {insights.skills.top.map((skill) => (
            <div className="skill-row" key={skill.skill}>
              <span>{skill.skill}</span>
              <small>{skill.loads} cargas · {skill.edits} ediciones · {skill.total} total</small>
            </div>
          ))}
        </article>

        <article className="insight-panel activity-panel">
          <header><span>Cadencia</span><strong>Actividad</strong></header>
          <div className="day-bars">
            {insights.activity.byDay.map((day) => (
              <div key={day.day}>
                <i><b style={{ height: `${(day.count / maxDailySessions) * 100}%` }} /></i>
                <strong>{day.count}</strong>
                <span>{day.day}</span>
              </div>
            ))}
          </div>
          <div className="activity-facts">
            <span>Día pico <strong>{insights.activity.busiestDay}</strong></span>
            <span>Hora pico <strong>{insights.activity.busiestHour}:00</strong></span>
            <span>Días activos <strong>{insights.activity.activeDays}</strong></span>
            <span>Racha máxima <strong>{insights.activity.maxStreak}</strong></span>
          </div>
          <div className="hour-strip" aria-label="Sesiones por hora">
            {insights.activity.byHour.map((hour) => (
              <span key={hour.hour} title={`${hour.hour}:00 · ${hour.count}`} data-active={hour.count > 0}>
                {hour.count}
              </span>
            ))}
          </div>
        </article>

        <article className="insight-panel records-panel">
          <header><span>Récords saneados</span><strong>Sesiones destacadas</strong></header>
          {insights.topSessions.map((session) => (
            <div className="record-row" key={session.label}>
              <span>{session.label}</span>
              <strong>{session.value}</strong>
              <small>{session.date}</small>
            </div>
          ))}
          <div className="benchmark-mini">
            <span>Prueba sintética</span>
            <strong>{benchmark.total ? `${benchmark.passed}/${benchmark.total} PASS` : "Sin línea base"}</strong>
            <small>
              {benchmark.tokensPerSecond ? `${benchmark.tokensPerSecond.toFixed(1)} t/s · offload ${benchmark.gpuOffload * 100}%` : "Ejecuta el benchmark local"}
            </small>
          </div>
          <div className="lab-tests">
            {benchmark.tests.map((test) => (
              <div key={test.id} className={test.passed ? "lab-pass" : "lab-fail"}>
                <i aria-hidden="true" />
                <span>{test.id.replaceAll("-", " ")} · {test.durationMs} ms</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <p className="lab-updated">
        {insights.generatedAt
          ? `Insights actualizados ${formatAge(insights.generatedAt)}`
          : "Sin Insights todavía"}
      </p>
    </section>
  );
}

function ExactFlowchartDiagram() {
  return (
    <div className="exact-flowchart-card" aria-label="Diagrama de Flujo Oficial TRAMA">
      <div className="flowchart-header">
        <span className="flow-badge">Arquitectura Oficial</span>
        <h3>Diagrama de Gobernanza: IA Manager ($) → Hermes Worker ($0)</h3>
        <p>Circuito 2D exacto de delegación, consulta AST, revisión y observabilidad privada en tiempo real.</p>
      </div>

      <div className="svg-canvas-wrapper">
        <svg
          viewBox="0 0 960 670"
          className="exact-mermaid-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Arrowhead marker for solid lines */}
            <marker
              id="m-arrow-blue"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="#69d7d1" />
            </marker>
            {/* Arrowhead marker for dashed lines */}
            <marker
              id="m-arrow-dash"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="#91a8ae" />
            </marker>
          </defs>

          {/* Subgraph Container: Observabilidad Privada */}
          <g className="subgraph-container">
            <rect
              x="585"
              y="60"
              width="250"
              height="150"
              rx="6"
              fill="#0e2533"
              stroke="#284653"
              strokeWidth="1.5"
            />
            <text x="600" y="84" fill="#69d7d1" fontSize="11" fontWeight="bold" fontFamily="monospace" letterSpacing="0.1em">
              OBSERVABILIDAD PRIVADA
            </text>

            {/* Dashboard TRAMA Node inside Subgraph */}
            <rect
              x="605"
              y="98"
              width="210"
              height="80"
              rx="4"
              fill="#173140"
              stroke="#69d7d1"
              strokeWidth="1.5"
            />
            <text x="710" y="132" textAnchor="middle" fill="#e8efe9" fontSize="15" fontWeight="bold" fontFamily="sans-serif">
              Dashboard TRAMA
            </text>
            <text x="710" y="156" textAnchor="middle" fill="#69d7d1" fontSize="13" fontWeight="bold" fontFamily="monospace">
              127.0.0.1:4310
            </text>
          </g>

          {/* Node 1: Usuario (Pill Shape) */}
          <g className="node-usuario">
            <rect x="300" y="20" width="130" height="42" rx="21" fill="#102936" stroke="#315463" strokeWidth="1.5" />
            <text x="365" y="46" textAnchor="middle" fill="#e8efe9" fontSize="14" fontWeight="bold" fontFamily="sans-serif">
              Usuario
            </text>
          </g>

          {/* Connector 1: Usuario -> Manager */}
          <path id="flow-p1" d="M 365 62 L 365 140" fill="none" stroke="#69d7d1" strokeWidth="2" markerEnd="url(#m-arrow-blue)" />
          <circle r="3.5" fill="#69d7d1" filter="drop-shadow(0 0 6px #69d7d1)">
            <animateMotion dur="2.2s" repeatCount="indefinite" path="M 365 62 L 365 140" />
          </circle>
          {/* Label box: Solicitud */}
          <rect x="333" y="88" width="64" height="24" rx="3" fill="#0e2533" stroke="#284653" strokeWidth="1" />
          <text x="365" y="104" textAnchor="middle" fill="#91a8ae" fontSize="11" fontFamily="sans-serif">
            Solicitud
          </text>

          {/* Node 2: IA de Pago Manager (Rect) */}
          <g className="node-manager">
            <rect x="235" y="140" width="260" height="66" rx="4" fill="#173140" stroke="#f0a36a" strokeWidth="2" />
            <text x="365" y="167" textAnchor="middle" fill="#e8efe9" fontSize="15" fontWeight="bold" fontFamily="sans-serif">
              IA de Pago Manager
            </text>
            <text x="365" y="188" textAnchor="middle" fill="#f0a36a" fontSize="12" fontFamily="monospace">
              Antigravity / Codex / Claude
            </text>
          </g>

          {/* Branch Left: Manager -> Graphify */}
          <path id="flow-p2" d="M 300 206 L 300 235 L 140 235 L 140 320" fill="none" stroke="#f0a36a" strokeWidth="2" markerEnd="url(#m-arrow-blue)" />
          <circle r="3.5" fill="#f0a36a" filter="drop-shadow(0 0 6px #f0a36a)">
            <animateMotion dur="2.8s" repeatCount="indefinite" path="M 300 206 L 300 235 L 140 235 L 140 320" />
          </circle>
          {/* Label: 1. Consulta Subgrafo AST */}
          <rect x="60" y="223" width="160" height="24" rx="3" fill="#0e2533" stroke="#284653" strokeWidth="1" />
          <text x="140" y="239" textAnchor="middle" fill="#f0a36a" fontSize="11" fontFamily="sans-serif">
            1. Consulta Subgrafo AST
          </text>
          {/* Node: Graphify Local AST */}
          <rect x="40" y="320" width="200" height="50" rx="4" fill="#102936" stroke="#f0a36a" strokeWidth="1.5" />
          <text x="140" y="350" textAnchor="middle" fill="#e8efe9" fontSize="14" fontWeight="bold" fontFamily="sans-serif">
            Graphify Local AST
          </text>

          {/* Branch Middle: Manager -> submit-hermes-task.ps1 */}
          <path id="flow-p3" d="M 365 206 L 365 320" fill="none" stroke="#69d7d1" strokeWidth="2" markerEnd="url(#m-arrow-blue)" />
          <circle r="3.5" fill="#69d7d1" filter="drop-shadow(0 0 6px #69d7d1)">
            <animateMotion dur="2.2s" repeatCount="indefinite" path="M 365 206 L 365 320" />
          </circle>
          {/* Label: 2. Envía Contrato de Tarea */}
          <rect x="285" y="235" width="160" height="24" rx="3" fill="#0e2533" stroke="#284653" strokeWidth="1" />
          <text x="365" y="251" textAnchor="middle" fill="#91a8ae" fontSize="11" fontFamily="sans-serif">
            2. Envía Contrato de Tarea
          </text>
          {/* Node: submit-hermes-task.ps1 */}
          <rect x="270" y="320" width="190" height="50" rx="4" fill="#102936" stroke="#315463" strokeWidth="1.5" strokeDasharray="4 2" />
          <text x="365" y="350" textAnchor="middle" fill="#e8efe9" fontSize="14" fontWeight="bold" fontFamily="monospace">
            submit-hermes-task.ps1
          </text>

          {/* Connector: submit-hermes-task.ps1 -> Hermes */}
          <path id="flow-p4" d="M 365 370 L 365 460" fill="none" stroke="#69d7d1" strokeWidth="2" markerEnd="url(#m-arrow-blue)" />
          <circle r="3.5" fill="#69d7d1" filter="drop-shadow(0 0 6px #69d7d1)">
            <animateMotion dur="2.0s" repeatCount="indefinite" path="M 365 370 L 365 460" />
          </circle>
          {/* Label: 3. Trabajo Pesado en Worktree */}
          <rect x="275" y="395" width="180" height="24" rx="3" fill="#0e2533" stroke="#284653" strokeWidth="1" />
          <text x="365" y="411" textAnchor="middle" fill="#69d7d1" fontSize="11" fontFamily="sans-serif">
            3. Trabajo Pesado en Worktree
          </text>
          {/* Node: Hermes + LM Studio */}
          <rect x="250" y="460" width="230" height="66" rx="4" fill="#132a35" stroke="#69d7d1" strokeWidth="2" />
          <text x="365" y="487" textAnchor="middle" fill="#e8efe9" fontSize="15" fontWeight="bold" fontFamily="sans-serif">
            Hermes + LM Studio
          </text>
          <text x="365" y="508" textAnchor="middle" fill="#e8c36a" fontSize="12" fontFamily="monospace">
            Qwen 3.6 35B Local
          </text>

          {/* Connector: Hermes -> changes.patch */}
          <path id="flow-p5" d="M 365 526 L 365 600" fill="none" stroke="#69d7d1" strokeWidth="2" markerEnd="url(#m-arrow-blue)" />
          <circle r="3.5" fill="#69d7d1" filter="drop-shadow(0 0 6px #69d7d1)">
            <animateMotion dur="2.0s" repeatCount="indefinite" path="M 365 526 L 365 600" />
          </circle>
          {/* Label: 4. Genera Patch */}
          <rect x="315" y="546" width="100" height="24" rx="3" fill="#0e2533" stroke="#284653" strokeWidth="1" />
          <text x="365" y="562" textAnchor="middle" fill="#91a8ae" fontSize="11" fontFamily="sans-serif">
            4. Genera Patch
          </text>
          {/* Node: changes.patch */}
          <rect x="285" y="600" width="160" height="48" rx="4" fill="#102936" stroke="#e8c36a" strokeWidth="1.5" />
          <text x="365" y="629" textAnchor="middle" fill="#e8efe9" fontSize="14" fontWeight="bold" fontFamily="monospace">
            changes.patch
          </text>

          {/* Branch Right: Manager -> review-hermes-task.ps1 */}
          <path id="flow-p6" d="M 430 206 L 430 235 L 750 235 L 750 360" fill="none" stroke="#e8c36a" strokeWidth="2" markerEnd="url(#m-arrow-blue)" />
          <circle r="3.5" fill="#e8c36a" filter="drop-shadow(0 0 6px #e8c36a)">
            <animateMotion dur="2.8s" repeatCount="indefinite" path="M 430 206 L 430 235 L 750 235 L 750 360" />
          </circle>
          {/* Label: 5. Revisa Patch y Testea */}
          <rect x="670" y="223" width="160" height="24" rx="3" fill="#0e2533" stroke="#284653" strokeWidth="1" />
          <text x="750" y="239" textAnchor="middle" fill="#e8c36a" fontSize="11" fontFamily="sans-serif">
            5. Revisa Patch y Testea
          </text>
          {/* Node: review-hermes-task.ps1 */}
          <rect x="655" y="360" width="190" height="50" rx="4" fill="#102936" stroke="#e8c36a" strokeWidth="1.5" strokeDasharray="4 2" />
          <text x="750" y="390" textAnchor="middle" fill="#e8efe9" fontSize="14" fontWeight="bold" fontFamily="monospace">
            review-hermes-task.ps1
          </text>

          {/* Connector: review-hermes-task.ps1 -> Repositorio Git */}
          <path id="flow-p7" d="M 750 410 L 750 500" fill="none" stroke="#69d7d1" strokeWidth="2" markerEnd="url(#m-arrow-blue)" />
          <circle r="3.5" fill="#69d7d1" filter="drop-shadow(0 0 6px #69d7d1)">
            <animateMotion dur="2.0s" repeatCount="indefinite" path="M 750 410 L 750 500" />
          </circle>
          {/* Label: 6. Integración y Cierre */}
          <rect x="670" y="435" width="160" height="24" rx="3" fill="#0e2533" stroke="#284653" strokeWidth="1" />
          <text x="750" y="451" textAnchor="middle" fill="#91a8ae" fontSize="11" fontFamily="sans-serif">
            6. Integración y Cierre
          </text>
          {/* Node: Repositorio Git */}
          <rect x="670" y="500" width="160" height="48" rx="4" fill="#13232d" stroke="#69d7d1" strokeWidth="1.5" />
          <text x="750" y="529" textAnchor="middle" fill="#e8efe9" fontSize="14" fontWeight="bold" fontFamily="sans-serif">
            Repositorio Git
          </text>

          {/* Dashed Line 1: TRAMA -> Hermes */}
          <path
            id="flow-obs1"
            d="M 605 138 L 520 138 L 520 493 L 480 493"
            fill="none"
            stroke="#91a8ae"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            markerEnd="url(#m-arrow-dash)"
          />
          <circle r="3" fill="#69d7d1" opacity="0.85" filter="drop-shadow(0 0 4px #69d7d1)">
            <animateMotion dur="3.2s" repeatCount="indefinite" path="M 605 138 L 520 138 L 520 493 L 480 493" />
          </circle>
          {/* Label: Observa Estados */}
          <rect x="470" y="320" width="100" height="24" rx="3" fill="#0e2533" stroke="#284653" strokeWidth="1" />
          <text x="520" y="336" textAnchor="middle" fill="#91a8ae" fontSize="11" fontFamily="sans-serif">
            Observa Estados
          </text>

          {/* Dashed Line 2: TRAMA -> review-hermes-task.ps1 */}
          <path
            id="flow-obs2"
            d="M 815 138 L 895 138 L 895 385 L 845 385"
            fill="none"
            stroke="#91a8ae"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            markerEnd="url(#m-arrow-dash)"
          />
          <circle r="3" fill="#69d7d1" opacity="0.85" filter="drop-shadow(0 0 4px #69d7d1)">
            <animateMotion dur="3.2s" begin="1.6s" repeatCount="indefinite" path="M 815 138 L 895 138 L 895 385 L 845 385" />
          </circle>
          {/* Label: Observa Colas y Patches */}
          <rect x="815" y="275" width="135" height="24" rx="3" fill="#0e2533" stroke="#284653" strokeWidth="1" />
          <text x="882" y="291" textAnchor="middle" fill="#91a8ae" fontSize="11" fontFamily="sans-serif">
            Observa Colas y Patches
          </text>
        </svg>
      </div>
    </div>
  );
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<
    "connecting" | "live" | "retrying"
  >("connecting");

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/status`)
      .then((response) => {
        if (!response.ok) throw new Error("telemetry unavailable");
        return response.json() as Promise<TelemetrySnapshot>;
      })
      .then((data) => active && setSnapshot(data))
      .catch(() => active && setStreamState("retrying"));

    const source = new EventSource(`${API_URL}/api/events`);
    source.addEventListener("snapshot", (event) => {
      if (!active) return;
      setSnapshot(JSON.parse((event as MessageEvent<string>).data));
      setStreamState("live");
    });
    source.onerror = () => active && setStreamState("retrying");

    return () => {
      active = false;
      source.close();
    };
  }, []);

  useEffect(() => {
    if (
      selectedNodeId &&
      snapshot &&
      !snapshot.workflow.nodes.some((node) => node.id === selectedNodeId)
    ) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, snapshot]);

  const healthyCount =
    snapshot?.services.filter((service) => service.state === "healthy").length ?? 0;

  const activityCount =
    snapshot?.connections.reduce(
      (total, connection) =>
        total + connection.successfulChecks + connection.failedChecks,
      0,
    ) ?? "—";

  return (
    <main>
      <header className="masthead">
        <a className="brand" href="#top" aria-label="Ir al inicio">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>TRAMA</strong>
            <small>Observador local</small>
          </span>
        </a>
        <nav className="mast-nav" aria-label="Secciones">
          <a href="#top">Diagrama</a>
          <a href="#flujo">Flujo</a>
          <a href="#grafo">Grafo</a>
          <a href="#servicios">Servicios</a>
        </nav>
        <div className={`live-indicator stream-${streamState}`} role="status">
          <span aria-hidden="true" />
          {streamState === "live"
            ? "Señal en vivo"
            : streamState === "retrying"
              ? "Reconectando"
              : "Conectando"}
        </div>
      </header>

      <section className="official-flow-section" id="top" style={{ padding: "20px 24px 0" }}>
        <ExactFlowchartDiagram />
      </section>

      <section className="signal-room">
        <div className="hero-copy">
          <p className="eyebrow">Sistema local · lectura {snapshot?.sequence ?? "—"}</p>
          <h1>
            El trabajo,
            <br />
            <em>puesto en circuito.</em>
          </h1>
          <p className="hero-description">
            Sigue el recorrido real entre agentes, modelo, GPU, herramientas y
            proyectos. Las líneas continuas son señales observadas; las discontinuas,
            rutas configuradas.
          </p>
        </div>

        <div className="signal-summary" aria-label="Resumen del sistema">
          <div className="summary-dial">
            <span
              className={`dial-core state-bg-${snapshot?.overallState ?? "unknown"}`}
            >
              {healthyCount}
            </span>
            <p>
              <strong>de {snapshot?.services.length ?? 8}</strong>
              <span>servicios operativos</span>
            </p>
          </div>
          <dl>
            <div>
              <dt>VRAM</dt>
              <dd>
                {snapshot?.system.gpuDedicatedUsedGiB === null ||
                snapshot?.system.gpuDedicatedUsedGiB === undefined
                  ? "—"
                  : `${snapshot.system.gpuDedicatedUsedGiB} G`}
              </dd>
            </div>
            <div>
              <dt>Grafo</dt>
              <dd>{snapshot?.graph.nodeCount.toLocaleString("es-DO") ?? "—"}</dd>
            </div>
            <div>
              <dt>Actividad</dt>
              <dd>{activityCount}</dd>
            </div>
          </dl>
        </div>

        <div className="signal-spine" aria-hidden="true">
          <span className="spine-label">127.0.0.1</span>
          <i className="signal-pulse pulse-one" />
          <i className="signal-pulse pulse-two" />
          <i className="signal-pulse pulse-three" />
        </div>
      </section>

      <section className="workflow-field" id="flujo" aria-labelledby="workflow-title">
        <div className="section-heading workflow-heading">
          <div>
            <p className="eyebrow">Flujo de trabajo real</p>
            <h2 id="workflow-title">De la tarea al proyecto</h2>
          </div>
          <div className="flow-legend">
            {Object.entries(evidenceLabels).map(([evidence, label]) => (
              <span key={evidence} className={`legend-${evidence}`}>
                <i />
                {label}
              </span>
            ))}
          </div>
        </div>
        {snapshot ? (
          <WorkflowMap
            nodes={snapshot.workflow.nodes}
            edges={snapshot.workflow.edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        ) : (
          <div className="workflow-loading">Construyendo el circuito local…</div>
        )}
        <TaskJourney
          task={snapshot?.delegation.latestTask ?? null}
          onNavigate={setSelectedNodeId}
        />
        {snapshot ? (
          <HermesLab
            benchmark={snapshot.delegation.benchmark}
            computePercent={snapshot.system.gpuComputePercent}
            modelPerformance={snapshot.delegation.modelPerformance}
            insights={snapshot.delegation.insights}
          />
        ) : (
          <div className="workflow-loading">Preparando Hermes Insights…</div>
        )}
        <div className="efficiency-strip" aria-label="Eficiencia de delegación local">
          <div>
            <span>Tokens delegados</span>
            <strong>{snapshot?.delegation.efficiency.localTokens.toLocaleString("es-DO") ?? "—"}</strong>
          </div>
          <div>
            <span>Ahorro delegado</span>
            <strong>{snapshot ? formatUsd(snapshot.delegation.efficiency.avoidedGpt56SolCostUsd) : "—"}</strong>
          </div>
          <div>
            <span>Aceptación</span>
            <strong>{snapshot ? `${snapshot.delegation.efficiency.acceptanceRate}%` : "—"}</strong>
          </div>
          <div>
            <span>Uso capturado</span>
            <strong>{snapshot?.delegation.efficiency.capturedTasks ?? "—"}</strong>
            <small>{snapshot?.delegation.efficiency.schemaFailures ?? "—"} fallos de esquema</small>
          </div>
        </div>
        <div className="delegation-strip" aria-label="Estado de delegación local">
          <div>
            <span>Cola</span>
            <strong>{snapshot?.delegation.queuedCount ?? "—"}</strong>
          </div>
          <div>
            <span>Hermes activo</span>
            <strong>{snapshot?.delegation.activeCount ?? "—"}</strong>
          </div>
          <div>
            <span>Revisión del director</span>
            <strong>{snapshot?.delegation.awaitingReviewCount ?? "—"}</strong>
          </div>
          <div>
            <span>Validadas</span>
            <strong>{snapshot?.delegation.completedCount ?? "—"}</strong>
          </div>
          <div className="delegation-latest">
            <span>Última tarea</span>
            <strong>
              {snapshot?.delegation.latestTask
                ? `${snapshot.delegation.latestTask.requestedBy} → ${snapshot.delegation.latestTask.projectName} · ${snapshot.delegation.latestTask.state}`
                : "Sin actividad"}
            </strong>
          </div>
        </div>
        <p className="provenance-line">
          Evidencia actualizada{" "}
          <strong>{snapshot ? formatAge(snapshot.generatedAt) : "sin datos"}</strong>.
          No se capturan prompts, respuestas ni argumentos de herramientas.
        </p>
      </section>

      <section className="graph-field" id="grafo" aria-labelledby="graph-title">
        <div className="graph-intro">
          <p className="eyebrow">Graphify · conocimiento local</p>
          <h2 id="graph-title">El mapa que ya construiste está conectado.</h2>
          <p>
            Codex, Claude, Antigravity, OpenCode y Hermes consultan relaciones
            estructurales antes de recorrer archivos. El dashboard lee únicamente
            métricas y procedencia del grafo global.
          </p>
          <div className="integration-state">
            <span>
              <i className={snapshot?.graph.codexIntegrated ? "ok" : ""} />
              Codex
            </span>
            <span>
              <i className={snapshot?.graph.claudeIntegrated ? "ok" : ""} />
              Claude
            </span>
            <span>
              <i className={snapshot?.graph.antigravityIntegrated ? "ok" : ""} />
              Antigravity
            </span>
            <span>
              <i className={snapshot?.graph.openCodeIntegrated ? "ok" : ""} />
              OpenCode
            </span>
            <span>
              <i className={snapshot?.graph.hermesIntegrated ? "ok" : ""} />
              Hermes localai
            </span>
          </div>
        </div>

        <div className="graph-metrics">
          <div>
            <span>Nodos</span>
            <strong>{snapshot?.graph.nodeCount.toLocaleString("es-DO") ?? "—"}</strong>
          </div>
          <div>
            <span>Relaciones</span>
            <strong>{snapshot?.graph.edgeCount.toLocaleString("es-DO") ?? "—"}</strong>
          </div>
          <div>
            <span>Comunidades</span>
            <strong>{snapshot?.graph.communityCount ?? "—"}</strong>
          </div>
          <div>
            <span>Actualizado</span>
            <strong className="metric-age">
              {formatAge(snapshot?.graph.updatedAt ?? null)}
            </strong>
          </div>
        </div>

        <div className="project-ledger">
          <div className="ledger-heading">
            <span>Proyectos indexados</span>
            <span>Git · nodos / relaciones</span>
          </div>
          {snapshot?.graph.repositories.map((repository) => (
            <div className="project-row" key={repository.id}>
              <div>
                <i
                  className={
                    repository.graphStatus === "failed"
                      ? "project-index-failed"
                      : ""
                  }
                  aria-hidden="true"
                />
                <span className="project-identity">
                  <strong>{repository.label}</strong>
                  {repository.rootAlias && <small>{repository.rootAlias}</small>}
                </span>
              </div>
              <div className="project-facts">
                <span
                  className={`git-badge git-${repository.gitScope}${
                    repository.gitDirty ? " git-dirty" : ""
                  }`}
                >
                  {repository.gitScope === "own"
                    ? `Git · ${repository.gitBranch ?? "detached"}`
                    : repository.gitScope === "inherited"
                      ? "Git heredado"
                      : repository.gitScope === "none"
                        ? "Sin Git"
                        : "Git sin catalogar"}
                </span>
                <span>
                  {repository.nodeCount.toLocaleString("es-DO")} /{" "}
                  {repository.edgeCount.toLocaleString("es-DO")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        className="service-field"
        id="servicios"
        aria-labelledby="services-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Estado operativo</p>
            <h2 id="services-title">Herramientas observadas</h2>
          </div>
          <p>
            Actualización en vivo por eventos · sondeo completo cada 15 segundos
            <br />
            <span>
              Última lectura {snapshot ? formatTime(snapshot.generatedAt) : "—"}
            </span>
          </p>
        </div>

        <div className="nodes-grid">
          {snapshot ? (
            snapshot.services.map((service, index) => (
              <ServiceNode key={service.id} service={service} index={index} />
            ))
          ) : (
            <div className="loading-state" role="status">
              <span className="loading-track">
                <i />
              </span>
              Leyendo las señales locales…
            </div>
          )}
        </div>
      </section>

      <section className="lower-grid">
        <article className="traffic-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Comunicación</p>
              <h2>Tráfico de comprobación</h2>
            </div>
          </div>
          <div className="connection-list">
            {snapshot?.connections.map((connection) => (
              <div className="connection-row" key={connection.id}>
                <span className={`connection-light state-bg-${connection.state}`} />
                <div>
                  <strong>{connection.target}</strong>
                  <small>
                    {connection.protocol} · {connection.latencyMs ?? "—"} ms
                  </small>
                </div>
                <div className="connection-count">
                  <strong>{connection.successfulChecks}</strong>
                  <small>correctas</small>
                </div>
                <div className="connection-count failed">
                  <strong>{connection.failedChecks}</strong>
                  <small>fallidas</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="events-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Bitácora</p>
              <h2>Cambios de estado</h2>
            </div>
            <span className="event-count">{snapshot?.events.length ?? 0}</span>
          </div>
          <ol className="event-list">
            {snapshot?.events.slice(0, 10).map((event) => (
              <li key={event.id} className={`event-${event.severity}`}>
                <time dateTime={event.timestamp}>{formatTime(event.timestamp)}</time>
                <div>
                  <strong>{event.source}</strong>
                  <p>{event.message}</p>
                </div>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <footer>
        <p>
          <span className="privacy-lock" aria-hidden="true" />
          Escucha exclusiva en <strong>127.0.0.1</strong> · no captura
          conversaciones ni credenciales
        </p>
        <p>
          TRAMA · equipo activo{" "}
          {snapshot ? formatUptime(snapshot.system.uptimeSeconds) : "—"}
        </p>
      </footer>
    </main>
  );
}
