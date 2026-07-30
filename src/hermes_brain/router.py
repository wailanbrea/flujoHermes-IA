from __future__ import annotations

from dataclasses import asdict, dataclass
import re
from typing import Any, Iterable


@dataclass(frozen=True)
class RouteDecision:
    capability: str
    executor: str
    fallback: str
    profile: str
    model: str | None
    toolsets: list[str]
    skills: list[str]
    reason: str
    manual_model: bool

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _normalized_signals(values: Iterable[str]) -> set[str]:
    signals: set[str] = set()
    for value in values:
        separated = re.sub(
            r"(?<=[a-z0-9])(?=[A-Z])",
            " ",
            str(value).strip().replace("\\", "/"),
        )
        normalized = separated.lower()
        if not normalized:
            continue
        signals.add(normalized)
        signals.update(re.findall(r"[a-z0-9]+", normalized))
    return signals


def _programming_profile(config: dict[str, Any], signals: set[str]) -> tuple[str, str]:
    stack_profiles = config["modelRouter"]["stackProfiles"]
    ordered_matches = (
        ("mcp", {"mcp", "fastmcp", "model-context-protocol"}),
        ("android", {"android", "kotlin", "gradle", "gradle.kts", "kt", "kts"}),
        ("laravel", {"laravel", "artisan", "composer", "php"}),
        ("frontend", {"react", "typescript", "tsx", "vite", "next", "frontend"}),
    )
    for stack, markers in ordered_matches:
        if signals.intersection(markers):
            return str(stack_profiles[stack]), f"stack:{stack}"
    return str(stack_profiles["default"]), "stack:default"


def route_task(
    config: dict[str, Any],
    *,
    capability: str,
    project_signals: Iterable[str] = (),
    manual_model: str | None = None,
    manual_model_authorized: bool = False,
) -> RouteDecision:
    routes = {
        str(route["capability"]): route
        for route in config["modelRouter"]["routes"]
    }
    route = routes.get(capability)
    if route is None:
        raise ValueError(f"unsupported capability: {capability}")

    profile = str(route["profile"])
    reason = f"capability:{capability}"
    if profile == "auto":
        profile, stack_reason = _programming_profile(
            config,
            _normalized_signals(project_signals),
        )
        reason = f"{reason};{stack_reason}"

    profiles = {
        str(profile_config["runtimeId"]): profile_config
        for profile_config in config["profiles"]
    }
    profile_config = profiles.get(profile)
    if profile_config is None:
        raise ValueError(f"route selects an unknown profile: {profile}")
    mode = config["profileModes"][profile_config["mode"]]
    skills = config["skills"]["roleSets"][profile_config["skillSet"]]

    executor = str(route["executor"])
    model: str | None = config["modelRouter"]["localModel"]
    if executor in {"deterministic-scripts", "evidence-gate"}:
        model = None
    if manual_model:
        manual_models = set(config["modelRouter"]["manualOnlyModels"])
        if manual_model not in manual_models:
            raise ValueError("manual model is not on the configured allow-list")
        if not manual_model_authorized:
            raise ValueError("manual model selection requires explicit authorization")
        if model is None:
            raise ValueError("this capability does not execute through an inference model")
        model = manual_model
        reason = f"{reason};manual-model"

    return RouteDecision(
        capability=capability,
        executor=executor,
        fallback=str(route["fallback"]),
        profile=profile,
        model=model,
        toolsets=list(mode["toolsets"]),
        skills=list(skills),
        reason=reason,
        manual_model=bool(manual_model),
    )
