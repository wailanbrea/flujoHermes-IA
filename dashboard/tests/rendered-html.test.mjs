import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("builds the finished local observability dashboard", async () => {
  const [html, page, css, assets] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readdir(new URL("../dist/assets/", import.meta.url)),
  ]);
  assert.match(html, /<title>TRAMA · Observador local de IA<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/);
  assert.ok(assets.some((name) => name.endsWith(".js")));
  assert.match(page, /Flujo de trabajo real/);
  assert.match(css, /@media \(min-width: 1600px\)/);
  assert.match(css, /margin-left: 32px/);
  assert.match(css, /padding-left: 64px/);
  assert.match(page, /Estado de delegación local/);
  assert.match(page, /Revisión del director/);
  assert.match(page, /requestedBy/);
  assert.match(page, /graph\.claudeIntegrated/);
  assert.match(page, /graph\.antigravityIntegrated/);
  assert.match(page, /graph\.openCodeIntegrated/);
  assert.match(page, /El mapa que ya construiste está conectado/);
  assert.match(page, /snapshot\.workflow\.nodes/);
  assert.match(page, /aria-pressed=\{selected\}/);
  assert.match(page, /workflow-inspector/);
  assert.match(page, /selectedEdges/);
  assert.match(page, /TaskJourney/);
  assert.match(page, /HermesLab/);
  assert.match(page, /Hermes Lab · evidencia local saneada/);
  assert.match(page, /Ahorro vs\. GPT-5\.6 Sol/);
  assert.match(page, /Uso por modelo/);
  assert.match(page, /Plataformas y skills/);
  assert.match(page, /Recorrido de la última tarea Hermes/);
  assert.match(page, /validation-failed/);
  assert.match(page, /Herramientas observadas/);
  assert.match(page, /no captura/);
});

test("keeps telemetry loopback-only and read-only", async () => {
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
  assert.match(server, /GLOBAL_GRAPH_PATH/);
  assert.match(server, /CLAUDE_GLOBAL_RULES/);
  assert.match(server, /ANTIGRAVITY_GLOBAL_RULES/);
  assert.match(server, /OPENCODE_GLOBAL_RULES/);
  assert.match(server, /LOCAL_AI_GOVERNANCE:START/);
  assert.match(server, /PROJECT_CATALOG_PATH/);
  assert.match(server, /projectCatalogSchema/);
  assert.match(server, /probeHermesBroker/);
  assert.match(server, /HERMES_JOBS_PATH/);
  assert.match(server, /HERMES_INSIGHTS_PATH/);
  assert.match(server, /HERMES_MODEL_REPORT_PATH/);
  assert.match(server, /hermesInsightsSchema/);
  assert.match(server, /buildWorkflow/);
  assert.match(server, /Graph JSON local/);
  assert.match(server, /Windows GPU counters/);
  assert.match(dashboardServer, /const HOST = "127\.0\.0\.1"/);
  assert.match(dashboardServer, /request\.method !== "GET"/);
  assert.match(dashboardServer, /startsWith\(`\$\{STATIC_ROOT\}\$\{sep\}`\)/);
  assert.match(page, /EventSource/);
  assert.match(page, /Git heredado/);
  assert.match(page, /Sin Git/);
  assert.match(packageJson, /server\/dashboard-server\.ts/);
});

test("keeps automatic graph onboarding local, bounded, and structural", async () => {
  const script = await readFile(
    new URL("../../scripts/windows/ensure-project-graph.ps1", import.meta.url),
    "utf8",
  );
  assert.match(script, /Resolve-Path -LiteralPath/);
  assert.match(script, /global add/);
  assert.match(script, /update \$Root --no-cluster/);
  assert.match(script, /total_files -gt 500/);
  assert.match(script, /total_words -gt 2000000/);
  assert.match(script, /Test-GraphRoot/);
  assert.match(script, /Get-PathFingerprint/);
  assert.match(script, /semanticModelUsed = \$false/);
  assert.doesNotMatch(script, /OPENAI_API_KEY|GEMINI_API_KEY|--backend/);
});

test("catalogs the authorized project roots without changing project source", async () => {
  const script = await readFile(
    new URL("../../scripts/windows/index-project-roots.ps1", import.meta.url),
    "utf8",
  );
  assert.match(script, /C:\\xampp\\php\\www/);
  assert.match(script, /C:\\Users\\waila\\StudioProjects/);
  assert.match(script, /C:\\Users\\waila\\AndroidStudioProjects/);
  assert.match(script, /InventoryOnly/);
  assert.match(script, /AllowLargeCorpus = \$true/);
  assert.match(script, /ExactRoot = \$true/);
  assert.match(script, /AllowMetadataOnly = \$true/);
  assert.match(script, /project-catalog\.json/);
  assert.match(script, /gitScope/);
  assert.doesNotMatch(script, /OPENAI_API_KEY|GEMINI_API_KEY|--backend/);
});

test("delegates Hermes work through a bounded review gate", async () => {
  const [submit, worker, common, review, benchmark, exporter, operatingPrompt] = await Promise.all([
    readFile(
      new URL("../../scripts/windows/submit-hermes-task.ps1", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../scripts/windows/invoke-hermes-task.ps1", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../scripts/windows/hermes-task-common.ps1", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../scripts/windows/review-hermes-task.ps1", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../scripts/benchmarks/test-hermes-local.ps1", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../scripts/windows/export-hermes-insights.ps1", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../config/hermes-operating-prompt.md", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(submit, /ModificationAuthorized/);
  assert.match(submit, /RequestedBy/);
  assert.match(submit, /Codex.*Claude.*Antigravity.*OpenCode/s);
  assert.match(submit, /GitScope -ne 'own'/);
  assert.match(submit, /toolsets = @\('file', 'browser'\)/);
  assert.match(submit, /loopbackBrowser/);
  assert.match(worker, /graphify\.exe query/);
  assert.match(worker, /worktree add --detach/);
  assert.match(worker, /--source tool --no-restore-cwd/);
  assert.match(worker, /source repository changed/);
  assert.match(worker, /127\.0\.0\.1:4310/);
  assert.doesNotMatch(worker, /-t [^\n]*terminal/);
  assert.match(worker, /--checkpoints/);
  assert.match(worker, /--max-turns/);
  assert.match(worker, /diff --binary --no-ext-diff HEAD/);
  assert.match(worker, /Stop-ProcessTree/);
  assert.match(worker, /noProgressTimeoutSeconds/);
  assert.match(worker, /Get-TaskExchangeDirectory/);
  assert.match(worker, /--ignore-rules/);
  assert.match(worker, /-t file,browser/);
  assert.match(worker, /agentLogLength/);
  assert.match(worker, /HERMES_WRITE_SAFE_ROOT/);
  assert.match(worker, /export-hermes-insights\.ps1/);
  assert.match(worker, /hermes-operating-prompt\.md/);
  assert.match(worker, /Join-Path \(Get-OrchestratorRoot\)/);
  assert.match(exporter, /InsightsEngine/);
  assert.match(exporter, /SessionDB/);
  assert.match(exporter, /avoidedGpt56SolCostUsd/);
  assert.doesNotMatch(exporter, /session_id|message_content|tool_arguments/);
  assert.match(operatingPrompt, /Never repeat the same invalid call/);
  assert.doesNotMatch(worker, /-t terminal/);
  assert.doesNotMatch(worker, /\.Kill\(\$true\)/);
  assert.match(common, /taskkill\.exe/);
  assert.match(common, /LocalApplicationData/);
  assert.match(common, /Remove-Item -LiteralPath \$resolved -Recurse -Force/);
  assert.match(benchmark, /exact-response/);
  assert.match(benchmark, /tool-calling/);
  assert.match(benchmark, /scoped-edit/);
  assert.doesNotMatch(benchmark, /api[_-]?key|https:\/\//i);
  assert.doesNotMatch(worker, /--yolo|--oneshot|\s-z\s/);
  assert.match(review, /apply --check/);
  assert.match(review, /ReviewedBy/);
  assert.match(review, /ensure-project-graph\.ps1/);
});

test("shares governance with Claude Code, Antigravity, and OpenCode", async () => {
  const [policy, sync, claude, antigravityRule] = await Promise.all([
    readFile(
      new URL("../../config/agent-governance.md", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../scripts/windows/sync-agent-governance.ps1",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../../CLAUDE.md", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../.agents/rules/local-ai-governance.md",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(policy, /Codex, Claude Code, Google Antigravity y OpenCode/);
  assert.match(policy, /RequestedBy Codex/);
  assert.match(policy, /RequestedBy Claude/);
  assert.match(policy, /RequestedBy Antigravity/);
  assert.match(policy, /RequestedBy OpenCode/);
  assert.match(policy, /Graphify/);
  assert.match(policy, /Hermes/);
  assert.match(sync, /\.claude\\CLAUDE\.md/);
  assert.match(sync, /\.gemini\\GEMINI\.md/);
  assert.match(sync, /\.config\\opencode\\AGENTS\.md/);
  assert.match(sync, /LOCAL_AI_GOVERNANCE:START/);
  assert.match(claude, /graphify query/);
  assert.match(antigravityRule, /RequestedBy Antigravity/);
});
