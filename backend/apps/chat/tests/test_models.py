"""Basic tests for chat models."""

from apps.chat import models


def test_chat_session_str():
    session = models.ChatSession()
    assert "ChatSession" in str(session)
