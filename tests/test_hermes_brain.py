from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from hermes_brain.cli import validate_config
from hermes_brain.core import (
    create_learning_record,
    persist_learning,
    promote_learning,
    sanitize_text,
    validate_learning,
)
from hermes_brain.router import route_task


class BrainConfigTests(unittest.TestCase):
    def test_repository_profile_fleet_is_valid(self) -> None:
        result = validate_config(Path(__file__).resolve().parents[1])
        self.assertEqual(result["profiles"], 18)
        self.assertEqual(result["modes"], 9)
        self.assertEqual(result["skillSets"], 18)

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
