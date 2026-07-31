from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from execution_gateway.contracts import (
    ExecutionCapability,
    ExecutionRequest,
    RiskClass,
)


@dataclass(frozen=True)
class RouteDecision:
    capability: str
    executor: str
    fallback: str
    profile: str
    model: str | None
    toolsets: tuple[str, ...]
    skills: tuple[str, ...]
    reason: str
    manual_model: bool
    risk_class: RiskClass
    execution_capability: ExecutionCapability
    approval_requirement: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "capability": self.capability,
            "executor": self.executor,
            "fallback": self.fallback,
            "profile": self.profile,
            "model": self.model,
            "toolsets": list(self.toolsets),
            "skills": list(self.skills),
            "reason": self.reason,
            "manual_model": self.manual_model,
            "risk_class": self.risk_class.value,
            "execution_capability": self.execution_capability.value,
            "approval_requirement": self.approval_requirement,
        }


@dataclass(frozen=True)
class LearningMetadata:
    record_id: str
    state: str
    domain: str
    related_skill: str | None
    benchmark_id: str
    validated_at: str

    def as_dict(self) -> dict[str, str | None]:
        return {
            "recordId": self.record_id,
            "state": self.state,
            "domain": self.domain,
            "relatedSkill": self.related_skill,
            "benchmarkId": self.benchmark_id,
            "validatedAt": self.validated_at,
        }


@dataclass(frozen=True)
class BrainPlan:
    ingress_request_id: str
    route: RouteDecision
    learning: tuple[LearningMetadata, ...]
    execution_request: ExecutionRequest

    def as_dict(self) -> dict[str, Any]:
        request = self.execution_request
        return {
            "ingressRequestId": self.ingress_request_id,
            "route": self.route.as_dict(),
            "learning": [item.as_dict() for item in self.learning],
            "executionRequest": {
                "requestId": request.request_id,
                "capability": request.capability.value,
                "operation": request.operation,
                "riskClass": request.risk_class.value,
                "profile": request.profile,
                "skills": list(request.skills),
                "approvalRequirement": request.approval_requirement,
            },
        }
