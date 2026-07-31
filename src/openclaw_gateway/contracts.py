from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


JsonValue = None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]


@dataclass(frozen=True)
class IngressRequest:
    request_id: str
    capability: str
    objective: str
    content: str | None
    arguments: Mapping[str, JsonValue]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "IngressRequest":
        arguments = value.get("arguments", {})
        if not isinstance(arguments, dict):
            raise ValueError("ingress arguments must be an object")
        return cls(
            request_id=str(value.get("requestId", "")),
            capability=str(value.get("capability", "")),
            objective=str(value.get("objective", "")),
            content=(str(value["content"]) if value.get("content") is not None else None),
            arguments=arguments,
        )


@dataclass(frozen=True)
class OpenClawWsRpcContext:
    """Connection metadata supplied by the authenticated official gateway."""

    endpoint: str
    connection_id: str
    session_id: str
    channel: str
    route: str
    authenticated: bool
    authentication_mode: str
    first_frame: str
    hello: Mapping[str, JsonValue]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "OpenClawWsRpcContext":
        hello = value.get("hello", {})
        if not isinstance(hello, dict):
            raise ValueError("OpenClaw hello context must be an object")
        return cls(
            endpoint=str(value.get("endpoint", "")),
            connection_id=str(value.get("connectionId", "")),
            session_id=str(value.get("sessionId", "")),
            channel=str(value.get("channel", "")),
            route=str(value.get("route", "")),
            authenticated=value.get("authenticated") is True,
            authentication_mode=str(value.get("authenticationMode", "")),
            first_frame=str(value.get("firstFrame", "")),
            hello=hello,
        )


@dataclass(frozen=True, init=False)
class AcceptedIngress:
    request_id: str
    capability: str
    objective: str
    content: str | None
    arguments: Mapping[str, JsonValue]
    openclaw: OpenClawWsRpcContext

    def __init__(
        self,
        *,
        request: IngressRequest,
        openclaw: OpenClawWsRpcContext,
        _accepted: object,
    ) -> None:
        if _accepted is not _ACCEPTANCE_SEAL:
            raise TypeError("accepted ingress can only be created by OpenClawIngressAdapter")
        object.__setattr__(self, "request_id", request.request_id)
        object.__setattr__(self, "capability", request.capability)
        object.__setattr__(self, "objective", request.objective)
        object.__setattr__(self, "content", request.content)
        object.__setattr__(self, "arguments", dict(request.arguments))
        object.__setattr__(self, "openclaw", openclaw)


@dataclass(frozen=True)
class IngressTelemetryEvent:
    event: str
    request_id: str
    source: str
    capability: str
    authenticated: bool
    outcome: str
    reason_code: str
    observed_at: int

    def as_dict(self) -> dict[str, str | int | bool]:
        return {
            "event": self.event,
            "requestId": self.request_id,
            "source": self.source,
            "capability": self.capability,
            "authenticated": self.authenticated,
            "outcome": self.outcome,
            "reasonCode": self.reason_code,
            "observedAt": self.observed_at,
        }


_ACCEPTANCE_SEAL = object()


def accepted_ingress(
    request: IngressRequest,
    openclaw: OpenClawWsRpcContext,
) -> AcceptedIngress:
    return AcceptedIngress(
        request=request,
        openclaw=openclaw,
        _accepted=_ACCEPTANCE_SEAL,
    )