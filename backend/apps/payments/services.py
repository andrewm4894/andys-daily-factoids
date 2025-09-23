"""Payment orchestration services (Stripe integration)."""

from typing import Any


class PaymentGateway:
    """Placeholder payment service; real implementation arrives in later phases."""

    def create_checkout_session(
        self,
        *,
        amount: int,
        currency: str,
        metadata: dict[str, Any],
    ) -> str:
        raise NotImplementedError
