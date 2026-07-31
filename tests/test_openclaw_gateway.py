from __future__ import annotations

from dataclasses import replace
import json
import unittest
from pathlib import Path

from openclaw_gateway import (
    IngressRejected,
    IngressRequest,
    OpenClawIngressAdapter,
    OpenClawWsRpcContext,
)
from openclaw_gateway.service import validate_config


class OpenClawAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.repo = Path(__file__).resolve().parents[1]
        cls.config = json.loads(
            (cls.repo / "config" / "openclaw-gateway.json").read_text(
                encoding="utf-8"
            )
        )
        cls.now = 1_785_520_000

    def context(self, **overrides) -> OpenClawWsRpcContext:
        values = {
            "endpoint": "ws://127.0.0.1:18789",
            "connection_id": "connection-001",
            "session_id": "session-001",
            "channel": "local-chat",
            "route": "agent:hermes:main",
            "authenticated": True,
            "authentication_mode": "token",
            "first_frame": "connect",
            "hello": {
                "type": "hello-ok",
                "snapshot": {"sessions": [], "routing": {}, "channels": []},
            },
        }
        values.update(overrides)
        return OpenClawWsRpcContext(**values)

    def request(self, **overrides) -> IngressRequest:
        values = {
            "request_id": "request-001",
            "capability": "programming",
            "objective": "Update code inside the authorized sandbox.",
            "content": "Use only the supplied project context.",
            "arguments": {"projectSignals": ["python"]},
        }
        values.update(overrides)
        return IngressRequest(**values)

    def test_config_describes_the_official_runtime(self) -> None:
        result = validate_config(self.config)
        self.assertEqual(result["runtime"], "official-openclaw")
        self.assertEqual(result["endpoint"], "ws://127.0.0.1:18789")
        self.assertFalse(result["embeddedServer"])
        self.assertEqual(
            self.config["runtime"]["sourceOfTruth"],
            ["sessions", "routing", "channels"],
        )
        self.assertEqual(
            self.config["health"]["commands"],
            [
                "openclaw gateway status --json",
                "openclaw gateway status --require-rpc",
            ],
        )

    def test_authenticated_official_context_produces_safe_ingress(self) -> None:
        accepted, event = OpenClawIngressAdapter(self.config).accept(
            self.context(), self.request(), now=self.now
        )
        self.assertEqual(accepted.capability, "programming")
        self.assertEqual(accepted.openclaw.session_id, "session-001")
        self.assertEqual(accepted.openclaw.channel, "local-chat")
        telemetry = json.dumps(event.as_dict()).casefold()
        for forbidden in (
            "objective",
            "content",
            "arguments",
            "token",
            "password",
            "secret",
            "session-001",
            "connection-001",
        ):
            self.assertNotIn(forbidden, telemetry)

    def test_rejects_untrusted_or_incomplete_official_context(self) -> None:
        adapter = OpenClawIngressAdapter(self.config)
        with self.assertRaisesRegex(IngressRejected, "not authenticated"):
            adapter.accept(
                replace(self.context(), authenticated=False),
                self.request(),
                now=self.now,
            )
        with self.assertRaisesRegex(IngressRejected, "first WebSocket frame"):
            adapter.accept(
                replace(self.context(), first_frame="request"),
                self.request(),
                now=self.now,
            )
        with self.assertRaisesRegex(IngressRejected, "hello-ok snapshot"):
            adapter.accept(
                replace(self.context(), hello={"type": "hello-ok"}),
                self.request(),
                now=self.now,
            )

    def test_rejects_secret_values_in_ingress(self) -> None:
        with self.assertRaisesRegex(IngressRejected, "secret value"):
            OpenClawIngressAdapter(self.config).accept(
                self.context(),
                self.request(arguments={"token": "raw-secret-value"}),
                now=self.now,
            )


if __name__ == "__main__":
    unittest.main()