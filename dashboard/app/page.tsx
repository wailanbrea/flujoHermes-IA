import { useEffect, useMemo, useState } from "react";
import type {
  HealthState,
  ServiceHealth,
  TelemetrySnapshot,
} from "../lib/telemetry";

const API_URL =
  process.env.NEXT_PUBLIC_TELEMETRY_URL ?? "http://127.0.0.1:4311";

const stateLabels: Record<HealthState, string> = {
  healthy: "Operativo",
  degraded: "Atención",
  offline: "Sin conexión",
  unknown: "Sin datos",
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
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
          <p className="eyebrow">Sistema local · {snapshot?.sequence ?? "—"}</p>
          <h1>
            Cada herramienta,
            <br />
            <em>una señal visible.</em>
          </h1>
          <p className="hero-description">
            Estado, conexión y comunicación de tu entorno de IA en tiempo real.
            Solo telemetría operativa; el contenido permanece privado.
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
              <strong>de {snapshot?.services.length ?? 6}</strong>
              <span>servicios operativos</span>
            </p>
          </div>
          <dl>
            <div>
              <dt>Memoria</dt>
              <dd>{snapshot ? `${snapshot.system.memoryUsagePercent}%` : "—"}</dd>
            </div>
            <div>
              <dt>Actividad</dt>
              <dd>{activityCount}</dd>
            </div>
            <div>
              <dt>Equipo activo</dt>
              <dd>{snapshot ? formatUptime(snapshot.system.uptimeSeconds) : "—"}</dd>
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

      <section className="service-field" aria-labelledby="services-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Mapa de conexiones</p>
            <h2 id="services-title">Herramientas observadas</h2>
          </div>
          <p>
            Actualización cada 4 segundos
            <br />
            <span>Última lectura {snapshot ? formatTime(snapshot.generatedAt) : "—"}</span>
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
                <span
                  className={`connection-light state-bg-${connection.state}`}
                />
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
            {snapshot?.events.slice(0, 8).map((event) => (
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
        <p>TRAMA / Local AI Orchestrator</p>
      </footer>
    </main>
  );
}
