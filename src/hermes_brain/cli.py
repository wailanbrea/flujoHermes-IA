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
    return {"valid": True, "schemaVersion": config["schemaVersion"]}


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
