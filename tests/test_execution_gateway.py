from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from execution_gateway import (
    ApprovalReceipt,
    ExecutionCapability,
    ExecutionGateway,
    ExecutionRequest,
    ExternalOperation,
    RiskClass,
)
from execution_gateway.service import validate_config


class ExecutionGatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.repo = Path(__file__).resolve().parents[1]
        cls.config = json.loads(
            (cls.repo / "config" / "execution-gateway.json").read_text(
                encoding="utf-8"
            )
        )
        cls.gateway = ExecutionGateway(cls.config)
        cls.now = 1_785_520_000

    def request(self, capability: ExecutionCapability, **overrides) -> ExecutionRequest:
        values = {
            "request_id": "request-001",
            "capability": capability,
            "operation": "read",
            "risk_class": RiskClass.LOW,
            "profile": "hermesbrain",
            "skills": ("hermes-brain",),
            "approval_requirement": "none",
        }
        values.update(overrides)
        return ExecutionRequest(**values)

    def test_sandbox_code_is_limited_to_managed_worktrees(self) -> None:
        self.assertNotIn(
            "local-inference", self.config["sandboxCode"]["allowedOperations"]
        )
        allowed = self.gateway.policy_check(
            self.request(
                ExecutionCapability.SANDBOX_CODE,
                operation="test",
                sandbox_path=(
                    "C:/Users/waila/AppData/Local/local-ai-orchestrator/"
                    "hermes-worktrees/hermes-test"
                ),
            ),
            now=self.now,
        )
        self.assertTrue(allowed.allowed)
        denied = self.gateway.policy_check(
            self.request(
                ExecutionCapability.SANDBOX_CODE,
                operation="edit",
                sandbox_path="C:/source-checkout/project",
            ),
            now=self.now,
        )
        self.assertFalse(denied.allowed)
        self.assertEqual(denied.reason_code, "sandbox-path-denied")

    def test_playwright_origin_must_be_allowlisted(self) -> None:
        allowed = self.gateway.policy_check(
            self.request(
                ExecutionCapability.PLAYWRIGHT_VALIDATION,
                operation="validate",
                browser_origin="http://127.0.0.1:4310",
            ),
            now=self.now,
        )
        self.assertTrue(allowed.allowed)
        denied = self.gateway.policy_check(
            self.request(
                ExecutionCapability.PLAYWRIGHT_VALIDATION,
                operation="validate",
                browser_origin="https://example.invalid",
            ),
            now=self.now,
        )
        self.assertEqual(denied.reason_code, "browser-origin-denied")

    def test_empty_connector_allowlist_fails_closed(self) -> None:
        self.assertEqual(validate_config(self.config)["connectors"], 0)
        denied = self.gateway.policy_check(
            self.request(
                ExecutionCapability.EXTERNAL_AUTOMATION,
                operation="external-get",
                connector="unknown-service",
                external_operation=ExternalOperation.GET,
                method="GET",
                path="/events",
            ),
            now=self.now,
        )
        self.assertFalse(denied.allowed)
        self.assertEqual(denied.reason_code, "connector-denied")

    def test_generic_connector_mutations_still_require_policy_evidence(self) -> None:
        config = copy.deepcopy(self.config)
        config["externalAutomation"]["connectors"] = {
            "calendar-service": {
                "origin": "https://calendar.example.invalid",
                "operations": [
                    {"method": "GET", "path": "/events", "mutation": False},
                    {"method": "POST", "path": "/events", "mutation": True},
                ],
            }
        }
        gateway = ExecutionGateway(config)
        read = gateway.policy_check(
            self.request(
                ExecutionCapability.EXTERNAL_AUTOMATION,
                operation="external-get",
                connector="calendar-service",
                external_operation=ExternalOperation.GET,
                method="GET",
                path="/events",
            ),
            now=self.now,
        )
        self.assertTrue(read.allowed)
        mutation = self.request(
            ExecutionCapability.EXTERNAL_AUTOMATION,
            operation="external-mutation",
            risk_class=RiskClass.HIGH,
            approval_requirement="approval-receipt-for-mutation",
            connector="calendar-service",
            external_operation=ExternalOperation.MUTATION,
            method="POST",
            path="/events",
            idempotency_key="calendar-request-001",
        )
        without_receipt = gateway.policy_check(mutation, now=self.now)
        self.assertEqual(without_receipt.reason_code, "approval-receipt-required")
        receipt = ApprovalReceipt(
            receipt_id="receipt-001",
            request_id="request-001",
            capability=ExecutionCapability.EXTERNAL_AUTOMATION,
            issued_at=self.now - 10,
            expires_at=self.now + 60,
        )
        allowed = gateway.policy_check(
            self.request(
                ExecutionCapability.EXTERNAL_AUTOMATION,
                operation="external-mutation",
                risk_class=RiskClass.HIGH,
                approval_requirement="approval-receipt-for-mutation",
                connector="calendar-service",
                external_operation=ExternalOperation.MUTATION,
                method="POST",
                path="/events",
                idempotency_key="calendar-request-001",
                approval_receipt=receipt,
            ),
            now=self.now,
        )
        self.assertTrue(allowed.allowed)
        telemetry = json.dumps(allowed.telemetry.as_dict()).casefold()
        for forbidden in ("token", "secret", "argument", "receipt", "idempotency"):
            self.assertNotIn(forbidden, telemetry)


if __name__ == "__main__":
    unittest.main()