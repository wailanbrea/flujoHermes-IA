from __future__ import annotations

import re
import time
from typing import Any, Mapping

from .contracts import (
    AcceptedIngress,
    IngressRequest,
    IngressTelemetryEvent,
    JsonValue,
    OpenClawWsRpcContext,
    accepted_ingress,
)


OFFICIAL_ENDPOINT = "ws://127.0.0.1:18789"
HEALTH_COMMANDS = [
    "openclaw gateway status --json",
    "openclaw gateway status --require-rpc",
]
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{2,127}")
SECRET_REFERENCE = re.compile(r"env:[A-Z_][A-Z0-9_]*")
BEARER_VALUE = re.compile(r"(?i)\bbearer\s+\S+")
SECRET_ASSIGNMENT = re.compile(
    r"(?i)\b(?:api[_ -]?key|authorization|password|secret|token)\s*[:=]\s*\S+"
)
FORBIDDEN_ARGUMENT_KEY = re.compile(
    r"(?i)(?:api.?key|authorization|credential|password|secret|token)"
)


class IngressRejected(ValueError):
    def __init__(self, message: str, telemetry: IngressTelemetryEvent) -> None:
        super().__init__(message)
        self.telemetry = telemetry


def _validate_identifier(value: str, field: str) -> None:
    if not IDENTIFIER.fullmatch(value):
        raise ValueError(f"{field} must be a safe identifier")


def _validate_text(value: str | None, field: str, maximum: int) -> None:
    if value is None:
        return
    if len(value.strip()) < 3 or len(value) > maximum:
        raise ValueError(f"{field} has an invalid length")
    if BEARER_VALUE.search(value) or SECRET_ASSIGNMENT.search(value):
        raise ValueError(f"{field} must not contain secret values")


def _validate_arguments(value: JsonValue, path: str = "arguments") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError("argument keys must be strings")
            compact_key = re.sub(r"[^a-z]", "", key.casefold())
            if FORBIDDEN_ARGUMENT_KEY.search(key):
                if compact_key != "secretreference":
                    raise ValueError(f"{path}.{key} must not carry a secret value")
                if not isinstance(item, str) or not SECRET_REFERENCE.fullmatch(item):
                    raise ValueError("secretReference must be an env: reference")
            _validate_arguments(item, f"{path}.{key}")
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _validate_arguments(item, f"{path}[{index}]")
        return
    if isinstance(value, str) and (
        BEARER_VALUE.search(value) or SECRET_ASSIGNMENT.search(value)
    ):
        raise ValueError(f"{path} must not contain secret values")
    if isinstance(value, float) and not (-float("inf") < value < float("inf")):
        raise ValueError(f"{path} must not contain non-finite numbers")
    if value is not None and not isinstance(value, (str, int, float, bool)):
        raise ValueError(f"{path} must contain JSON values")


def _validate_secret_ref(value: object) -> None:
    if not isinstance(value, Mapping) or {
        "source",
        "provider",
        "id",
    }.difference(value):
        raise ValueError("OpenClaw token SecretRef is incomplete")
    if (
        value.get("source") != "env"
        or value.get("provider") != "default"
        or value.get("id") != "OPENCLAW_GATEWAY_TOKEN"
    ):
        raise ValueError("OpenClaw token SecretRef is invalid")


class OpenClawIngressAdapter:
    """Adapts trusted official OpenClaw context; it does not authenticate or serve."""

    def __init__(self, config: Mapping[str, Any]) -> None:
        validate_config(config)
        self._runtime = config["runtime"]
        self._protocol = config["protocol"]
        self._authentication = config["authentication"]

    def _event(
        self,
        request: IngressRequest,
        *,
        authenticated: bool,
        outcome: str,
        reason_code: str,
        now: int,
    ) -> IngressTelemetryEvent:
        return IngressTelemetryEvent(
            event="openclaw.ingress",
            request_id=(
                request.request_id if IDENTIFIER.fullmatch(request.request_id) else "invalid"
            ),
            source="official-openclaw",
            capability=(
                request.capability if IDENTIFIER.fullmatch(request.capability) else "invalid"
            ),
            authenticated=authenticated,
            outcome=outcome,
            reason_code=reason_code,
            observed_at=now,
        )

    def accept(
        self,
        context: OpenClawWsRpcContext,
        request: IngressRequest,
        *,
        now: int | None = None,
    ) -> tuple[AcceptedIngress, IngressTelemetryEvent]:
        if not isinstance(context, OpenClawWsRpcContext):
            raise TypeError("official OpenClaw WS/RPC context is required")
        if not isinstance(request, IngressRequest):
            raise TypeError("typed OpenClaw ingress request is required")
        observed_at = int(time.time()) if now is None else int(now)

        def reject(message: str, reason_code: str) -> None:
            raise IngressRejected(
                message,
                self._event(
                    request,
                    authenticated=context.authenticated,
                    outcome="rejected",
                    reason_code=reason_code,
                    now=observed_at,
                ),
            )

        try:
            if context.endpoint != self._runtime["endpoint"]:
                raise ValueError("OpenClaw context endpoint does not match the runtime")
            if not context.authenticated:
                raise ValueError("OpenClaw context is not authenticated")
            if context.authentication_mode != self._authentication["mode"]:
                raise ValueError("OpenClaw authentication mode does not match the runtime")
            if context.first_frame != self._protocol["firstWebSocketFrame"]:
                raise ValueError("OpenClaw first WebSocket frame must be connect")
            snapshot = context.hello.get("snapshot")
            if (
                context.hello.get("type") != self._protocol["helloFrame"]
                or not isinstance(snapshot, Mapping)
            ):
                raise ValueError("OpenClaw hello-ok snapshot is required")
            for value, field in (
                (context.connection_id, "connectionId"),
                (context.session_id, "sessionId"),
                (context.channel, "channel"),
                (context.route, "route"),
                (request.request_id, "requestId"),
                (request.capability, "capability"),
            ):
                _validate_identifier(value, field)
            _validate_text(request.objective, "objective", 4000)
            _validate_text(request.content, "content", 16000)
            _validate_arguments(dict(request.arguments))
        except ValueError as error:
            reject(str(error), "invalid-official-context")

        event = self._event(
            request,
            authenticated=True,
            outcome="accepted",
            reason_code="official-context-accepted",
            now=observed_at,
        )
        return accepted_ingress(request, context), event


def validate_config(config: Mapping[str, Any]) -> dict[str, object]:
    runtime = config.get("runtime")
    if not isinstance(runtime, Mapping):
        raise ValueError("official OpenClaw runtime configuration is missing")
    if (
        runtime.get("implementation") != "official-openclaw"
        or runtime.get("deployment") != "self-hosted"
        or runtime.get("embeddedServer") is not False
        or runtime.get("endpoint") != OFFICIAL_ENDPOINT
        or runtime.get("port") != 18789
        or runtime.get("singlePort") is not True
        or runtime.get("protocols") != ["websocket-rpc", "http"]
        or runtime.get("sourceOfTruth") != ["sessions", "routing", "channels"]
    ):
        raise ValueError("official OpenClaw runtime configuration is invalid")

    protocol = config.get("protocol")
    if not isinstance(protocol, Mapping) or (
        protocol.get("firstWebSocketFrame") != "connect"
        or protocol.get("helloFrame") != "hello-ok"
        or protocol.get("helloSnapshotRequired") is not True
    ):
        raise ValueError("official OpenClaw WS/RPC protocol configuration is invalid")

    authentication = config.get("authentication")
    if not isinstance(authentication, Mapping) or (
        authentication.get("ownedBy") != "official-openclaw"
        or authentication.get("required") is not True
        or authentication.get("mode") != "token"
        or authentication.get("configPath") != "gateway.auth.token"
    ):
        raise ValueError("official OpenClaw authentication configuration is invalid")
    _validate_secret_ref(authentication.get("tokenSecretRef"))

    health = config.get("health")
    if not isinstance(health, Mapping) or health.get("commands") != HEALTH_COMMANDS:
        raise ValueError("official OpenClaw health commands are invalid")
    return {
        "valid": True,
        "runtime": "official-openclaw",
        "endpoint": OFFICIAL_ENDPOINT,
        "embeddedServer": False,
    }