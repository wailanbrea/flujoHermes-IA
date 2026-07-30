from __future__ import annotations

import argparse
import json
from pathlib import Path

from .core import (
    atomic_json,
    build_brain_status,
    create_learning_record,
    persist_learning,
    promote_learning,
    read_json,
)


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="hermes-brain")
    commands = root.add_subparsers(dest="command", required=True)

    validate = commands.add_parser("validate-config")
    validate.add_argument("--repo", required=True, type=Path)

    snapshot = commands.add_parser("build-status")
    snapshot.add_argument("--repo", required=True, type=Path)
    snapshot.add_argument("--output", required=True, type=Path)

    record = commands.add_parser("record-learning")
    record.add_argument("--repo", required=True, type=Path)
    record.add_argument("--task-id", required=True)
    record.add_argument("--domain", required=True)
    record.add_argument("--problem-pattern", required=True)
    record.add_argument("--root-cause", required=True)
    record.add_argument("--solution-summary", required=True)
    record.add_argument("--passed-command", action="append", required=True)
    record.add_argument("--file", action="append", default=[])
    record.add_argument("--related-skill")
    record.add_argument("--benchmark-result")

    promote = commands.add_parser("promote-learning")
    promote.add_argument("--repo", required=True, type=Path)
    promote.add_argument("--record-id", required=True)
    promote.add_argument("--benchmark-passed", action="store_true")
    promote.add_argument("--approved-by", required=True)
    return root


def validate_config(repo: Path) -> dict[str, object]:
    config = read_json(repo / "config" / "hermes-brain.json")
    required = {
        "schemaVersion",
        "principles",
        "modelRouter",
        "profileModes",
        "profiles",
        "skills",
        "memory",
        "learning",
        "validators",
        "autonomy",
        "observability",
    }
    if not isinstance(config, dict) or not required.issubset(config):
        missing = sorted(required.difference(config or {}))
        raise ValueError(f"invalid Hermes Brain config; missing: {', '.join(missing)}")
    profile_modes = config["profileModes"]
    profiles = config["profiles"]
    role_sets = config["skills"].get("roleSets", {})
    if not isinstance(profile_modes, dict) or not profile_modes:
        raise ValueError("invalid Hermes Brain config; profileModes must be non-empty")
    if not isinstance(role_sets, dict) or not role_sets:
        raise ValueError("invalid Hermes Brain config; skills.roleSets must be non-empty")
    if not isinstance(profiles, list) or not profiles:
        raise ValueError("invalid Hermes Brain config; profiles must be non-empty")

    profile_ids: set[str] = set()
    runtime_ids: set[str] = set()
    for profile in profiles:
        if not isinstance(profile, dict):
            raise ValueError("invalid Hermes Brain config; each profile must be an object")
        values = {
            key: profile.get(key)
            for key in ("id", "runtimeId", "role", "mode", "skillSet")
        }
        if any(not isinstance(value, str) or not value for value in values.values()):
            raise ValueError(
                "invalid Hermes Brain config; profiles require id, runtimeId, "
                "role, mode and skillSet"
            )
        if values["id"] in profile_ids or values["runtimeId"] in runtime_ids:
            raise ValueError("invalid Hermes Brain config; profile IDs must be unique")
        profile_ids.add(values["id"])
        runtime_ids.add(values["runtimeId"])
        if values["mode"] not in profile_modes:
            raise ValueError(
                f"invalid Hermes Brain config; unknown mode: {values['mode']}"
            )
        if values["skillSet"] not in role_sets:
            raise ValueError(
                f"invalid Hermes Brain config; unknown skillSet: {values['skillSet']}"
            )

    for mode_name, mode in profile_modes.items():
        if not isinstance(mode, dict):
            raise ValueError(f"invalid Hermes Brain mode: {mode_name}")
        toolsets = mode.get("toolsets")
        if (
            not isinstance(toolsets, list)
            or not toolsets
            or any(not isinstance(item, str) or not item for item in toolsets)
            or len(toolsets) != len(set(toolsets))
        ):
            raise ValueError(f"invalid toolsets for Hermes Brain mode: {mode_name}")
        if int(mode.get("maxTurns", 0)) <= 0 or int(mode.get("maxTokens", 0)) <= 0:
            raise ValueError(f"invalid runtime budget for Hermes Brain mode: {mode_name}")
    forbidden_orchestrator_tools = {
        "browser",
        "code_execution",
        "file",
        "terminal",
        "vision",
        "web",
    }
    orchestrator_tools = set(profile_modes.get("orchestrator", {}).get("toolsets", []))
    if orchestrator_tools.intersection(forbidden_orchestrator_tools):
        raise ValueError("invalid orchestrator mode; implementation tools are forbidden")

    for set_name, skill_names in role_sets.items():
        if (
            not isinstance(skill_names, list)
            or not skill_names
            or any(not isinstance(item, str) or not item for item in skill_names)
            or len(skill_names) != len(set(skill_names))
        ):
            raise ValueError(f"invalid Hermes skill set: {set_name}")

    versioned_skills = set(config["skills"].get("core", []))
    versioned_skills.update(config["skills"].get("project", []))
    missing_skills = sorted(
        skill
        for skill in versioned_skills
        if skill != "graphify" and not (repo / "skills" / skill / "SKILL.md").is_file()
    )
    if missing_skills:
        raise ValueError(
            "invalid Hermes Brain config; missing versioned skills: "
            + ", ".join(missing_skills)
        )
    return {
        "valid": True,
        "schemaVersion": config["schemaVersion"],
        "profiles": len(profiles),
        "modes": len(profile_modes),
        "skillSets": len(role_sets),
    }


def main() -> int:
    args = parser().parse_args()
    if args.command == "validate-config":
        result = validate_config(args.repo.resolve())
    elif args.command == "build-status":
        result = build_brain_status(args.repo.resolve())
        atomic_json(args.output.resolve(), result)
    elif args.command == "record-learning":
        runtime = args.repo.resolve() / "telemetry" / "runtime"
        record = create_learning_record(
            task_id=args.task_id,
            domain=args.domain,
            problem_pattern=args.problem_pattern,
            root_cause=args.root_cause,
            solution_summary=args.solution_summary,
            passed_commands=args.passed_command,
            files=args.file,
            related_skill=args.related_skill,
            benchmark_result=args.benchmark_result,
        )
        destination = persist_learning(runtime, record)
        result = {"recordId": record.record_id, "state": record.state, "path": str(destination)}
    else:
        runtime = args.repo.resolve() / "telemetry" / "runtime"
        result = promote_learning(
            runtime,
            args.record_id,
            benchmark_passed=args.benchmark_passed,
            approved_by=args.approved_by,
        )
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
