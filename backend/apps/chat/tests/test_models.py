"""Basic tests for chat models."""

from apps.chat import models


def test_chat_session_defaults():
    session = models.ChatSession(model_key="test-model")
    assert session.status == models.ChatSessionStatus.ACTIVE
    assert "ChatSession" in str(session)


def test_chat_message_string_representation():
    session = models.ChatSession(model_key="test-model")
    message = models.ChatMessage(session=session, role=models.ChatMessageRole.ASSISTANT, content={})
    assert "ChatMessage" in str(message)
