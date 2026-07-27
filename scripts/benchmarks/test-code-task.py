"""Checks deterministic structured analysis without modifying files."""
from __future__ import annotations

import json
import urllib.request

MODEL = "qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive"
schema = {
    "type": "json_schema",
    "json_schema": {
        "name": "code_review",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "bug": {"type": "string"},
                "fix": {"type": "string"},
                "test": {"type": "string"},
            },
            "required": ["bug", "fix", "test"],
            "additionalProperties": False,
        },
    },
}
payload = {
    "model": MODEL,
    "messages": [{
        "role": "user",
        "content": "Analyze: function divide(a,b){return a/b}. Handle b=0.",
    }],
    "response_format": schema,
    "reasoning_effort": "none",
    "temperature": 0,
    "max_tokens": 192,
}
request = urllib.request.Request(
    "http://127.0.0.1:1234/v1/chat/completions",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(request, timeout=120) as response:
    body = json.load(response)
result = json.loads(body["choices"][0]["message"]["content"])
assert set(result) == {"bug", "fix", "test"}
print(json.dumps({"status": "PASS", "fields": sorted(result)}))
