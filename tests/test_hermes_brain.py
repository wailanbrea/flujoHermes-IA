from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from hermes_brain.cli import validate_config
from execution_gateway import ExecutionGateway
from hermes_brain.core import (
    build_brain_status,
    create_learning_record,
    persist_learning,
    promote_learning,
    sanitize_text,
    validate_learning,
)
from hermes_brain.router import route_task
from hermes_brain.service import HermesBrainService
from openclaw_gateway import (
    IngressRequest,
    OpenClawIngressAdapter,
    OpenClawWsRpcContext,
)


class BrainConfigTests(unittest.TestCase):
    def test_repository_profile_fleet_is_valid(self) -> None:
        result = validate_config(Path(__file__).resolve().parents[1])
        self.assertEqual(result["profiles"], 19)
        self.assertEqual(result["modes"], 10)
        self.assertEqual(result["skillSets"], 19)
        self.assertEqual(result["gateways"], 2)

    def test_personal_finance_profile_passes_policy_benchmark(self) -> None:
        repo = Path(__file__).resolve().parents[1]
        config = json.loads(
            (repo / "config" / "hermes-brain.json").read_text(encoding="utf-8")
        )
        profile = next(
            item
            for item in config["profiles"]
            if item["runtimeId"] == "personalfinanceexpert"
        )
        self.assertEqual(profile["mode"], "financial-advisor")
        self.assertEqual(profile["skillSet"], "personal-finance")

        route = next(
            item
            for item in config["modelRouter"]["routes"]
            if item["capability"] == "personal-finance"
        )
        self.assertEqual(route["profile"], "personalfinanceexpert")
        self.assertEqual(route["executor"], "local-advisory")
        self.assertNotIn("executionCapability", route)
        decision = route_task(
            config,
            capability="personal-finance",
            project_signals=[],
        )
        self.assertEqual(decision.profile, "personalfinanceexpert")
        self.assertEqual(decision.executor, "local-advisory")
        self.assertEqual(decision.risk_class.value, "low")
        self.assertEqual(decision.execution_capability.value, "sandbox-code")
        self.assertEqual(decision.approval_requirement, "none")
        self.assertLessEqual(len(decision.skills), 5)
        for toolset in ("terminal", "file", "code_execution"):
            self.assertNotIn(toolset, decision.toolsets)
        self.assertIn("web", decision.toolsets)

        benchmark = json.loads(
            (
                repo
                / "tests"
                / "fixtures"
                / "hermes-personal-finance-benchmark.json"
            ).read_text(encoding="utf-8")
        )
        mode = config["profileModes"][profile["mode"]]
        for toolset in benchmark["forbiddenToolsets"]:
            self.assertNotIn(toolset, mode["toolsets"])

        skill = (
            repo / "skills" / benchmark["skill"] / "SKILL.md"
        ).read_text(encoding="utf-8")
        for term in benchmark["requiredSkillTerms"]:
            self.assertIn(term.casefold(), skill.casefold())
        self.assertGreaterEqual(len(benchmark["scenarios"]), 5)

    def test_orchestrator_rejects_implementation_tools(self) -> None:
        config = {
            "schemaVersion": 1,
            "principles": [],
            "modelRouter": {
                "routes": [
                    {
                        "capability": "classification",
                        "profile": "lead",
                        "executor": "local-optional",
                        "fallback": "director",
                        "riskClass": "low",
                        "executionCapability": "sandbox-code",
                        "approvalRequirement": "none",
                    }
                ],
                "stackProfiles": {"default": "lead"},
                "localModel": "local/test-model",
                "manualOnlyModels": ["local/manual-model"],
            },
            "profileModes": {
                "orchestrator": {
                    "toolsets": ["kanban", "terminal"],
                    "maxTurns": 10,
                    "maxTokens": 100,
                }
            },
            "profiles": [
                {
                    "id": "lead",
                    "runtimeId": "lead",
                    "role": "route work",
                    "mode": "orchestrator",
                    "skillSet": "lead",
                }
            ],
            "skills": {"core": [], "project": [], "roleSets": {"lead": ["plan"]}},
            "bundles": {},
            "memory": {},
            "learning": {},
            "validators": [],
            "autonomy": {},
            "observability": {},
        }
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            (repo / "config").mkdir()
            (repo / "config" / "hermes-brain.json").write_text(
                json.dumps(config),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "implementation tools"):
                validate_config(repo)


class LearningEngineTests(unittest.TestCase):
    def test_rejects_secrets_and_absolute_paths(self) -> None:
        with self.assertRaises(ValueError):
            sanitize_text("password=do-not-store", "summary")
        with self.assertRaises(ValueError):
            create_learning_record(
                task_id="hermes-20260729-120000-abcdef12",
                domain="testing",
                problem_pattern="A reproducible parser failure.",
                root_cause="An invalid literal was emitted.",
                solution_summary="The literal was normalized.",
                passed_commands=["pwsh parser"],
                files=[r"C:\private\sample.ps1"],
            )
        with self.assertRaises(ValueError):
            sanitize_text("Failure at /home/alice/private/project", "summary")
        with self.assertRaises(ValueError):
            sanitize_text("Bearer abc.def.ghi", "summary")
        with self.assertRaises(ValueError):
            create_learning_record(
                task_id="hermes-20260729-120000-abcdef12",
                domain="testing",
                problem_pattern="A reproducible parser failure.",
                root_cause="An invalid literal was emitted.",
                solution_summary="The literal was normalized.",
                passed_commands=["PowerShell parser passed"],
                files=["scripts/sample.ps1"],
                metrics={"path": "/home/alice/private"},
            )

    def test_promotion_requires_benchmark_and_approval(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            record = create_learning_record(
                task_id="hermes-20260729-120000-abcdef12",
                domain="testing",
                problem_pattern="A reproducible parser failure.",
                root_cause="An invalid literal was emitted.",
                solution_summary="The literal was normalized and tested.",
                passed_commands=["PowerShell parser passed"],
                files=["scripts/windows/sample.ps1"],
                related_skill="sample-skill",
            )
            path = persist_learning(runtime, record)
            artifact_path = runtime / "benchmark.json"
            artifact = {
                "schemaVersion": 1,
                "benchmarkId": "sample-skill-regression-v1",
                "recordId": record.record_id,
                "taskId": record.task_id,
                "relatedSkill": "sample-skill",
                "passed": True,
                "validationPassed": True,
                "executedAt": "2026-07-30T12:00:00Z",
                "commands": ["python -m unittest tests.test_sample"],
            }
            artifact_path.write_text(json.dumps(artifact), encoding="utf-8")
            benchmark_sha256 = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError, "benchmark-validated"):
                promote_learning(
                    runtime,
                    record.record_id,
                    benchmark_sha256=benchmark_sha256,
                    approved_by="Codex",
                )
            validated = validate_learning(
                runtime,
                record.record_id,
                benchmark_artifact=artifact_path,
            )
            self.assertEqual(validated["state"], "validated")
            with self.assertRaisesRegex(ValueError, "digest does not match"):
                promote_learning(
                    runtime,
                    record.record_id,
                    benchmark_sha256="0" * 64,
                    approved_by="Codex",
                )
            promoted = promote_learning(
                runtime,
                record.record_id,
                benchmark_sha256=benchmark_sha256,
                approved_by="Codex",
            )
            self.assertEqual(promoted["state"], "promoted")
            persisted = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(persisted["approvedBy"], "Codex")
            self.assertEqual(persisted["approvedBenchmarkSha256"], benchmark_sha256)

    def test_validation_rejects_forged_or_mismatched_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            record = create_learning_record(
                task_id="hermes-20260729-120000-abcdef12",
                domain="testing",
                problem_pattern="A repeatable integration failure.",
                root_cause="The task evidence was not verified.",
                solution_summary="Bind benchmark evidence to task and record.",
                passed_commands=["PowerShell lifecycle passed"],
                files=["scripts/windows/sample.ps1"],
            )
            persist_learning(runtime, record)
            artifact_path = runtime / "benchmark.json"
            artifact_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "benchmarkId": "forged-benchmark",
                        "recordId": record.record_id,
                        "taskId": "hermes-20260729-120000-deadbeef",
                        "passed": True,
                        "validationPassed": True,
                        "executedAt": "2026-07-30T12:00:00Z",
                        "commands": ["fake command"],
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "validated task"):
                validate_learning(
                    runtime,
                    record.record_id,
                    benchmark_artifact=artifact_path,
                )


class PublicStatusTests(unittest.TestCase):
    def test_status_exposes_only_learning_metadata(self) -> None:
        source_repo = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            (repo / "config").mkdir()
            (repo / "config" / "hermes-brain.json").write_text(
                (source_repo / "config" / "hermes-brain.json").read_text(
                    encoding="utf-8"
                ),
                encoding="utf-8",
            )
            learning = repo / "telemetry" / "runtime" / "hermes-learning"
            learning.mkdir(parents=True)
            (learning / "lesson.json").write_text(
                json.dumps(
                    {
                        "record_id": "lesson-safe-001",
                        "recorded_at": "2026-07-31T12:00:00Z",
                        "domain": "testing",
                        "problem_pattern": "private lesson payload",
                        "root_cause": "complete root cause must remain private",
                        "solution_summary": "complete solution must remain private",
                        "metrics": {"private": "value"},
                        "related_skill": "sample-skill",
                        "state": "validated",
                        "benchmarkEvidence": {
                            "benchmarkId": "sample-benchmark-v1",
                            "validatedAt": "2026-07-31T12:01:00Z",
                        },
                    }
                ),
                encoding="utf-8",
            )
            status = build_brain_status(repo)
            public = status["brain"]["learning"]["last"]
            serialized = json.dumps(public)
            self.assertEqual(public["recordId"], "lesson-safe-001")
            for private in ("problem_pattern", "root_cause", "solution_summary", "metrics"):
                self.assertNotIn(private, serialized)


class BrainVerticalSliceTests(unittest.TestCase):
    def test_official_ingress_routes_programming_to_sandbox_policy(self) -> None:
        repo = Path(__file__).resolve().parents[1]
        brain_config = json.loads(
            (repo / "config" / "hermes-brain.json").read_text(encoding="utf-8")
        )
        ingress_config = json.loads(
            (repo / "config" / "openclaw-gateway.json").read_text(encoding="utf-8")
        )
        execution_config = json.loads(
            (repo / "config" / "execution-gateway.json").read_text(encoding="utf-8")
        )
        now = 1_785_520_000
        request = IngressRequest(
            request_id="request-brain-001",
            capability="programming",
            objective="Update the Python service in the authorized sandbox.",
            content=None,
            arguments={
                "projectSignals": ["python"],
                "sandboxPath": (
                    "C:/Users/waila/AppData/Local/local-ai-orchestrator/"
                    "hermes-worktrees/hermes-test"
                ),
            },
        )
        context = OpenClawWsRpcContext(
            endpoint="ws://127.0.0.1:18789",
            connection_id="connection-brain-001",
            session_id="session-brain-001",
            channel="local-chat",
            route="agent:hermes:main",
            authenticated=True,
            authentication_mode="token",
            first_frame="connect",
            hello={
                "type": "hello-ok",
                "snapshot": {"sessions": [], "routing": {}, "channels": []},
            },
        )
        with tempfile.TemporaryDirectory() as directory:
            brain = HermesBrainService(brain_config, Path(directory))
            with self.assertRaisesRegex(TypeError, "official OpenClaw"):
                brain.plan(request)  # type: ignore[arg-type]
            accepted, _ = OpenClawIngressAdapter(ingress_config).accept(
                context, request, now=now
            )
            plan, decision = brain.policy_check(
                accepted,
                ExecutionGateway(execution_config),
                now=now,
            )
            self.assertTrue(decision.allowed)
            self.assertEqual(plan.route.execution_capability.value, "sandbox-code")
            self.assertEqual(accepted.openclaw.session_id, "session-brain-001")
            self.assertEqual(accepted.openclaw.channel, "local-chat")
            public_plan = json.dumps(plan.as_dict()).casefold()
            self.assertNotIn("update the python service", public_plan)
            self.assertNotIn("session-brain-001", public_plan)

    def test_testing_routes_to_playwright(self) -> None:
        repo = Path(__file__).resolve().parents[1]
        config = json.loads(
            (repo / "config" / "hermes-brain.json").read_text(encoding="utf-8")
        )
        decision = route_task(config, capability="testing", project_signals=[])
        self.assertEqual(decision.execution_capability.value, "playwright-validation")

class ModelRouterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.repo = Path(__file__).resolve().parents[1]
        cls.config = json.loads(
            (cls.repo / "config" / "hermes-brain.json").read_text(encoding="utf-8")
        )

    def test_routes_programming_by_stack(self) -> None:
        android = route_task(
            self.config,
            capability="programming",
            project_signals=[
                r"C:\Users\waila\AndroidStudioProjects\BsPrestagil",
                "settings.gradle.kts",
                "MainActivity.kt",
            ],
        )
        self.assertEqual(android.profile, "android")
        self.assertEqual(android.model, "google/gemma-4-12b-qat")
        self.assertFalse(android.manual_model)

        laravel = route_task(
            self.config,
            capability="programming",
            project_signals=["artisan", "composer.json"],
        )
        self.assertEqual(laravel.profile, "laravel")

    def test_qwen_is_never_selected_without_manual_authorization(self) -> None:
        qwen = self.config["modelRouter"]["manualOnlyModels"][0]
        automatic = route_task(
            self.config,
            capability="programming",
            project_signals=["typescript", "react"],
        )
        self.assertNotEqual(automatic.model, qwen)
        with self.assertRaisesRegex(ValueError, "explicit authorization"):
            route_task(
                self.config,
                capability="programming",
                project_signals=["typescript"],
                manual_model=qwen,
            )
        manual = route_task(
            self.config,
            capability="programming",
            project_signals=["typescript"],
            manual_model=qwen,
            manual_model_authorized=True,
        )
        self.assertEqual(manual.model, qwen)
        self.assertTrue(manual.manual_model)


if __name__ == "__main__":
    unittest.main()
