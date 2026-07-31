from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Mapping


class ExecutionCapability(str, Enum):
    SANDBOX_CODE = "sandbox-code"
    PLAYWRIGHT_VALIDATION = "playwright-validation"
    EXTERNAL_AUTOMATION = "external-automation"


class RiskClass(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ExternalOperation(str, Enum):
    GET = "get"
    MUTATION = "mutation"


@dataclass(frozen=True)
class ApprovalReceipt:
    receipt_id: str
    request_id: str
    capability: ExecutionCapability
    issued_at: int
    expires_at: int

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "ApprovalReceipt":
        return cls(
            receipt_id=str(value.get("receiptId", "")),
            request_id=str(value.get("requestId", "")),
            capability=ExecutionCapability(str(value.get("capability", ""))),
            issued_at=int(value.get("issuedAt", 0)),
            expires_at=int(value.get("expiresAt", 0)),
        )


@dataclass(frozen=True)
class ExecutionRequest:
    request_id: str
    capability: ExecutionCapability
    operation: str
    risk_class: RiskClass
    profile: str
    skills: tuple[str, ...]
    approval_requirement: str
    sandbox_path: str | None = None
    browser_origin: str | None = None
    connector: str | None = None
    external_operation: ExternalOperation | None = None
    method: str | None = None
    path: str | None = None
    secret_reference: str | None = None
    approval_receipt: ApprovalReceipt | None = None
    idempotency_key: str | None = None
    arguments: Mapping[str, Any] = field(default_factory=dict)

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "ExecutionRequest":
        receipt = value.get("approvalReceipt")
        skills = value.get("skills", [])
        arguments = value.get("arguments", {})
        if not isinstance(skills, list) or not all(
            isinstance(item, str) for item in skills
        ):
            raise ValueError("execution skills must be a string list")
        if not isinstance(arguments, dict):
            raise ValueError("execution arguments must be an object")
        external = value.get("externalOperation")
        return cls(
            request_id=str(value.get("requestId", "")),
            capability=ExecutionCapability(str(value.get("capability", ""))),
            operation=str(value.get("operation", "")),
            risk_class=RiskClass(str(value.get("riskClass", ""))),
            profile=str(value.get("profile", "")),
            skills=tuple(skills),
            approval_requirement=str(value.get("approvalRequirement", "none")),
            sandbox_path=(
                str(value["sandboxPath"])
                if value.get("sandboxPath") is not None
                else None
            ),
            browser_origin=(
                str(value["browserOrigin"])
                if value.get("browserOrigin") is not None
                else None
            ),
            connector=(
                str(value["connector"])
                if value.get("connector") is not None
                else None
            ),
            external_operation=(
                ExternalOperation(str(external)) if external is not None else None
            ),
            method=(
                str(value["method"]) if value.get("method") is not None else None
            ),
            path=str(value["path"]) if value.get("path") is not None else None,
            secret_reference=(
                str(value["secretReference"])
                if value.get("secretReference") is not None
                else None
            ),
            approval_receipt=(
                ApprovalReceipt.from_mapping(receipt)
                if isinstance(receipt, Mapping)
                else None
            ),
            idempotency_key=(
                str(value["idempotencyKey"])
                if value.get("idempotencyKey") is not None
                else None
            ),
            arguments=arguments,
        )


@dataclass(frozen=True)
class ExecutionTelemetryEvent:
    event: str
    request_id: str
    capability: str
    risk_class: str
    outcome: str
    reason_code: str
    observed_at: int

    def as_dict(self) -> dict[str, str | int]:
        return {
            "event": self.event,
            "requestId": self.request_id,
            "capability": self.capability,
            "riskClass": self.risk_class,
            "outcome": self.outcome,
            "reasonCode": self.reason_code,
            "observedAt": self.observed_at,
        }


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    request_id: str
    capability: ExecutionCapability
    risk_class: RiskClass
    approval_required: bool
    reason_code: str
    telemetry: ExecutionTelemetryEvent

    def as_dict(self) -> dict[str, str | bool | dict[str, str | int]]:
        return {
            "allowed": self.allowed,
            "requestId": self.request_id,
            "capability": self.capability.value,
            "riskClass": self.risk_class.value,
            "approvalRequired": self.approval_required,
            "reasonCode": self.reason_code,
            "telemetry": self.telemetry.as_dict(),
        }
