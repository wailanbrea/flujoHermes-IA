import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("builds the compact Hermes Brain dashboard", async () => {
  const [html, page, css, assets] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readdir(new URL("../dist/assets/", import.meta.url)),
  ]);
  assert.match(html, /<div id="root"><\/div>/);
  assert.ok(assets.some((name) => name.endsWith(".js")));
  for (const label of [
    "HERMES BRAIN",
    "Memoria y Graphify",
    "Model Router",
    "Agent Factory",
    "Plan de solución",
    "Ejecutor en sandbox",
    "Tests + revisión + evidencia",
    "Resultado validado",
    "Learning Engine",
    "Memoria · Skill · Benchmark",
  ]) assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(page, /viewBox="0 0 1000 780"/);
  assert.match(page, /EventSource/);
  assert.match(page, /snapshot\.brain/);
  assert.match(page, /node-inspector/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /max-width: 1500px/);
  assert.doesNotMatch(page, /diagram-spread|draggingId|onPointerMove|localStorage/);
  assert.doesNotMatch(page, /Ahorro vs|Tokens delegados|Hermes Lab|worker principal/i);
});

test("keeps telemetry loopback-only, cached, and read-only", async () => {
  const [server, dashboardServer, page, packageJson] = await Promise.all([
    readFile(new URL("../server/telemetry-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/dashboard-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(server, /const HOST = "127\.0\.0\.1"/);
  assert.match(server, /request\.method !== "GET"/);
  assert.match(server, /Origen local no autorizado/);
  assert.doesNotMatch(server, /shell:\s*true/);
  assert.doesNotMatch(server, /message\.content|api[_-]?key/i);
  assert.match(server, /HERMES_BRAIN_STATUS_PATH/);
  assert.match(server, /brainStatusSchema/);
  assert.match(server, /readBrainStatus/);
  assert.match(server, /buildBrainWorkflow/);
  assert.match(server, /const INTERVAL_MS = 15000/);
  assert.match(server, /watch\(/);
  assert.match(server, /:heartbeat/);
  assert.match(dashboardServer, /const HOST = "127\.0\.0\.1"/);
  assert.match(dashboardServer, /request\.method !== "GET"/);
  assert.match(page, /EventSource/);
  assert.match(packageJson, /server\/dashboard-server\.ts/);
});

test("keeps automatic graph onboarding local, bounded, and structural", async () => {
  const script = await readFile(
    new URL("../../scripts/windows/ensure-project-graph.ps1", import.meta.url),
    "utf8",
  );
  assert.match(script, /Resolve-Path -LiteralPath/);
  assert.match(script, /global add/);
  assert.match(script, /total_files -gt 500/);
  assert.match(script, /total_words -gt 2000000/);
  assert.match(script, /semanticModelUsed = \$false/);
  assert.doesNotMatch(script, /OPENAI_API_KEY|GEMINI_API_KEY|--backend/);
});

test("uses a director sandbox and an idempotent evidence gate", async () => {
  const [sandbox, seal, review, learning, worker] = await Promise.all([
    readFile(new URL("../../scripts/windows/new-hermes-sandbox.ps1", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/windows/seal-hermes-task.ps1", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/windows/review-hermes-task.ps1", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/windows/record-hermes-learning.ps1", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/windows/invoke-hermes-task.ps1", import.meta.url), "utf8"),
  ]);
  assert.match(sandbox, /executor = 'director'/);
  assert.match(sandbox, /worktree add --quiet --detach/);
  assert.doesNotMatch(sandbox, /Start-HermesWorker|hermes\.exe|lms\.exe/);
  assert.match(seal, /--binary --full-index/);
  assert.match(seal, /patch-contains-cr/);
  assert.match(seal, /patchSha256/);
  assert.match(seal, /apply --check/);
  assert.match(seal, /State 'sealed'/);
  const approveBranch = review.match(
    /if \(\$Decision -eq 'Approve'\)([\s\S]*?)\nif \(\$status\.state/,
  );
  assert.ok(approveBranch);
  assert.doesNotMatch(approveBranch[1], /git\.exe -C .* apply /);
  assert.match(review, /Return-ToEditing/);
  assert.match(review, /applied-cleanup-pending/);
  assert.match(review, /integration\.json/);
  assert.match(review, /apply --reverse --check/);
  assert.match(learning, /state -ne 'completed'/);
  assert.match(worker, /refuses code generation and edit tasks/);
});

test("versions governance, Brain config, and the six core skills", async () => {
  const [policy, sync, brainConfig] = await Promise.all([
    readFile(new URL("../../config/agent-governance.md", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/windows/sync-agent-governance.ps1", import.meta.url), "utf8"),
    readFile(new URL("../../config/hermes-brain.json", import.meta.url), "utf8"),
  ]);
  assert.match(policy, /Codex, Claude, Antigravity y OpenCode/);
  assert.match(policy, /new-hermes-sandbox\.ps1/);
  assert.match(policy, /mismo sandbox a `editing`/);
  assert.match(sync, /\.claude\\CLAUDE\.md/);
  assert.match(sync, /\.gemini\\GEMINI\.md/);
  assert.match(sync, /\.config\\opencode\\AGENTS\.md/);
  assert.match(sync, /\.codex\\AGENTS\.md/);
  const parsed = JSON.parse(brainConfig);
  assert.equal(parsed.modelRouter.localModel, "google/gemma-4-12b-qat");
  assert.equal(parsed.autonomy.localAiCanWrite, true);
  assert.equal(parsed.autonomy.localAiProjectWrites, "isolated-worktree-only");
  assert.equal(parsed.profiles.length, 18);
  assert.equal(new Set(parsed.profiles.map((profile) => profile.runtimeId)).size, 18);
  assert.deepEqual(
    parsed.profileModes.orchestrator.toolsets.filter((toolset) =>
      ["browser", "code_execution", "file", "terminal", "vision", "web"].includes(toolset)
    ),
    [],
  );
  assert.equal(
    parsed.profiles.find((profile) => profile.runtimeId === "android")?.mode,
    "controlled-operator",
  );
  assert.equal(
    parsed.profiles.find((profile) => profile.runtimeId === "researchexpert")?.mode,
    "researcher",
  );
  assert.equal(
    parsed.modelRouter.routes.find((route) => route.capability === "programming")?.executor,
    "local-controlled",
  );
  for (const skill of [
    "hermes-brain",
    "hermes-agent-factory",
    "hermes-model-router",
    "hermes-learning-engine",
    "hermes-evidence-gate",
    "hermes-memory-retrieval",
    "bsolutions-mcp-integration",
    "bsolutions-typescript-web",
  ]) {
    const body = await readFile(new URL(`../../skills/${skill}/SKILL.md`, import.meta.url), "utf8");
    assert.match(body, new RegExp(`name: ${skill}`));
    assert.doesNotMatch(body, /TODO/);
  }
});
