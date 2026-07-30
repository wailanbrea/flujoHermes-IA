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
    validate_learning,
)
from .router import route_task


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

    validate_learning_command = commands.add_parser("validate-learning")
    validate_learning_command.add_argument("--repo", required=True, type=Path)
    validate_learning_command.add_argument("--record-id", required=True)
    validate_learning_command.add_argument(
        "--benchmark-artifact", required=True, type=Path
    )

    promote = commands.add_parser("promote-learning")
    promote.add_argument("--repo", required=True, type=Path)
    promote.add_argument("--record-id", required=True)
    promote.add_argument("--benchmark-sha256", required=True)
    promote.add_argument("--approved-by", required=True)

    route = commands.add_parser("route-task")
    route.add_argument("--repo", required=True, type=Path)
    route.add_argument("--capability", required=True)
    route.add_argument("--project-signal", action="append", default=[])
    route.add_argument("--manual-model")
    route.add_argument("--manual-model-authorized", action="store_true")
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
        "bundles",
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
    routes = config["modelRouter"].get("routes", [])
    if not isinstance(profile_modes, dict) or not profile_modes:
        raise ValueError("invalid Hermes Brain config; profileModes must be non-empty")
    if not isinstance(role_sets, dict) or not role_sets:
        raise ValueError("invalid Hermes Brain config; skills.roleSets must be non-empty")
    if not isinstance(profiles, list) or not profiles:
        raise ValueError("invalid Hermes Brain config; profiles must be non-empty")
    if (
        not isinstance(routes, list)
        or not routes
        or len({route.get("capability") for route in routes}) != len(routes)
    ):
        raise ValueError("invalid Hermes Brain config; model routes must be unique")

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
    bundles = config["bundles"]
    if not isinstance(bundles, dict) or not bundles:
        raise ValueError("invalid Hermes Brain config; bundles must be non-empty")
    allowed_bundle_profiles = runtime_ids.union({"default", "localai"})
    for bundle_name, bundle in bundles.items():
        if (
            not isinstance(bundle, dict)
            or not isinstance(bundle.get("profiles"), list)
            or not bundle["profiles"]
        ):
            raise ValueError(f"invalid Hermes bundle: {bundle_name}")
        if not (repo / "config" / "hermes-bundles" / f"{bundle_name}.yaml").is_file():
            raise ValueError(f"missing Hermes bundle definition: {bundle_name}")
        unknown_profiles = set(bundle["profiles"]).difference(allowed_bundle_profiles)
        if unknown_profiles:
            raise ValueError(
                f"invalid Hermes bundle profiles for {bundle_name}: "
                + ", ".join(sorted(unknown_profiles))
            )
    runtime_profiles = {str(profile["runtimeId"]) for profile in profiles}
    stack_profiles = config["modelRouter"].get("stackProfiles", {})
    routed_profiles = {
        str(route.get("profile"))
        for route in routes
        if route.get("profile") != "auto"
    }
    routed_profiles.update(str(profile) for profile in stack_profiles.values())
    unknown_routed_profiles = sorted(routed_profiles.difference(runtime_profiles))
    if unknown_routed_profiles:
        raise ValueError(
            "invalid Hermes Brain config; routes select unknown profiles: "
            + ", ".join(unknown_routed_profiles)
        )
    local_model = config["modelRouter"].get("localModel")
    if local_model in set(config["modelRouter"].get("manualOnlyModels", [])):
        raise ValueError("local default model cannot be manual-only")
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
    elif args.command == "validate-learning":
        runtime = args.repo.resolve() / "telemetry" / "runtime"
        result = validate_learning(
            runtime,
            args.record_id,
            benchmark_artifact=args.benchmark_artifact.resolve(),
        )
    elif args.command == "promote-learning":
        runtime = args.repo.resolve() / "telemetry" / "runtime"
        result = promote_learning(
            runtime,
            args.record_id,
            benchmark_sha256=args.benchmark_sha256,
            approved_by=args.approved_by,
        )
    else:
        config = read_json(args.repo.resolve() / "config" / "hermes-brain.json")
        result = route_task(
            config,
            capability=args.capability,
            project_signals=args.project_signal,
            manual_model=args.manual_model,
            manual_model_authorized=args.manual_model_authorized,
        ).as_dict()
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
