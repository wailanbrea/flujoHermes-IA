from __future__ import annotations

from pathlib import Path
import re
from typing import Any, Mapping

from execution_gateway.contracts import (
    ApprovalReceipt,
    ExecutionCapability,
    ExecutionRequest,
    ExternalOperation,
)
from execution_gateway.service import ExecutionGateway
from openclaw_gateway.contracts import AcceptedIngress

from .contracts import BrainPlan, LearningMetadata
from .core import read_json
from .router import route_task


SAFE_METADATA = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{2,127}")


def retrieve_learning_metadata(
    runtime_root: Path,
    *,
    domain: str | None = None,
    limit: int = 20,
) -> tuple[LearningMetadata, ...]:
    """Return only promotion-safe metadata, never complete lesson payloads."""
    if limit <= 0:
        return ()
    learning_root = runtime_root / "hermes-learning"
    if not learning_root.is_dir():
        return ()
    result: list[LearningMetadata] = []
    for path in sorted(learning_root.glob("*.json")):
        record = read_json(path)
        if not isinstance(record, dict) or record.get("state") not in {
            "validated",
            "promoted",
        }:
            continue
        evidence = record.get("benchmarkEvidence")
        if not isinstance(evidence, dict):
            continue
        values = {
            "record_id": str(record.get("record_id", "")),
            "state": str(record.get("state", "")),
            "domain": str(record.get("domain", "")),
            "benchmark_id": str(evidence.get("benchmarkId", "")),
            "validated_at": str(evidence.get("validatedAt", "")),
        }
        if domain is not None and values["domain"] != domain:
            continue
        if any(
            not SAFE_METADATA.fullmatch(values[key])
            for key in ("record_id", "domain", "benchmark_id")
        ) or not values["validated_at"]:
            continue
        related = record.get("related_skill")
        related_skill = str(related) if related is not None else None
        if related_skill is not None and not SAFE_METADATA.fullmatch(related_skill):
            continue
        result.append(
            LearningMetadata(
                record_id=values["record_id"],
                state=values["state"],
                domain=values["domain"],
                related_skill=related_skill,
                benchmark_id=values["benchmark_id"],
                validated_at=values["validated_at"],
            )
        )
    return tuple(result[-limit:])


def _optional_string(arguments: Mapping[str, Any], key: str) -> str | None:
    value = arguments.get(key)
    return str(value) if value is not None else None


class HermesBrainService:
    def __init__(self, config: dict[str, Any], runtime_root: Path) -> None:
        self.config = config
        self.runtime_root = runtime_root

    def plan(self, ingress: AcceptedIngress) -> BrainPlan:
        if not isinstance(ingress, AcceptedIngress):
            raise TypeError("Hermes Brain accepts only official OpenClaw ingress")
        arguments = ingress.arguments
        project_signals = arguments.get("projectSignals", [])
        if not isinstance(project_signals, list) or not all(
            isinstance(item, str) for item in project_signals
        ):
            raise ValueError("projectSignals must be a string list")
        route = route_task(
            self.config,
            capability=ingress.capability,
            project_signals=project_signals,
        )
        receipt_value = arguments.get("approvalReceipt")
        receipt = (
            ApprovalReceipt.from_mapping(receipt_value)
            if isinstance(receipt_value, Mapping)
            else None
        )
        method = (_optional_string(arguments, "method") or "GET").upper()
        external_operation = None
        if route.execution_capability is ExecutionCapability.EXTERNAL_AUTOMATION:
            operation_value = arguments.get("externalOperation")
            external_operation = (
                ExternalOperation(str(operation_value))
                if operation_value is not None
                else (
                    ExternalOperation.MUTATION
                    if method != "GET"
                    else ExternalOperation.GET
                )
            )
        default_operation = {
            ExecutionCapability.SANDBOX_CODE: (
                "edit"
                if ingress.capability in {"programming", "skill-authoring", "integration"}
                else "read"
            ),
            ExecutionCapability.PLAYWRIGHT_VALIDATION: "validate",
            ExecutionCapability.EXTERNAL_AUTOMATION: (
                "external-mutation" if external_operation is ExternalOperation.MUTATION else "external-get"
            ),
        }[route.execution_capability]
        execution_arguments = arguments.get("executionArguments", {})
        if not isinstance(execution_arguments, Mapping):
            raise ValueError("executionArguments must be an object")
        request = ExecutionRequest(
            request_id=ingress.request_id,
            capability=route.execution_capability,
            operation=_optional_string(arguments, "operation") or default_operation,
            risk_class=route.risk_class,
            profile=route.profile,
            skills=route.skills,
            approval_requirement=route.approval_requirement,
            sandbox_path=_optional_string(arguments, "sandboxPath"),
            browser_origin=_optional_string(arguments, "browserOrigin"),
            connector=_optional_string(arguments, "connector"),
            external_operation=external_operation,
            method=method if external_operation is not None else None,
            path=_optional_string(arguments, "path"),
            secret_reference=_optional_string(arguments, "secretReference"),
            approval_receipt=receipt,
            idempotency_key=_optional_string(arguments, "idempotencyKey"),
            arguments=dict(execution_arguments),
        )
        learning = retrieve_learning_metadata(
            self.runtime_root,
            domain=ingress.capability,
        )
        return BrainPlan(
            ingress_request_id=ingress.request_id,
            route=route,
            learning=learning,
            execution_request=request,
        )

    def policy_check(
        self,
        ingress: AcceptedIngress,
        gateway: ExecutionGateway,
        *,
        now: int | None = None,
    ):
        plan = self.plan(ingress)
        return plan, gateway.policy_check(plan.execution_request, now=now)
