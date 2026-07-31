from __future__ import annotations

from pathlib import PurePath
import re
import time
from typing import Any, Mapping
from urllib.parse import urlsplit

from .contracts import (
    ExecutionCapability,
    ExecutionRequest,
    ExecutionTelemetryEvent,
    ExternalOperation,
    PolicyDecision,
)


IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{2,127}")
IDEMPOTENCY_KEY = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{7,127}")
SECRET_REFERENCE = re.compile(r"env:[A-Z_][A-Z0-9_]*")


class ExecutionGateway:
    """Policy-check execution requests without performing any action."""

    def __init__(self, config: Mapping[str, Any]) -> None:
        validate_config(config)
        self.config = config

    def _decision(
        self,
        request: ExecutionRequest,
        *,
        allowed: bool,
        reason_code: str,
        now: int,
        approval_required: bool | None = None,
    ) -> PolicyDecision:
        required = (
            request.approval_requirement != "none"
            if approval_required is None
            else approval_required
        )
        event = ExecutionTelemetryEvent(
            event="execution.policy-check",
            request_id=(
                request.request_id
                if IDENTIFIER.fullmatch(request.request_id)
                else "invalid"
            ),
            capability=request.capability.value,
            risk_class=request.risk_class.value,
            outcome="allowed" if allowed else "denied",
            reason_code=reason_code,
            observed_at=now,
        )
        return PolicyDecision(
            allowed=allowed,
            request_id=event.request_id,
            capability=request.capability,
            risk_class=request.risk_class,
            approval_required=required,
            reason_code=reason_code,
            telemetry=event,
        )

    def policy_check(
        self,
        request: ExecutionRequest,
        *,
        now: int | None = None,
    ) -> PolicyDecision:
        observed_at = int(time.time()) if now is None else int(now)
        if not IDENTIFIER.fullmatch(request.request_id):
            return self._decision(
                request,
                allowed=False,
                reason_code="invalid-request-id",
                now=observed_at,
            )
        allowed_capabilities = set(self.config.get("allowedCapabilities", []))
        if request.capability.value not in allowed_capabilities:
            return self._decision(
                request,
                allowed=False,
                reason_code="capability-denied",
                now=observed_at,
            )
        if request.capability is ExecutionCapability.SANDBOX_CODE:
            return self._check_sandbox(request, observed_at)
        if request.capability is ExecutionCapability.PLAYWRIGHT_VALIDATION:
            return self._check_browser(request, observed_at)
        return self._check_external(request, observed_at)

    def _check_sandbox(
        self, request: ExecutionRequest, now: int
    ) -> PolicyDecision:
        policy = self.config["sandboxCode"]
        if request.operation not in set(policy["allowedOperations"]):
            return self._decision(
                request,
                allowed=False,
                reason_code="sandbox-operation-denied",
                now=now,
            )
        if not request.sandbox_path:
            return self._decision(
                request,
                allowed=False,
                reason_code="sandbox-path-required",
                now=now,
            )
        normalized = request.sandbox_path.replace("\\", "/")
        path = PurePath(normalized)
        required_segment = str(policy["requiredPathSegment"]).casefold()
        if not path.is_absolute() or required_segment not in {
            part.casefold() for part in path.parts
        }:
            return self._decision(
                request,
                allowed=False,
                reason_code="sandbox-path-denied",
                now=now,
            )
        return self._decision(
            request,
            allowed=True,
            reason_code="sandbox-policy-allowed",
            now=now,
        )

    def _check_browser(
        self, request: ExecutionRequest, now: int
    ) -> PolicyDecision:
        policy = self.config["playwrightValidation"]
        if request.operation not in set(policy["allowedOperations"]):
            return self._decision(
                request,
                allowed=False,
                reason_code="browser-operation-denied",
                now=now,
            )
        origin = request.browser_origin or ""
        parsed = urlsplit(origin)
        canonical = (
            f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"
            if parsed.scheme and parsed.netloc
            else ""
        )
        if (
            not canonical
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
            or canonical not in set(policy["allowedOrigins"])
        ):
            return self._decision(
                request,
                allowed=False,
                reason_code="browser-origin-denied",
                now=now,
            )
        return self._decision(
            request,
            allowed=True,
            reason_code="browser-policy-allowed",
            now=now,
        )

    def _check_external(
        self, request: ExecutionRequest, now: int
    ) -> PolicyDecision:
        connectors = self.config["externalAutomation"]["connectors"]
        connector = connectors.get(request.connector or "")
        if not isinstance(connector, Mapping):
            return self._decision(
                request,
                allowed=False,
                reason_code="connector-denied",
                now=now,
            )
        expected_reference = connector.get("secretReference")
        invalid_reference = (
            expected_reference is None and request.secret_reference is not None
        ) or (
            expected_reference is not None
            and (
                request.secret_reference != expected_reference
                or not SECRET_REFERENCE.fullmatch(request.secret_reference or "")
            )
        )
        if invalid_reference:
            return self._decision(
                request,
                allowed=False,
                reason_code="secret-reference-denied",
                now=now,
            )
        method = (request.method or "").upper()
        path = request.path or ""
        if not path.startswith("/") or "?" in path or "#" in path or ".." in path:
            return self._decision(
                request,
                allowed=False,
                reason_code="connector-path-denied",
                now=now,
            )
        endpoint = next(
            (
                item
                for item in connector["operations"]
                if item.get("method") == method and item.get("path") == path
            ),
            None,
        )
        if endpoint is None:
            return self._decision(
                request,
                allowed=False,
                reason_code="connector-operation-denied",
                now=now,
            )
        mutation = bool(endpoint.get("mutation"))
        expected_operation = (
            ExternalOperation.MUTATION if mutation else ExternalOperation.GET
        )
        if request.external_operation is not expected_operation:
            return self._decision(
                request,
                allowed=False,
                reason_code="external-operation-mismatch",
                now=now,
                approval_required=mutation,
            )
        if not mutation:
            return self._decision(
                request,
                allowed=True,
                reason_code="external-get-allowed",
                now=now,
                approval_required=False,
            )
        if not request.idempotency_key or not IDEMPOTENCY_KEY.fullmatch(
            request.idempotency_key
        ):
            return self._decision(
                request,
                allowed=False,
                reason_code="idempotency-key-required",
                now=now,
                approval_required=True,
            )
        receipt = request.approval_receipt
        if (
            receipt is None
            or not IDENTIFIER.fullmatch(receipt.receipt_id)
            or receipt.request_id != request.request_id
            or receipt.capability is not ExecutionCapability.EXTERNAL_AUTOMATION
            or receipt.issued_at > now
            or receipt.expires_at < now
            or receipt.expires_at <= receipt.issued_at
        ):
            return self._decision(
                request,
                allowed=False,
                reason_code="approval-receipt-required",
                now=now,
                approval_required=True,
            )
        return self._decision(
            request,
            allowed=True,
            reason_code="external-mutation-allowed",
            now=now,
            approval_required=True,
        )


def validate_config(config: Mapping[str, Any]) -> dict[str, object]:
    capabilities = config.get("allowedCapabilities")
    expected = {item.value for item in ExecutionCapability}
    if not isinstance(capabilities, list) or set(capabilities) != expected:
        raise ValueError("execution capabilities must be explicitly allowlisted")
    sandbox = config.get("sandboxCode")
    if (
        not isinstance(sandbox, Mapping)
        or not isinstance(sandbox.get("allowedOperations"), list)
        or not sandbox["allowedOperations"]
        or not isinstance(sandbox.get("requiredPathSegment"), str)
    ):
        raise ValueError("sandbox-code policy is invalid")
    browser = config.get("playwrightValidation")
    origins = browser.get("allowedOrigins") if isinstance(browser, Mapping) else None
    if not isinstance(origins, list) or not origins:
        raise ValueError("Playwright origins must be allowlisted")
    for origin in origins:
        parsed = urlsplit(str(origin))
        if not parsed.scheme or not parsed.netloc or parsed.path not in {"", "/"}:
            raise ValueError("Playwright allowlist contains an invalid origin")
    external = config.get("externalAutomation")
    connectors = external.get("connectors") if isinstance(external, Mapping) else None
    if not isinstance(connectors, Mapping):
        raise ValueError("external connector policy must be an object")
    for name, connector in connectors.items():
        if not isinstance(name, str) or not IDENTIFIER.fullmatch(name):
            raise ValueError("external connector names must be safe identifiers")
        if not isinstance(connector, Mapping):
            raise ValueError(f"external connector policy is invalid: {name}")
        origin = urlsplit(str(connector.get("origin", "")))
        if (
            origin.scheme not in {"http", "https"}
            or not origin.netloc
            or origin.username is not None
            or origin.password is not None
            or origin.path not in {"", "/"}
            or origin.query
            or origin.fragment
        ):
            raise ValueError(f"external connector origin is invalid: {name}")
        reference = connector.get("secretReference")
        if reference is not None and not SECRET_REFERENCE.fullmatch(str(reference)):
            raise ValueError(f"external connector SecretRef is invalid: {name}")
        operations = connector.get("operations")
        if not isinstance(operations, list) or not operations:
            raise ValueError(f"external connector operations are invalid: {name}")
        endpoints: set[tuple[str, str]] = set()
        for operation in operations:
            if not isinstance(operation, Mapping):
                raise ValueError(f"external connector operation is invalid: {name}")
            method = str(operation.get("method", ""))
            path = str(operation.get("path", ""))
            mutation = operation.get("mutation")
            if (
                method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}
                or not path.startswith("/")
                or "?" in path
                or "#" in path
                or ".." in path
                or not isinstance(mutation, bool)
                or (method == "GET") == mutation
                or (method, path) in endpoints
            ):
                raise ValueError(f"external connector operation is invalid: {name}")
            endpoints.add((method, path))
    return {
        "valid": True,
        "capabilities": len(capabilities),
        "connectors": len(connectors),
    }
