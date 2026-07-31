from __future__ import annotations

import re
from typing import Any, Iterable

from execution_gateway.contracts import ExecutionCapability, RiskClass

from .contracts import RouteDecision


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


def _least_privilege_context(
    config: dict[str, Any],
    route: dict[str, Any],
    mode: dict[str, Any],
    profile_config: dict[str, Any],
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    available_tools = set(mode["toolsets"])
    requested_tools = route.get("requiredToolsets")
    if requested_tools is None:
        requested_tools = list(mode["toolsets"])
    if not isinstance(requested_tools, list) or not requested_tools:
        raise ValueError("route must select at least one required toolset")
    unknown_tools = set(requested_tools).difference(available_tools)
    if unknown_tools:
        raise ValueError(
            "route requests tools unavailable to its profile: "
            + ", ".join(sorted(unknown_tools))
        )

    available_skills = config["skills"]["roleSets"][profile_config["skillSet"]]
    requested_skills = route.get("requiredSkills")
    maximum = int(config["skills"]["selectionPolicy"]["maxBodiesPerTask"])
    if requested_skills is None:
        requested_skills = available_skills[:maximum]
    if not isinstance(requested_skills, list) or not requested_skills:
        raise ValueError("route must select at least one skill")
    unknown_skills = set(requested_skills).difference(available_skills)
    if unknown_skills:
        raise ValueError(
            "route requests skills unavailable to its profile: "
            + ", ".join(sorted(unknown_skills))
        )
    if len(requested_skills) > maximum:
        raise ValueError("route selects more skills than the configured maximum")
    return tuple(requested_tools), tuple(requested_skills)


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
    toolsets, skills = _least_privilege_context(config, route, mode, profile_config)

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
        toolsets=toolsets,
        skills=skills,
        reason=reason,
        manual_model=bool(manual_model),
        risk_class=RiskClass(str(route.get("riskClass", "low"))),
        execution_capability=ExecutionCapability(
            str(route.get("executionCapability", "sandbox-code"))
        ),
        approval_requirement=str(route.get("approvalRequirement", "none")),
    )
