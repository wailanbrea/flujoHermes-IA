import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const dashboardRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(dashboardRoot, "..");
const taskId = `hermes-20990101-010101-${Math.random().toString(16).slice(2, 10).padEnd(8, "0")}`;
const taskDirectory = resolve(
  repositoryRoot,
  "telemetry",
  "runtime",
  "hermes-jobs",
  taskId,
);

async function waitForHealth(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // The isolated server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Telemetry server did not become healthy.");
}

test("publishes a sanitized Hermes status through the debounced watcher", async () => {
  const port = 4391;
  const errors = [];
  const server = spawn(
    process.execPath,
    [
      resolve(dashboardRoot, "node_modules", "tsx", "dist", "cli.mjs"),
      "server/telemetry-server.ts",
    ],
    {
      cwd: dashboardRoot,
      env: { ...process.env, TELEMETRY_PORT: String(port) },
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  server.stderr.setEncoding("utf8");
  server.stderr.on("data", (chunk) => errors.push(chunk));

  try {
    await waitForHealth(`http://127.0.0.1:${port}/health`);
    await fetch(`http://127.0.0.1:${port}/api/status`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    const eventsResponse = await fetch(`http://127.0.0.1:${port}/api/events`);
    assert.equal(eventsResponse.status, 200);
    const reader = eventsResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const startedAt = performance.now();

    await mkdir(taskDirectory, { recursive: true });
    await writeFile(
      resolve(taskDirectory, "status.json"),
      JSON.stringify({
        taskId,
        projectName: "synthetic",
        requestedBy: "Codex",
        mode: "execute",
        phase: "edit",
        state: "executing",
        updatedAt: new Date().toISOString(),
        feedback: "must never reach TRAMA",
      }),
      "utf8",
    );

    let observed = null;
    const deadline = Date.now() + 3_000;
    let pendingRead = reader.read();
    while (Date.now() < deadline && !observed) {
      const read = await Promise.race([
        pendingRead,
        new Promise((resolveTimeout) =>
          setTimeout(() => resolveTimeout({ timeout: true }), 500),
        ),
      ]);
      if (read.timeout) continue;
      pendingRead = reader.read();
      if (read.done) break;
      buffer += decoder.decode(read.value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const data = block
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!data) continue;
        const snapshot = JSON.parse(data.slice(6));
        if (snapshot.delegation.latestTask?.taskId === taskId) {
          observed = snapshot;
          break;
        }
      }
    }
    await reader.cancel();
    assert.ok(observed, "Watcher did not publish the synthetic task.");
    const watcherLatencyMs = performance.now() - startedAt;
    assert.ok(
      watcherLatencyMs < 1_000,
      "Watcher latency exceeded one second.",
    );
    console.log(`watcher-latency-ms=${watcherLatencyMs.toFixed(1)}`);
    assert.equal(observed.delegation.focusTask?.taskId, taskId);
    assert.equal(observed.execution.mode, "live");
    assert.equal(observed.execution.stageId, "sandbox");
    assert.equal(observed.execution.stageIndex, 5);
    assert.equal(observed.execution.taskId, taskId);
    assert.equal(observed.execution.taskState, "executing");
    assert.deepEqual(
      observed.workflow.nodes.map((node) => node.id),
      [
        "user",
        "telegram",
        "brain",
        "memory",
        "router",
        "agents",
        "plan",
        "execution-gateway",
        "code-sandbox",
        "playwright",
        "automations",
        "evidence",
        "validated",
        "learning",
        "promotion",
        "trama",
      ],
    );
    assert.ok(
      observed.workflow.nodes.every((node) =>
        [node.x, node.y, node.width, node.height].every(Number.isInteger)
      ),
    );
    assert.ok(
      observed.workflow.edges
        .filter((edge) => edge.target === "code-sandbox")
        .every((edge) => edge.evidence === "observed"),
    );
    assert.ok(
      observed.workflow.edges
        .filter((edge) =>
          ["playwright", "automations"].includes(edge.source) ||
          ["playwright", "automations"].includes(edge.target)
        )
        .every((edge) => edge.evidence === "configured"),
    );
    assert.deepEqual(
      observed.workflow.edges
        .filter((edge) => edge.target === "trama")
        .map((edge) => edge.source),
      ["brain"],
    );
    assert.equal(
      observed.workflow.edges.some((edge) => edge.source === "trama"),
      false,
    );
    assert.doesNotMatch(
      JSON.stringify(observed.workflow),
      /lm-studio|submit-hermes-task|directors|project-catalog/i,
    );
    assert.doesNotMatch(JSON.stringify(observed), /must never reach TRAMA|feedback/i);

    const statusResponse = await fetch(`http://127.0.0.1:${port}/api/status`);
    assert.equal(statusResponse.status, 200);
    const statusText = await statusResponse.text();
    const status = JSON.parse(statusText);
    assert.equal(status.promptBudget.estimation, "bytes-divided-by-four");
    assert.ok(Array.isArray(status.promptBudget.profiles));
    assert.ok(status.delegation.failedCount <= status.delegation.totalTasks);
    assert.equal(status.execution.taskId, taskId);
    assert.ok(
      status.services.some((service) => service.id === "rtk"),
      "RTK service telemetry is missing.",
    );
    const telegramService = status.services.find((service) => service.id === "telegram");
    assert.ok(telegramService, "Telegram service telemetry is missing.");
    const lmStudio = status.services.find((service) => service.id === "lm-studio");
    assert.ok(lmStudio);
    assert.doesNotMatch(
      statusText,
      /must never reach TRAMA|feedback|skills_breakdown|toolsets_breakdown/i,
    );
  } finally {
    await rm(taskDirectory, { recursive: true, force: true });
    server.kill("SIGTERM");
    await new Promise((resolveExit) => server.once("exit", resolveExit));
  }

  assert.doesNotMatch(errors.join(""), /watcher error|broker refresh error/i);
});
