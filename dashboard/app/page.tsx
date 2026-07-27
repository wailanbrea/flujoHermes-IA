import { useEffect, useMemo, useState } from "react";
import type {
  HealthState,
  ServiceHealth,
  TelemetrySnapshot,
  WorkflowEdge,
  WorkflowNode,
} from "../lib/telemetry";

const API_URL =
  process.env.NEXT_PUBLIC_TELEMETRY_URL ?? "http://127.0.0.1:4311";

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
}: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return (
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
            return (
              <g
                key={edge.id}
                className={`flow-edge evidence-${edge.evidence} state-stroke-${edge.state}`}
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

        {nodes.map((node) => (
          <article
            key={node.id}
            className={`workflow-node node-kind-${node.kind} state-border-${node.state}`}
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
          >
            <span className="workflow-role">{node.role}</span>
            <strong>{node.label}</strong>
            <small>{node.detail}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);
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

  const healthyCount = useMemo(
    () =>
      snapshot?.services.filter((service) => service.state === "healthy").length ??
      0,
    [snapshot],
  );

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

      <section className="signal-room" id="top">
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
          <WorkflowMap nodes={snapshot.workflow.nodes} edges={snapshot.workflow.edges} />
        ) : (
          <div className="workflow-loading">Construyendo el circuito local…</div>
        )}
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
            Codex y Hermes consultan relaciones estructurales antes de recorrer archivos.
            El dashboard lee únicamente métricas y procedencia del grafo global.
          </p>
          <div className="integration-state">
            <span>
              <i className={snapshot?.graph.codexIntegrated ? "ok" : ""} />
              Codex
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
            Actualización cada 4 segundos
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
