from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from .contracts import ExecutionRequest
from .service import ExecutionGateway, validate_config


def _read_json(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="execution-gateway")
    commands = root.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate-config")
    validate.add_argument("--config", required=True, type=Path)
    check = commands.add_parser("policy-check")
    check.add_argument("--config", required=True, type=Path)
    check.add_argument("--input", type=Path)
    return root


def main() -> int:
    args = parser().parse_args()
    config = _read_json(args.config)
    if args.command == "validate-config":
        result = validate_config(config)
    else:
        raw = args.input.read_text(encoding="utf-8") if args.input else sys.stdin.read()
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError("execution request must be a JSON object")
        request = ExecutionRequest.from_mapping(value)
        result = ExecutionGateway(config).policy_check(request).as_dict()
    print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
