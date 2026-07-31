from __future__ import annotations

import hashlib
import json
import math
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
    r"(?i)(?:(?:api[_ -]?key|authorization|password|secret|token)\s*[:=]|\bbearer\s+\S+)"
)
ABSOLUTE_WINDOWS_PATH = re.compile(r"(?i)\b[a-z]:[\\/]")
ABSOLUTE_UNIX_PATH = re.compile(
    r"(?i)(?<![a-z0-9:])/(?:home|users|root|private|tmp|var|etc|opt|srv|mnt|volumes|workspace)(?:/|\b)"
)
METRIC_KEY = re.compile(r"[A-Za-z][A-Za-z0-9_.-]{0,63}")
SENSITIVE_METRIC_KEY = re.compile(
    r"(?i)(?:api.?key|authorization|bearer|credential|password|secret|token|path|command)"
)


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
    if ABSOLUTE_WINDOWS_PATH.search(normalized) or ABSOLUTE_UNIX_PATH.search(normalized):
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


def sanitize_metrics(
    metrics: dict[str, float | int | str | bool] | None,
) -> dict[str, float | int | str | bool]:
    if metrics is None:
        return {}
    if len(metrics) > 32:
        raise ValueError("metrics must contain at most 32 values")
    result: dict[str, float | int | str | bool] = {}
    for key, value in metrics.items():
        if not METRIC_KEY.fullmatch(key) or SENSITIVE_METRIC_KEY.search(key):
            raise ValueError("metric keys must be safe non-sensitive identifiers")
        if isinstance(value, bool) or isinstance(value, int):
            result[key] = value
        elif isinstance(value, float):
            if not math.isfinite(value):
                raise ValueError("metric values must be finite")
            result[key] = value
        elif isinstance(value, str):
            result[key] = sanitize_text(value, f"metric {key}", 120)
        else:
            raise ValueError("metric values must be scalar JSON values")
    return result


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
        metrics=sanitize_metrics(metrics),
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


def validate_learning(
    runtime_root: Path,
    record_id: str,
    *,
    benchmark_artifact: Path,
) -> dict[str, Any]:
    path = runtime_root / "hermes-learning" / f"{record_id}.json"
    record = read_json(path)
    if not isinstance(record, dict):
        raise ValueError("learning record was not found")
    if record.get("state") not in {"candidate", "validated"}:
        raise ValueError("only candidate learning can be benchmark-validated")
    if not benchmark_artifact.is_file() or benchmark_artifact.is_symlink():
        raise ValueError("benchmark artifact must be a regular file")

    artifact_bytes = benchmark_artifact.read_bytes()
    artifact_sha256 = hashlib.sha256(artifact_bytes).hexdigest()
    try:
        artifact = json.loads(artifact_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("benchmark artifact must be valid UTF-8 JSON") from error
    if not isinstance(artifact, dict) or artifact.get("schemaVersion") != 1:
        raise ValueError("benchmark artifact has an unsupported schema")
    if artifact.get("recordId") != record_id:
        raise ValueError("benchmark artifact does not match the learning record")
    if artifact.get("taskId") != record.get("task_id"):
        raise ValueError("benchmark artifact does not match the validated task")
    if artifact.get("passed") is not True or artifact.get("validationPassed") is not True:
        raise ValueError("benchmark artifact does not contain passing validation")
    commands = artifact.get("commands")
    if (
        not isinstance(commands, list)
        or not commands
        or any(not isinstance(command, str) or len(command.strip()) < 3 for command in commands)
    ):
        raise ValueError("benchmark artifact must contain executed commands")
    benchmark_id = sanitize_text(
        str(artifact.get("benchmarkId", "")), "benchmark id", 100
    )
    executed_at = str(artifact.get("executedAt", ""))
    try:
        parsed_at = datetime.fromisoformat(executed_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("benchmark artifact has an invalid executedAt timestamp") from error
    if parsed_at.tzinfo is None:
        raise ValueError("benchmark artifact executedAt must include a timezone")
    related_skill = record.get("related_skill")
    if related_skill and artifact.get("relatedSkill") != related_skill:
        raise ValueError("benchmark artifact does not match the related skill")

    existing = record.get("benchmarkEvidence")
    if record.get("state") == "validated" and isinstance(existing, dict):
        if existing.get("artifactSha256") == artifact_sha256:
            return record
        raise ValueError("validated learning cannot replace its benchmark evidence")

    record["state"] = "validated"
    record["benchmarkEvidence"] = {
        "benchmarkId": benchmark_id,
        "artifactSha256": artifact_sha256,
        "executedAt": executed_at,
        "commandCount": len(commands),
        "validatedAt": utc_now(),
    }
    atomic_json(path, record)
    return record


def promote_learning(
    runtime_root: Path,
    record_id: str,
    *,
    benchmark_sha256: str,
    approved_by: str,
) -> dict[str, Any]:
    path = runtime_root / "hermes-learning" / f"{record_id}.json"
    record = read_json(path)
    if not isinstance(record, dict):
        raise ValueError("learning record was not found")
    if record.get("state") != "validated":
        raise ValueError("learning must be benchmark-validated before promotion")
    evidence = record.get("benchmarkEvidence")
    if not isinstance(evidence, dict):
        raise ValueError("validated learning is missing benchmark evidence")
    normalized_sha256 = benchmark_sha256.strip().lower()
    if not re.fullmatch(r"[a-f0-9]{64}", normalized_sha256):
        raise ValueError("benchmark sha256 must be a lowercase SHA-256 digest")
    if evidence.get("artifactSha256") != normalized_sha256:
        raise ValueError("benchmark evidence digest does not match")
    record["state"] = "promoted"
    record["approvedBy"] = sanitize_text(approved_by, "approved by", 80)
    record["approvedBenchmarkSha256"] = normalized_sha256
    record["promotedAt"] = utc_now()
    atomic_json(path, record)
    return record


def public_learning_metadata(record: dict[str, Any]) -> dict[str, Any]:
    def safe(value: Any, field: str, maximum: int = 120) -> str:
        try:
            return sanitize_text(str(value or ""), field, maximum)
        except ValueError:
            return "unavailable"

    evidence = record.get("benchmarkEvidence")
    validation = None
    if isinstance(evidence, dict):
        validation = {
            "benchmarkId": safe(evidence.get("benchmarkId"), "benchmark id"),
            "validatedAt": safe(evidence.get("validatedAt"), "validated at"),
        }
    return {
        "recordId": safe(record.get("record_id"), "record id"),
        "recordedAt": safe(record.get("recorded_at"), "recorded at"),
        "domain": safe(record.get("domain"), "domain", 80),
        "relatedSkill": (
            safe(record.get("related_skill"), "related skill", 80)
            if record.get("related_skill")
            else None
        ),
        "state": str(record.get("state", "unknown")),
        "validation": validation,
        "promotedAt": (
            safe(record.get("promotedAt"), "promoted at")
            if record.get("promotedAt")
            else None
        ),
    }


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

    def task_is_stale(status: dict[str, Any]) -> bool:
        if status.get("state") not in {"isolated", "editing", "validating"}:
            return False
        try:
            updated_at = datetime.fromisoformat(
                str(status.get("updatedAt", "")).replace("Z", "+00:00")
            )
        except ValueError:
            return True
        return (datetime.now(UTC) - updated_at).total_seconds() > 7200

    def public_task(status: dict[str, Any]) -> dict[str, Any]:
        return {
            "taskId": str(status.get("taskId", "")),
            "projectName": str(status.get("projectName", "unknown")),
            "requestedBy": str(status.get("requestedBy", "Codex")),
            "state": str(status.get("state", "unknown")),
            "updatedAt": str(status.get("updatedAt", "")),
            "filesChanged": int(status.get("filesChanged", 0) or 0),
            "patchBytes": int(status.get("patchBytes", 0) or 0),
            "stale": task_is_stale(status),
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
                "enforced": all(
                    isinstance(route.get("profile"), str)
                    for route in config["modelRouter"]["routes"]
                ),
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
                "configured": sorted(
                    set(config["skills"]["core"] + config["skills"]["project"])
                ),
                "installed": inventory.get("skills", []),
                "roleAware": True,
                "profiles": inventory.get("profileSkills", []),
            },
            "learning": {
                "state": "healthy",
                "promotionState": "healthy",
                "pendingApproval": lesson_counts.get("validated", 0),
                "counts": lesson_counts,
                "last": public_learning_metadata(lessons[-1]) if lessons else None,
            },
            "sandbox": {
                "state": "healthy",
                "counts": task_counts,
                "staleCount": sum(task_is_stale(status) for status in statuses),
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
