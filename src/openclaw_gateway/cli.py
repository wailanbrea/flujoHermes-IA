from __future__ import annotations

import argparse
import json
from pathlib import Path

from .service import validate_config


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="openclaw-adapter-config")
    root.add_argument("--config", required=True, type=Path)
    return root


def main() -> int:
    args = parser().parse_args()
    value = json.loads(args.config.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("OpenClaw adapter config must be a JSON object")
    print(json.dumps(validate_config(value), ensure_ascii=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())