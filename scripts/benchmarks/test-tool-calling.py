"""Reproducible local tool-calling probe; sends no credentials or user data."""
from __future__ import annotations

import json
import urllib.request

MODEL = "qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive"
URL = "http://127.0.0.1:1234/v1/chat/completions"

payload = {
    "model": MODEL,
    "messages": [{"role": "user", "content": "Read the local task status PH3-TEST."}],
    "tools": [{
        "type": "function",
        "function": {
            "name": "get_workspace_status",
            "description": "Read a synthetic test status.",
            "parameters": {
                "type": "object",
                "properties": {"task_id": {"type": "string"}},
                "required": ["task_id"],
                "additionalProperties": False,
            },
        },
    }],
    "tool_choice": "required",
    "reasoning_effort": "none",
    "temperature": 0,
    "max_tokens": 128,
}
request = urllib.request.Request(
    URL,
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(request, timeout=120) as response:
    body = json.load(response)
calls = body["choices"][0]["message"].get("tool_calls") or []
assert calls and calls[0]["function"]["name"] == "get_workspace_status"
arguments = json.loads(calls[0]["function"]["arguments"])
assert arguments["task_id"] == "PH3-TEST"
print(json.dumps({"status": "PASS", "tool": calls[0]["function"]["name"]}))
