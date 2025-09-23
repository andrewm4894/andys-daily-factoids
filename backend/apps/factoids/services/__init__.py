"""Services package for factoid domain."""

from .generator import (
    CostBudgetExceededError,
    GenerationFailedError,
    RateLimitExceededError,
    generate_factoid,
)
from .openrouter import (
    DEFAULT_FACTOID_MODEL,
    DEFAULT_OPENROUTER_BASE_URL,
    GenerationResult,
    fetch_openrouter_models,
    generate_factoid_completion,
)

__all__ = [
    "CostBudgetExceededError",
    "GenerationFailedError",
    "RateLimitExceededError",
    "generate_factoid",
    "DEFAULT_FACTOID_MODEL",
    "DEFAULT_OPENROUTER_BASE_URL",
    "GenerationResult",
    "fetch_openrouter_models",
    "generate_factoid_completion",
]
