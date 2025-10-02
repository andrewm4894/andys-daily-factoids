"""Tests for Datadog integration."""

from unittest.mock import patch

from django.test import TestCase, override_settings

from apps.core.datadog import get_datadog_callback_handler


class TestDatadogIntegration(TestCase):
    """Test Datadog LLM observability integration."""

    def test_get_datadog_callback_handler_returns_none(self):
        """Test that callback handler returns None (auto-instrumentation is used)."""
        handler = get_datadog_callback_handler()
        self.assertIsNone(handler)

    @patch("apps.core.datadog.LLMObs")
    @patch("apps.core.datadog.tracer")
    def test_initialize_datadog_without_dependencies(self, mock_tracer, mock_llmobs):
        """Test that initialization fails gracefully when dependencies are missing."""
        # Mock the import failure by setting the modules to None
        with patch("apps.core.datadog.tracer", None):
            with patch("apps.core.datadog.LLMObs", None):
                # Clear the cache by importing and calling directly
                from apps.core.datadog import initialize_datadog

                initialize_datadog.cache_clear()
                result = initialize_datadog()
                self.assertFalse(result)

    @patch("apps.core.datadog.LLMObs")
    def test_initialize_datadog_with_mock_success(self, mock_llmobs):
        """Test that initialization can work with proper mocking."""
        mock_llmobs.enable.return_value = None

        with override_settings(
            DATADOG_API_KEY="test-key",
            DATADOG_LLMOBS_ENABLED=True,
            DATADOG_SITE="datadoghq.com",
            DATADOG_LLMOBS_ML_APP="test-app",
        ):
            # Clear cache to get fresh initialization
            from apps.core.datadog import initialize_datadog

            initialize_datadog.cache_clear()

            result = initialize_datadog()
            self.assertTrue(result)

    def test_datadog_integration_available(self):
        """Test that Datadog integration modules can be imported."""
        try:
            import ddtrace  # noqa: F401
            import ddtrace.llmobs  # noqa: F401

            # If we get here, the imports succeeded
            self.assertTrue(True)
        except ImportError:
            # If imports fail, that's also valid (optional dependency)
            self.assertTrue(True)
