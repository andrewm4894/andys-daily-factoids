"""REST API endpoints for factoid chat sessions."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from django.conf import settings
from django.http import Http404
from django.urls import path
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.chat import models as chat_models
from apps.chat.services import (
    build_system_prompt,
    history_to_messages,
    run_factoid_agent,
    serialise_message,
)
from apps.chat.services.payments import create_chat_checkout_session
from apps.core.services import RateLimitConfig, RateLimitExceeded, get_rate_limiter
from apps.factoids import models as factoid_models

app_name = "chat"


_rate_limiter = get_rate_limiter()
_rate_limit_config = RateLimitConfig(
    window_seconds=60,
    limit=int(getattr(settings, "FACTOID_CHAT_RATE_LIMIT_PER_MINUTE", 10)),
)


def _client_hash(request) -> str:
    raw = f"{request.META.get('REMOTE_ADDR', '')}:{request.META.get('HTTP_USER_AGENT', '')}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _rate_bucket(client_hash: str) -> str:
    return f"factoid_chat:{client_hash}"


def _rate_limit_snapshot(client_hash: str) -> dict[str, Any]:
    return {
        "per_minute": _rate_limit_config.limit,
        "current_window_requests": _rate_limiter.get_count(_rate_bucket(client_hash)),
    }


class ChatSessionCreateSerializer(serializers.Serializer):
    factoid_id = serializers.UUIDField()
    message = serializers.CharField(required=False, allow_blank=True)
    model_key = serializers.CharField(required=False, allow_blank=True)
    temperature = serializers.FloatField(required=False, min_value=0.0, max_value=2.0)
    posthog_distinct_id = serializers.CharField(required=False, allow_blank=True)
    posthog_properties = serializers.JSONField(required=False)

    def validate_posthog_properties(self, value: Any) -> dict[str, Any]:
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("posthog_properties must be an object")
        return value


class ChatMessageCreateSerializer(serializers.Serializer):
    message = serializers.CharField()
    posthog_properties = serializers.JSONField(required=False)

    def validate_posthog_properties(self, value: Any) -> dict[str, Any]:
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("posthog_properties must be an object")
        return value


class ChatSessionCreateView(APIView):
    """Create a new chat session and optionally send the first message."""

    def post(self, request, *args, **kwargs):
        serializer = ChatSessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            factoid = factoid_models.Factoid.objects.get(pk=serializer.validated_data["factoid_id"])
        except factoid_models.Factoid.DoesNotExist as exc:
            raise Http404("Factoid not found") from exc

        client_hash = _client_hash(request)
        message_text = serializer.validated_data.get("message") or ""
        distinct_id = serializer.validated_data.get("posthog_distinct_id") or client_hash
        posthog_properties = serializer.validated_data.get("posthog_properties") or {}
        model_key = serializer.validated_data.get("model_key") or None
        temperature = serializer.validated_data.get("temperature")

        if message_text:
            try:
                _rate_limiter.check(_rate_bucket(client_hash), _rate_limit_config)
            except RateLimitExceeded as exc:
                return _rate_limit_response(
                    exc, client_hash, factoid, distinct_id, posthog_properties
                )

        # Use the same model resolution logic as the agent
        from apps.chat.services.factoid_agent import _resolve_chat_model_key

        api_key = getattr(settings, "OPENROUTER_API_KEY", None)
        base_url = getattr(settings, "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

        resolved_model = _resolve_chat_model_key(
            model_key,
            api_key=api_key,
            base_url=base_url,
        )
        session = chat_models.ChatSession.objects.create(
            factoid=factoid,
            client_hash=client_hash,
            model_key=resolved_model,
            system_prompt=build_system_prompt(factoid),
            config={
                "posthog_distinct_id": distinct_id,
                "posthog_properties": posthog_properties,
                "temperature": temperature,
            },
        )

        if message_text:
            chat_models.ChatMessage.objects.create(
                session=session,
                role=chat_models.ChatMessageRole.USER,
                content={"text": message_text},
            )

            _run_agent_and_persist(
                session=session,
                factoid=factoid,
                distinct_id=distinct_id,
                posthog_properties=posthog_properties,
                model_key=resolved_model,
                temperature=temperature,
            )

        response_messages = _present_messages(session)
        return Response(
            {
                "session": _present_session(session),
                "messages": response_messages,
                "rate_limit": _rate_limit_snapshot(client_hash),
            },
            status=status.HTTP_201_CREATED,
        )


class ChatSessionDetailView(APIView):
    """Return existing chat session details and message history."""

    def get(self, request, session_id: str, *args, **kwargs):
        session = _get_session(session_id)
        client_hash = session.client_hash or _client_hash(request)
        return Response(
            {
                "session": _present_session(session),
                "messages": _present_messages(session),
                "rate_limit": _rate_limit_snapshot(client_hash),
            }
        )


class ChatMessageCreateView(APIView):
    """Append a new user message and stream the agent response."""

    def post(self, request, session_id: str, *args, **kwargs):
        session = _get_session(session_id)
        serializer = ChatMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        factoid = session.factoid
        if factoid is None:
            raise Http404("Chat session is not linked to a factoid")

        client_hash = session.client_hash or _client_hash(request)

        posthog_distinct_id = session.config.get("posthog_distinct_id") or client_hash

        try:
            _rate_limiter.check(_rate_bucket(client_hash), _rate_limit_config)
        except RateLimitExceeded as exc:
            return _rate_limit_response(
                exc,
                client_hash,
                factoid,
                posthog_distinct_id,
                serializer.validated_data.get("posthog_properties") or {},
            )

        chat_models.ChatMessage.objects.create(
            session=session,
            role=chat_models.ChatMessageRole.USER,
            content={"text": serializer.validated_data["message"]},
        )

        posthog_properties = _merge_properties(
            session.config.get("posthog_properties") or {},
            serializer.validated_data.get("posthog_properties") or {},
        )
        session.config["posthog_properties"] = posthog_properties
        session.save(update_fields=["config", "last_activity_at"])

        _run_agent_and_persist(
            session=session,
            factoid=factoid,
            distinct_id=posthog_distinct_id,
            posthog_properties=posthog_properties,
            model_key=session.model_key
            or getattr(settings, "FACTOID_AGENT_DEFAULT_MODEL", "openai/gpt-5-mini"),
            temperature=session.config.get("temperature"),
        )

        return Response(
            {
                "session": _present_session(session),
                "messages": _present_messages(session),
                "rate_limit": _rate_limit_snapshot(client_hash),
            }
        )


def _get_session(session_id: str) -> chat_models.ChatSession:
    try:
        return chat_models.ChatSession.objects.select_related("factoid").get(pk=session_id)
    except chat_models.ChatSession.DoesNotExist as exc:
        raise Http404("Chat session not found") from exc


def _run_agent_and_persist(
    *,
    session: chat_models.ChatSession,
    factoid: factoid_models.Factoid,
    distinct_id: str,
    posthog_properties: dict[str, Any],
    model_key: str | None,
    temperature: float | None,
) -> list[chat_models.ChatMessage]:
    history_query = session.messages.order_by("created_at")
    history = history_to_messages(history_query)
    previous_len = len(history)
    updated_messages = run_factoid_agent(
        factoid=factoid,
        session=session,
        history=history,
        model_key=model_key,
        temperature=temperature,
        distinct_id=distinct_id,
        posthog_properties=posthog_properties,
    )

    new_messages = updated_messages[previous_len:]
    saved: list[chat_models.ChatMessage] = []
    for message in new_messages:
        role, payload = serialise_message(message)
        metadata: dict[str, Any] = {}
        if role == chat_models.ChatMessageRole.ASSISTANT:
            metadata["model_key"] = model_key or session.model_key or ""

        chat_message = chat_models.ChatMessage.objects.create(
            session=session,
            role=role,
            content=payload,
            metadata=metadata,
        )
        saved.append(chat_message)

        if role == chat_models.ChatMessageRole.ASSISTANT:
            _persist_tool_calls(chat_message, payload)
        elif role == chat_models.ChatMessageRole.TOOL:
            _persist_tool_result(session, payload)

    return saved


def _persist_tool_calls(message: chat_models.ChatMessage, payload: dict[str, Any]) -> None:
    tool_calls = payload.get("tool_calls") if isinstance(payload, dict) else None
    if not isinstance(tool_calls, list) and isinstance(payload, dict):
        additional = payload.get("additional_kwargs")
        if isinstance(additional, dict):
            alt = additional.get("tool_calls")
            if isinstance(alt, list):
                tool_calls = alt
    if not isinstance(tool_calls, list):
        return

    for call in tool_calls:
        if not isinstance(call, dict):
            continue
        call_id = str(call.get("id") or call.get("call_id") or "")
        arguments = call.get("args") or call.get("arguments") or {}
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except json.JSONDecodeError:
                arguments = {"raw": arguments}

        tool_name = call.get("name")
        if not isinstance(tool_name, str) or not tool_name:
            function_block = call.get("function")
            if isinstance(function_block, dict):
                func_name = function_block.get("name")
                if isinstance(func_name, str):
                    tool_name = func_name
        if not isinstance(tool_name, str):
            tool_name = ""

        chat_models.ChatToolCall.objects.create(
            message=message,
            call_id=call_id,
            tool_name=tool_name,
            arguments=arguments,
        )


def _persist_tool_result(session: chat_models.ChatSession, payload: dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        return

    call_id = str(payload.get("tool_call_id") or "")

    content = payload.get("content")
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except json.JSONDecodeError:
            content = {"text": content}

    if call_id:
        chat_models.ChatToolCall.objects.filter(
            message__session=session,
            call_id=call_id,
        ).update(result=content)
        return

    # If we could not match by call_id (some providers omit it), update the
    # most recent tool call without a stored result.
    fallback_call = (
        chat_models.ChatToolCall.objects.filter(
            message__session=session,
            result__isnull=True,
        )
        .order_by("-created_at")
        .first()
    )
    if fallback_call is not None:  # pragma: no cover - fallback
        fallback_call.result = content
        fallback_call.save(update_fields=["result"])


def _present_session(session: chat_models.ChatSession) -> dict[str, Any]:
    return {
        "id": str(session.id),
        "status": session.status,
        "model_key": session.model_key,
        "factoid_id": str(session.factoid_id) if session.factoid_id else None,
        "created_at": session.created_at.isoformat(),
        "last_activity_at": session.last_activity_at.isoformat()
        if session.last_activity_at
        else None,
    }


def _present_messages(session: chat_models.ChatSession) -> list[dict[str, Any]]:
    messages = []
    for message in session.messages.order_by("created_at").prefetch_related("tool_calls"):
        item = {
            "id": message.id,
            "role": message.role,
            "content": message.content,
            "created_at": message.created_at.isoformat(),
        }
        if message.metadata:
            item["metadata"] = message.metadata
        if message.role == chat_models.ChatMessageRole.ASSISTANT:
            item["tool_calls"] = [
                {
                    "id": tool.call_id,
                    "tool_name": tool.tool_name,
                    "arguments": tool.arguments,
                    "result": tool.result,
                }
                for tool in message.tool_calls.all()
            ]
        messages.append(item)
    return messages


def _rate_limit_response(
    exc: RateLimitExceeded,
    client_hash: str,
    factoid: factoid_models.Factoid,
    distinct_id: str,
    posthog_properties: dict[str, Any],
):
    checkout = create_chat_checkout_session(
        client_hash=client_hash,
        factoid_id=str(factoid.id),
        metadata={
            "posthog_distinct_id": distinct_id,
            "posthog_properties": json.dumps(posthog_properties) if posthog_properties else None,
        },
    )
    payload = {
        "detail": "Chat rate limit exceeded",
        "code": "rate_limit",
        "retry_after": exc.retry_after,
        "rate_limit": _rate_limit_snapshot(client_hash),
    }
    if checkout:
        payload["checkout_session"] = checkout
    return Response(payload, status=status.HTTP_429_TOO_MANY_REQUESTS)


def _merge_properties(base: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base or {})
    merged.update(dict(extra or {}))
    return merged


urlpatterns = [
    path("sessions/", ChatSessionCreateView.as_view(), name="session-create"),
    path("sessions/<uuid:session_id>/", ChatSessionDetailView.as_view(), name="session-detail"),
    path(
        "sessions/<uuid:session_id>/messages/",
        ChatMessageCreateView.as_view(),
        name="session-message-create",
    ),
]
