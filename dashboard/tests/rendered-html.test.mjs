import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("builds the compact Hermes Brain dashboard", async () => {
  const [html, page, css, server, assets] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../server/telemetry-server.ts", import.meta.url), "utf8"),
    readdir(new URL("../dist/assets/", import.meta.url)),
  ]);
  assert.match(html, /<div id="root"><\/div>/);
  assert.ok(assets.some((name) => name.endsWith(".js")));
  for (const label of [
    "Usuario",
    "HERMES BRAIN",
    "Memoria y Graphify",
    "Model Router",
    "Agent Factory",
    "Plan y políticas",
    "Execution Gateway",
    "Sandbox de código",
    "Playwright",
    "Automatizaciones",
    "Tests · Evidencia · Aprobación",
    "Resultado validado",
    "Learning Engine",
    "Memoria · Skill · Benchmark",
    "TRAMA",
  ]) assert.match(server, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const workflowBuilder = server.match(
    /function buildBrainWorkflow[\s\S]*?function buildWorkflowExecution/,
  );
  assert.ok(workflowBuilder);
  assert.doesNotMatch(
    workflowBuilder[0],
    /lm-studio|submit-hermes-task|directors|project-catalog/i,
  );
  assert.doesNotMatch(server, /function buildWorkflow\(/);
  assert.match(server, /link\("brain", "trama", "Telemetría read-only"/);
  assert.match(page, /viewBox="0 0 1000 840"/);
  assert.match(page, /EventSource/);
  assert.match(page, /workflow=\{snapshot\.workflow\}/);
  assert.match(page, /workflow\.nodes\.map/);
  assert.match(page, /workflow\.edges\.map/);
  assert.match(page, /function edgePath/);
  assert.match(page, /edge\.evidence === "observed"/);
  assert.match(page, /executionMode === "live" \|\| executionMode === "waiting"/);
  assert.match(page, /node-inspector/);
  assert.match(page, /snapshot\.execution/);
  assert.match(page, /En vivo/);
  assert.match(page, /role="progressbar"/);
  assert.match(page, /aria-current/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /height: 840px; width: 1000px/);
  assert.match(css, /max-width: 1500px/);
  assert.match(css, /@keyframes workflow-flow/);
  assert.match(css, /brain-links path\.telemetry-active \{[^}]*animation:/);
  assert.doesNotMatch(css, /\.brain-links path \{[^}]*animation:/);
  assert.doesNotMatch(
    page,
    /const nodes:|const paths|executionStages|pathStageIndexes|animationDelay|Flujo continuo|diagram-spread|draggingId|onPointerMove|setInterval|localStorage|matchMedia|animateMotion|Activar animación/,
  );
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
  assert.match(server, /buildWorkflowExecution/);
  assert.match(server, /focusTask/);
  assert.match(server, /WORKFLOW_STAGES/);
  assert.match(server, /promptBudgetSchema/);
  assert.match(server, /readPromptBudget/);
  assert.match(server, /probeRtk/);
  assert.match(server, /probeTelegram/);
  assert.match(
    server,
    /link\("execution-gateway", "playwright".{0,160}"configured"\)/,
  );
  assert.match(
    server,
    /link\("execution-gateway", "automations".{0,160}"configured"\)/,
  );
  assert.match(server, /metrics\.sharedGiB > 2/);
  assert.match(server, /totalTasks: directories\.length/);
  assert.doesNotMatch(
    server,
    /failedCount:\s*[\s\S]{0,160}invalidTaskCount/,
  );
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

test("uses a managed sandbox and an idempotent evidence gate", async () => {
  const [sandbox, seal, review, learning, worker] = await Promise.all([
    readFile(new URL("../../scripts/windows/new-hermes-sandbox.ps1", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/windows/seal-hermes-task.ps1", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/windows/review-hermes-task.ps1", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/windows/record-hermes-learning.ps1", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/windows/invoke-hermes-task.ps1", import.meta.url), "utf8"),
  ]);
  assert.match(sandbox, /executor = 'managed-sandbox'/);
  assert.match(sandbox, /Get-GraphPreflightEvidence/);
  assert.match(sandbox, /Get-HermesRouteDecision/);
  assert.match(sandbox, /localAi = 'controlled-write'/);
  assert.match(sandbox, /worktree add --quiet --detach/);
  assert.doesNotMatch(sandbox, /Start-HermesWorker|hermes\.exe|lms\.exe/);
  assert.match(seal, /--binary --full-index/);
  assert.match(seal, /StandardOutputEncoding = \$utf8/);
  assert.match(seal, /StandardErrorEncoding = \$utf8/);
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

test("versions governance, Brain config, and the managed skills", async () => {
  const [policy, sync, brainSync, promptBudget, brainConfig] = await Promise.all([
    readFile(new URL("../../config/agent-governance.md", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/windows/sync-agent-governance.ps1", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/windows/sync-hermes-brain.ps1", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/windows/measure-hermes-prompt-budget.ps1", import.meta.url), "utf8"),
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
  assert.equal(parsed.modelRouter.hermesExternalInference, "disabled");
  assert.match(brainSync, /moa:`n  enabled: false/);
  assert.match(brainSync, /'financial-advisor'/);
  assert.match(brainSync, /No puedo confirmar/);
  assert.match(brainSync, /señales fuertes de posible fraude/);
  assert.match(brainSync, /never use "estafa confirmada", "fraude/);
  assert.match(brainSync, /Never execute or facilitate purchases, sales, transfers/);
  assert.equal(parsed.autonomy.localAiCanWrite, true);
  assert.equal(parsed.autonomy.localAiProjectWrites, "isolated-worktree-only");
  assert.equal(parsed.profiles.length, 19);
  assert.equal(Object.keys(parsed.profileModes).length, 10);
  assert.equal(new Set(parsed.profiles.map((profile) => profile.runtimeId)).size, 19);
  assert.deepEqual(
    parsed.profileModes.orchestrator.toolsets.filter((toolset) =>
      ["browser", "code_execution", "file", "terminal", "vision", "web"].includes(toolset)
    ),
    [],
  );
  assert.equal(
    parsed.profiles.find((profile) => profile.runtimeId === "android")?.mode,
    "android-operator",
  );
  assert.equal(
    parsed.profiles.find((profile) => profile.runtimeId === "laravel")?.mode,
    "backend-operator",
  );
  assert.equal(
    parsed.profiles.find((profile) => profile.runtimeId === "mcp")?.mode,
    "backend-operator",
  );
  assert.deepEqual(parsed.terminalCompression, {
    provider: "rtk",
    integration: "official-hermes-plugin",
    rollout: "controlled-auto",
    enabledProfiles: ["hermesbrain", "android", "laravel", "frontend", "mcp"],
    disabledByDefault: true,
    failOpen: true,
  });
  assert.equal(
    parsed.profiles.find((profile) => profile.runtimeId === "researchexpert")?.mode,
    "researcher",
  );
  assert.ok(parsed.skills.roleSets.android.includes("adb-emulator-debugging"));
  assert.ok(parsed.skills.roleSets.laravel.includes("backend-dev-laravel"));
  assert.equal(parsed.skills.roleSets.mcp.includes("mcp-appcontrol"), false);
  assert.ok(parsed.skills.roleSets.mcp.includes("fastmcp"));
  assert.ok(parsed.skills.roleSets.orchestrator.includes("one-three-one-rule"));
  assert.ok(
    parsed.skills.roleSets["browser-validation"].includes(
      "bsolutions-adversarial-ux-review",
    ),
  );
  for (const mode of ["android-operator", "backend-operator"]) {
    for (const toolset of ["browser", "delegation", "image_gen", "session_search", "web"]) {
      assert.equal(parsed.profileModes[mode].toolsets.includes(toolset), false);
    }
  }
  assert.equal(parsed.profileModes["backend-operator"].toolsets.includes("vision"), false);
  assert.equal(parsed.skills.selectionPolicy.metadataFirst, true);
  assert.equal(parsed.skills.selectionPolicy.maxBodiesPerTask, 5);
  assert.equal(parsed.skills.selectionPolicy.projectSpecificRequiresCatalogMatch, true);
  assert.equal(parsed.skills.selectionPolicy.externalRegistries, "denied");
  assert.deepEqual(
    Object.keys(parsed.bundles).sort(),
    ["android-feature", "laravel-change", "research-verified", "skill-candidate"],
  );
  assert.match(brainSync, /Sync-ProfileBundles/);
  assert.match(brainSync, /skills\.write_approval true/);
  assert.ok(parsed.skills.roleSets["architecture-review"].includes("architecture-diagram"));
  assert.ok(
    parsed.skills.roleSets["browser-validation"].includes(
      "authenticated-browser-operations",
    ),
  );
  for (const roleSkills of Object.values(parsed.skills.roleSets)) {
    assert.equal(roleSkills.includes("audiocraft"), false);
    assert.equal(roleSkills.includes("heartmula"), false);
  }
  assert.equal(
    parsed.modelRouter.routes.find((route) => route.capability === "programming")?.executor,
    "local-controlled",
  );
  assert.match(promptBudget, /prompt-size --json/);
  assert.match(promptBudget, /bytes-divided-by-four/);
  assert.doesNotMatch(promptBudget, /skills_breakdown|toolsets_breakdown/);
  assert.doesNotMatch(promptBudget, /File\]::Move\([^,\r\n]+,[^,\r\n]+,\s*\$true\)/);
  assert.match(promptBudget, /CreateNoWindow = \$true/);
  assert.match(promptBudget, /RedirectStandardOutput = \$true/);
  assert.match(promptBudget, /WaitForExit\(20000\)/);
  assert.match(brainSync, /measure-hermes-prompt-budget\.ps1/);
  assert.match(brainSync, /RTK_DISABLED=1/);
  assert.match(brainSync, /Set-TerminalCompressionPlugin/);
  assert.match(brainSync, /plugins\s+`\s*\r?\n\s*\$pluginAction 'rtk-rewrite'/);
  assert.match(brainSync, /__pycache__/);
  assert.match(brainSync, /optional-skills/);
  assert.match(brainSync, /modeConfig\.writeScope -eq 'managed-worktrees'/);
  const managedSkills = [
    ...parsed.skills.core.filter((skill) => skill !== "graphify"),
    ...parsed.skills.project,
  ];
  for (const skill of managedSkills) {
    const body = await readFile(new URL(`../../skills/${skill}/SKILL.md`, import.meta.url), "utf8");
    assert.match(body, new RegExp(`name: ${skill}`));
    assert.doesNotMatch(body, /TODO/);
  }

  const [brain, factory, mcp, quality, security, adversarialUx] = await Promise.all([
    readFile(new URL("../../skills/hermes-brain/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../../skills/hermes-agent-factory/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../../skills/bsolutions-mcp-integration/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../../skills/bsolutions-quality-gate/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../../skills/bsolutions-security-review/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../../skills/bsolutions-adversarial-ux-review/SKILL.md", import.meta.url), "utf8"),
  ]);
  assert.match(brain, /como máximo cinco skills/);
  assert.match(factory, /catálogo confirme esa\s+raíz activa/);
  assert.match(mcp, /Descubrimiento de tres niveles/);
  assert.match(mcp, /FastMCP condicional/);
  assert.match(quality, /SAFE[\s\S]*CAREFUL[\s\S]*RISKY/);
  assert.match(security, /blast radius/i);
  assert.match(adversarialUx, /read-only/);
  assert.match(adversarialUx, /No crear tickets/);
});
