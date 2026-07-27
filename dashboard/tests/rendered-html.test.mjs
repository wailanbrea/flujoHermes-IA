import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("builds the finished local observability dashboard", async () => {
  const [html, page, assets] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readdir(new URL("../dist/assets/", import.meta.url)),
  ]);
  assert.match(html, /<title>TRAMA · Observador local de IA<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/);
  assert.ok(assets.some((name) => name.endsWith(".js")));
  assert.match(page, /Flujo de trabajo real/);
  assert.match(page, /Estado de delegación local/);
  assert.match(page, /Revisión Codex/);
  assert.match(page, /El mapa que ya construiste está conectado/);
  assert.match(page, /snapshot\.workflow\.nodes/);
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
  assert.match(server, /PROJECT_CATALOG_PATH/);
  assert.match(server, /projectCatalogSchema/);
  assert.match(server, /probeHermesBroker/);
  assert.match(server, /HERMES_JOBS_PATH/);
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
  const [submit, worker, review] = await Promise.all([
    readFile(
      new URL("../../scripts/windows/submit-hermes-task.ps1", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../scripts/windows/invoke-hermes-task.ps1", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../scripts/windows/review-hermes-task.ps1", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(submit, /ModificationAuthorized/);
  assert.match(submit, /GitScope -ne 'own'/);
  assert.match(worker, /graphify\.exe query/);
  assert.match(worker, /worktree add --detach/);
  assert.match(worker, /--checkpoints/);
  assert.match(worker, /--max-turns/);
  assert.match(worker, /diff --binary --no-ext-diff HEAD/);
  assert.doesNotMatch(worker, /--yolo|--oneshot|\s-z\s/);
  assert.match(review, /apply --check/);
  assert.match(review, /ensure-project-graph\.ps1/);
});
