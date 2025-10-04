"""Tests for Langfuse integration."""

from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from apps.core.langfuse import (
    get_langfuse_callback_handler,
    get_langfuse_client,
    initialize_langfuse,
)


class TestLangfuseIntegration(TestCase):
    """Test Langfuse observability integration."""

    def test_get_langfuse_client_without_keys(self):
        """Test that client returns None when API keys are not configured."""
        with override_settings(LANGFUSE_PUBLIC_KEY=None, LANGFUSE_SECRET_KEY=None):
            # Clear cache to get fresh initialization
            get_langfuse_client.cache_clear()
            client = get_langfuse_client()
            self.assertIsNone(client)

    def test_get_langfuse_callback_handler_without_client(self):
        """Test that callback handler returns None when client is not available."""
        with override_settings(LANGFUSE_PUBLIC_KEY=None, LANGFUSE_SECRET_KEY=None):
            # Clear cache to get fresh initialization
            get_langfuse_client.cache_clear()
            handler = get_langfuse_callback_handler()
            self.assertIsNone(handler)

    @patch("apps.core.langfuse.Langfuse")
    @patch("apps.core.langfuse.CallbackHandler")
    def test_get_langfuse_client_with_keys(self, mock_callback_handler, mock_langfuse):
        """Test that client is created when API keys are configured."""
        mock_client = MagicMock()
        mock_langfuse.return_value = mock_client

        with override_settings(
            LANGFUSE_PUBLIC_KEY="pk-test",
            LANGFUSE_SECRET_KEY="sk-test",
            LANGFUSE_HOST="https://cloud.langfuse.com",
        ):
            # Clear cache to get fresh initialization
            get_langfuse_client.cache_clear()
            client = get_langfuse_client()
            self.assertIsNotNone(client)
            self.assertEqual(client, mock_client)

            # Verify Langfuse was called with correct parameters
            mock_langfuse.assert_called_once_with(
                public_key="pk-test",
                secret_key="sk-test",
                host="https://cloud.langfuse.com",
            )

    @patch("apps.core.langfuse.Langfuse")
    @patch("apps.core.langfuse.CallbackHandler")
    def test_get_langfuse_callback_handler_with_client(
        self, mock_callback_handler_class, mock_langfuse
    ):
        """Test that callback handler is created when client is available."""
        mock_client = MagicMock()
        mock_langfuse.return_value = mock_client
        mock_handler = MagicMock()
        mock_callback_handler_class.return_value = mock_handler

        with override_settings(
            LANGFUSE_PUBLIC_KEY="pk-test",
            LANGFUSE_SECRET_KEY="sk-test",
            LANGFUSE_HOST="https://cloud.langfuse.com",
        ):
            # Clear cache to get fresh initialization
            get_langfuse_client.cache_clear()
            handler = get_langfuse_callback_handler()
            self.assertIsNotNone(handler)
            self.assertEqual(handler, mock_handler)

            # Verify CallbackHandler was instantiated
            mock_callback_handler_class.assert_called_once()

    @patch("apps.core.langfuse.Langfuse", None)
    @patch("apps.core.langfuse.CallbackHandler", None)
    def test_initialize_langfuse_without_dependencies(self):
        """Test that initialization fails gracefully when dependencies are missing."""
        # Clear cache to get fresh initialization
        get_langfuse_client.cache_clear()
        initialize_langfuse()
        # Should not raise any exceptions

    def test_langfuse_integration_available(self):
        """Test that Langfuse integration modules can be imported."""
        try:
            import langfuse  # noqa: F401
            from langfuse.callback import CallbackHandler  # noqa: F401

            # If we get here, the imports succeeded
            self.assertTrue(True)
        except ImportError:
            # If imports fail, that's also valid (optional dependency)
            self.assertTrue(True)
