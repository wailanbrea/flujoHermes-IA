from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

SCHEMA_VERSION = 1
LEARNING_STATES = {"candidate", "validated", "promoted", "deprecated"}
TASK_STATES = {
    "isolated",
    "editing",
    "sealed",
    "awaiting-review",
    "validating",
    "applied-cleanup-pending",
    "completed",
    "blocked",
    "failed",
}
SECRET_PATTERN = re.compile(
    r"(?i)(api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]"
)
ABSOLUTE_WINDOWS_PATH = re.compile(r"(?i)\b[a-z]:[\\/]")


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=f"{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def sanitize_text(value: str, field: str, maximum: int = 500) -> str:
    normalized = re.sub(r"[\x00-\x1f\x7f]+", " ", value or "")
    normalized = re.sub(r"\s{2,}", " ", normalized).strip()
    if len(normalized) < 3:
        raise ValueError(f"{field} must be concrete and nonblank")
    if SECRET_PATTERN.search(normalized):
        raise ValueError(f"{field} must not contain credentials")
    if ABSOLUTE_WINDOWS_PATH.search(normalized):
        raise ValueError(f"{field} must not contain absolute private paths")
    return normalized[:maximum].rstrip()


def relative_paths(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    for raw in values:
        candidate = raw.strip().replace("\\", "/")
        path = PurePosixPath(candidate)
        if (
            not candidate
            or path.is_absolute()
            or ".." in path.parts
            or "." in path.parts
            or candidate.startswith(".git/")
            or candidate == ".git"
            or ABSOLUTE_WINDOWS_PATH.search(candidate)
        ):
            raise ValueError("files must contain safe project-relative paths")
        result.append(candidate)
    return sorted(set(result))


@dataclass(frozen=True)
class LearningRecord:
    record_id: str
    recorded_at: str
    task_id: str
    domain: str
    problem_pattern: str
    root_cause: str
    solution_summary: str
    passed_commands: list[str]
    files: list[str]
    metrics: dict[str, float | int | str | bool]
    related_skill: str | None
    benchmark_result: str | None
    state: str


def create_learning_record(
    *,
    task_id: str,
    domain: str,
    problem_pattern: str,
    root_cause: str,
    solution_summary: str,
    passed_commands: Iterable[str],
    files: Iterable[str],
    metrics: dict[str, float | int | str | bool] | None = None,
    related_skill: str | None = None,
    benchmark_result: str | None = None,
    state: str = "candidate",
) -> LearningRecord:
    if state not in LEARNING_STATES:
        raise ValueError(f"invalid learning state: {state}")
    commands = [
        sanitize_text(command, "passed command", 240) for command in passed_commands
    ]
    if not commands:
        raise ValueError("at least one passed command is required")
    timestamp = utc_now()
    digest = hashlib.sha256(
        f"{task_id}|{timestamp}|{problem_pattern}".encode("utf-8")
    ).hexdigest()[:12]
    return LearningRecord(
        record_id=f"lesson-{digest}",
        recorded_at=timestamp,
        task_id=sanitize_text(task_id, "task id", 80),
        domain=sanitize_text(domain, "domain", 80),
        problem_pattern=sanitize_text(problem_pattern, "problem pattern"),
        root_cause=sanitize_text(root_cause, "root cause"),
        solution_summary=sanitize_text(solution_summary, "solution summary"),
        passed_commands=commands,
        files=relative_paths(files),
        metrics=metrics or {},
        related_skill=(
            sanitize_text(related_skill, "related skill", 80)
            if related_skill
            else None
        ),
        benchmark_result=(
            sanitize_text(benchmark_result, "benchmark result", 200)
            if benchmark_result
            else None
        ),
        state=state,
    )


def persist_learning(runtime_root: Path, record: LearningRecord) -> Path:
    destination = runtime_root / "hermes-learning" / f"{record.record_id}.json"
    atomic_json(
        destination,
        {"schemaVersion": SCHEMA_VERSION, **asdict(record)},
    )
    return destination


def promote_learning(
    runtime_root: Path,
    record_id: str,
    *,
    benchmark_passed: bool,
    approved_by: str,
) -> dict[str, Any]:
    path = runtime_root / "hermes-learning" / f"{record_id}.json"
    record = read_json(path)
    if not record:
        raise ValueError("learning record was not found")
    if not benchmark_passed:
        raise ValueError("a learning record cannot be promoted without a passing benchmark")
    record["state"] = "promoted"
    record["approvedBy"] = sanitize_text(approved_by, "approved by", 80)
    record["promotedAt"] = utc_now()
    atomic_json(path, record)
    return record


def build_brain_status(repo_root: Path) -> dict[str, Any]:
    config = read_json(repo_root / "config" / "hermes-brain.json")
    if not config:
        raise ValueError("config/hermes-brain.json is missing or invalid")
    runtime = repo_root / "telemetry" / "runtime"
    inventory = read_json(runtime / "hermes-brain-inventory.json", {})
    task_root = runtime / "hermes-jobs"
    statuses: list[dict[str, Any]] = []
    if task_root.exists():
        for status_path in task_root.glob("*/status.json"):
            status = read_json(status_path)
            if isinstance(status, dict) and status.get("state") in TASK_STATES:
                statuses.append(status)
    statuses.sort(key=lambda item: str(item.get("updatedAt", "")), reverse=True)
    learning_root = runtime / "hermes-learning"
    lessons = [
        item
        for path in learning_root.glob("*.json")
        if isinstance((item := read_json(path)), dict)
    ] if learning_root.exists() else []
    lessons.sort(key=lambda item: str(item.get("recorded_at", "")))
    graph = read_json(repo_root / "graphify-out" / "graph.json", {})
    graph_nodes = graph.get("nodes", []) if isinstance(graph, dict) else []
    graph_edges = (
        graph.get("links", graph.get("edges", [])) if isinstance(graph, dict) else []
    )
    task_counts = {
        state: sum(1 for status in statuses if status.get("state") == state)
        for state in sorted(TASK_STATES)
    }
    lesson_counts = {
        state: sum(1 for lesson in lessons if lesson.get("state") == state)
        for state in sorted(LEARNING_STATES)
    }
    operator_count = int(
        inventory.get(
            "operatorCount",
            sum(
                1
                for profile in config["profiles"]
                if profile.get("mode") == "controlled-operator"
            ),
        )
    )
    advisory_count = int(
        inventory.get(
            "advisoryCount",
            sum(
                1
                for profile in config["profiles"]
                if profile.get("mode") == "read-only"
            ),
        )
    )

    def public_task(status: dict[str, Any]) -> dict[str, Any]:
        return {
            "taskId": str(status.get("taskId", "")),
            "projectName": str(status.get("projectName", "unknown")),
            "requestedBy": str(status.get("requestedBy", "Codex")),
            "state": str(status.get("state", "unknown")),
            "updatedAt": str(status.get("updatedAt", "")),
            "filesChanged": int(status.get("filesChanged", 0) or 0),
            "patchBytes": int(status.get("patchBytes", 0) or 0),
        }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": utc_now(),
        "brain": {
            "state": "healthy",
            "version": config.get("schemaVersion", 1),
            "memory": {
                "state": "healthy" if graph_nodes else "degraded",
                "graphNodes": len(graph_nodes),
                "graphEdges": len(graph_edges),
                "policy": config["memory"]["policy"],
            },
            "router": {
                "state": "healthy",
                "routes": config["modelRouter"]["routes"],
                "localOptional": True,
            },
            "agents": {
                "state": inventory.get("profilesState", "unknown"),
                "profiles": inventory.get(
                    "profiles",
                    [profile["id"] for profile in config["profiles"]],
                ),
                "operatorCount": operator_count,
                "advisoryCount": advisory_count,
                "advisoryOnly": operator_count == 0,
            },
            "skills": {
                "state": inventory.get("skillsState", "unknown"),
                "configured": config["skills"]["core"],
                "installed": inventory.get("skills", []),
            },
            "learning": {
                "state": "healthy",
                "counts": lesson_counts,
                "last": lessons[-1] if lessons else None,
            },
            "sandbox": {
                "state": "healthy",
                "counts": task_counts,
                "active": [
                    public_task(status)
                    for status in statuses
                    if status.get("state") not in {"completed", "blocked", "failed"}
                ][:8],
            },
            "lastValidatedOutcome": next(
                (
                    public_task(status)
                    for status in statuses
                    if status.get("state") == "completed"
                ),
                None,
            ),
            "curator": inventory.get("curator", {"state": "unknown"}),
            "kanban": inventory.get("kanban", {"state": "unknown"}),
            "moa": inventory.get("moa", {"state": "unknown"}),
        },
    }
