"""Cost guard helpers to prevent runaway LLM spend."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CostGuardDecision:
    allowed: bool
    reason: str
    remaining_budget: float | None


class CostGuard:
    """Track spend per profile and determine if a request should be allowed."""

    def __init__(self, profile_budgets: dict[str, float]) -> None:
        self.profile_budgets = profile_budgets
        self.profile_usage: dict[str, float] = {profile: 0.0 for profile in profile_budgets}

    def _get_budget(self, profile: str) -> float | None:
        return self.profile_budgets.get(profile)

    def evaluate(self, profile: str, expected_cost: float) -> CostGuardDecision:
        budget = self._get_budget(profile)
        used = self.profile_usage.get(profile, 0.0)

        if budget is None:
            return CostGuardDecision(True, "no-budget", None)

        remaining = budget - used
        if expected_cost > remaining:
            return CostGuardDecision(False, "budget-exceeded", max(remaining, 0.0))

        return CostGuardDecision(True, "allowed", remaining - expected_cost)

    def record(self, profile: str, actual_cost: float) -> None:
        if profile not in self.profile_usage:
            self.profile_usage[profile] = 0.0
        self.profile_usage[profile] += actual_cost
