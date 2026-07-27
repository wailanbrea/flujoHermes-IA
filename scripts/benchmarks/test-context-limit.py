"""Validates local model context configuration and policy thresholds."""
from __future__ import annotations

import json
import urllib.request

with urllib.request.urlopen(
    "http://127.0.0.1:1234/api/v1/models", timeout=10
) as response:
    models = json.load(response)["models"]
instances = [
    instance
    for model in models
    for instance in model.get("loaded_instances", [])
]
assert instances, "No model is loaded"
instance = instances[0]
context = int(instance["config"]["context_length"])
assert context >= 65536, f"Context too small: {context}"
thresholds = {
    "warning75": int(context * 0.75),
    "compact80": int(context * 0.80),
    "handoff90": int(context * 0.90),
}
assert thresholds["warning75"] < thresholds["compact80"] < thresholds["handoff90"]
print(json.dumps({"status": "PASS", "context": context, **thresholds}))
