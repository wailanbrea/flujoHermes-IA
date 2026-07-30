from __future__ import annotations

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
)


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
            "modelRouter": {},
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
            )
            path = persist_learning(runtime, record)
            with self.assertRaises(ValueError):
                promote_learning(
                    runtime,
                    record.record_id,
                    benchmark_passed=False,
                    approved_by="Codex",
                )
            promoted = promote_learning(
                runtime,
                record.record_id,
                benchmark_passed=True,
                approved_by="Codex",
            )
            self.assertEqual(promoted["state"], "promoted")
            persisted = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(persisted["approvedBy"], "Codex")


if __name__ == "__main__":
    unittest.main()
