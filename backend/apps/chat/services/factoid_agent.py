"""LangGraph-powered agent for factoid conversations."""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass
from typing import Annotated, Any, Iterable, Sequence, TypedDict

from django.conf import settings
from langchain_core.callbacks import CallbackManagerForToolRun
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import AnyMessage, add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from posthog import Posthog
from posthog.ai.langchain import CallbackHandler
from pydantic import BaseModel, Field

from apps.chat import models as chat_models
from apps.core.braintrust import (
    get_braintrust_callback_handler,
    initialize_braintrust,
    log_operation_metadata,
)
from apps.core.datadog import get_datadog_callback_handler, initialize_datadog
from apps.core.langfuse import get_langfuse_callback_handler, initialize_langfuse
from apps.core.langsmith import get_langsmith_callback_handler, initialize_langsmith
from apps.core.posthog import get_posthog_client
from apps.factoids.models import Factoid
from apps.factoids.services.openrouter import fetch_openrouter_models, model_supports_tools

try:
    from langchain_tavily import TavilySearch
except ImportError:  # pragma: no cover - optional dependency
    TavilySearch = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


class DebugPostHogCallback(CallbackHandler):
    """Debug wrapper around PostHog callback to log when methods are called."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        logger.info("DebugPostHogCallback initialized")

    def on_llm_start(self, *args, **kwargs):
        logger.info("DebugPostHogCallback.on_llm_start called")
        try:
            result = super().on_llm_start(*args, **kwargs)
            logger.info("PostHog on_llm_start completed successfully")
            return result
        except Exception as e:
            logger.error(f"PostHog on_llm_start failed: {e}")
            raise

    def on_llm_end(self, *args, **kwargs):
        logger.info("DebugPostHogCallback.on_llm_end called")
        try:
            result = super().on_llm_end(*args, **kwargs)
            logger.info("PostHog on_llm_end completed successfully")
            return result
        except Exception as e:
            logger.error(f"PostHog on_llm_end failed: {e}")
            raise

    def on_chain_start(self, *args, **kwargs):
        logger.info("DebugPostHogCallback.on_chain_start called")
        try:
            result = super().on_chain_start(*args, **kwargs)
            logger.info("PostHog on_chain_start completed successfully")
            return result
        except Exception as e:
            logger.error(f"PostHog on_chain_start failed: {e}")
            raise

    def on_chain_end(self, *args, **kwargs):
        logger.info("DebugPostHogCallback.on_chain_end called")
        try:
            result = super().on_chain_end(*args, **kwargs)
            logger.info("PostHog on_chain_end completed successfully")
            # Log PostHog client queue status after important events
            if hasattr(self, "_client") and self._client:
                queue_size = getattr(self._client.queue, "qsize", lambda: "unknown")()
                logger.info(f"PostHog client queue size after chain_end: {queue_size}")
            return result
        except Exception as e:
            logger.error(f"PostHog on_chain_end failed: {e}")
            raise

    def on_tool_start(self, *args, **kwargs):
        logger.info("DebugPostHogCallback.on_tool_start called")
        try:
            result = super().on_tool_start(*args, **kwargs)
            logger.info("PostHog on_tool_start completed successfully")
            return result
        except Exception as e:
            logger.error(f"PostHog on_tool_start failed: {e}")
            raise

    def on_tool_end(self, *args, **kwargs):
        logger.info("DebugPostHogCallback.on_tool_end called")
        try:
            result = super().on_tool_end(*args, **kwargs)
            logger.info("PostHog on_tool_end completed successfully")
            return result
        except Exception as e:
            logger.error(f"PostHog on_tool_end failed: {e}")
            raise


class AgentState(TypedDict):
    """State container for the LangGraph agent."""

    messages: Annotated[list[AnyMessage], add_messages]


class SearchInput(BaseModel):
    """Input schema for the Tavily-backed search tool."""

    query: str | None = Field(
        default=None,
        description="Override the default search query (defaults to the factoid subject/text).",
    )
    max_results: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Maximum Tavily search results to return.",
    )


class WebSearchTool(BaseTool):
    """Retrieve supporting references via Tavily."""

    name: str = "web_search"
    description: str = (
        "Look up the factoid on the open web when you need citations, external"
        " context, or to verify new details."
    )
    args_schema: type[BaseModel] = SearchInput

    def __init__(
        self,
        *,
        factoid: Factoid,
        tavily_api_key: str | None,
        max_results: int,
    ) -> None:
        super().__init__()
        self._factoid = factoid
        self._max_results = max_results
        self._tavily_api_key = tavily_api_key
        self._available = TavilySearch is not None and bool(tavily_api_key)

    def _run(  # type: ignore[override]
        self,
        query: str | None = None,
        max_results: int = 5,
        run_manager: CallbackManagerForToolRun | None = None,
    ) -> dict[str, Any]:
        if not self._available:
            return {
                "error": "search_unavailable",
                "detail": "Tavily search is not configured",
                "query": None,
                "results": [],
            }

        actual_query = (query or self._factoid.subject or self._factoid.text or "").strip()
        if not actual_query:
            return {
                "warning": "No query provided and factoid has no subject/text",
                "query": actual_query,
                "results": [],
            }

        requested = min(max_results or self._max_results, self._max_results)
        try:
            if TavilySearch is None:  # pragma: no cover - defensive
                raise RuntimeError("TavilySearch is unavailable")
            tool = TavilySearch(
                max_results=requested,
                tavily_api_key=self._tavily_api_key,
            )
            payload = tool.invoke({"query": actual_query})
        except Exception as exc:  # pragma: no cover - network/runtime failure
            logger.warning("Tavily search failed: %s", exc)
            return {
                "query": actual_query,
                "error": "search_failed",
                "detail": str(exc),
                "results": [],
            }

        results = _normalise_search_results(payload, requested)
        return {
            "query": actual_query,
            "results": results,
            "source": "tavily",
        }


def _build_search_tool(
    *,
    factoid: Factoid,
    tavily_api_key: str | None,
    max_results: int,
) -> BaseTool | None:
    if TavilySearch is None:
        return WebSearchTool(
            factoid=factoid,
            tavily_api_key=None,
            max_results=max_results,
        )

    return WebSearchTool(
        factoid=factoid,
        tavily_api_key=tavily_api_key,
        max_results=max_results,
    )


@dataclass
class FactoidAgentConfig:
    """Runtime configuration for the factoid agent."""

    model_key: str
    temperature: float
    distinct_id: str
    trace_id: str
    posthog_properties: dict[str, Any] | None


class FactoidAgent:
    """Thin wrapper around a LangGraph agent for factoid conversations."""

    def __init__(
        self,
        *,
        factoid: Factoid,
        config: FactoidAgentConfig,
        posthog_client: Posthog | None,
    ) -> None:
        self._factoid = factoid
        self._config = config
        self._posthog_client = posthog_client
        api_key = getattr(settings, "OPENROUTER_API_KEY", None)
        base_url = getattr(settings, "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

        self._model = ChatOpenAI(
            api_key=api_key,
            base_url=base_url.rstrip("/"),
            model=config.model_key,
            temperature=config.temperature,
        )
        self._system_message = SystemMessage(content=build_system_prompt(factoid))

        search_tool = _build_search_tool(
            factoid=factoid,
            tavily_api_key=getattr(settings, "TAVILY_API_KEY", None),
            max_results=5,
        )

        tools: list[BaseTool] = []
        if search_tool:
            tools.append(search_tool)

        if tools:
            self._model = self._model.bind_tools(tools, tool_choice="auto")

        self._tool_node = ToolNode(tools)
        self._graph = self._build_graph()

    def _build_graph(self):
        graph = StateGraph(AgentState)
        graph.add_node("agent", self._call_model)
        graph.add_node("tools", self._tool_node)
        graph.add_edge("tools", "agent")
        graph.add_conditional_edges(
            "agent",
            tools_condition,
            {"tools": "tools", END: END},
        )
        graph.set_entry_point("agent")
        return graph.compile()

    def _call_model(self, state: AgentState, config: RunnableConfig) -> AgentState:
        callbacks = (
            config.get("callbacks")
            if isinstance(config, dict)
            else getattr(config, "callbacks", None)
        )
        invoke_config: dict[str, Any] = {"run_name": "factoid_chat"}
        if callbacks:
            invoke_config["callbacks"] = callbacks

        invoke_config.setdefault("tool_choice", "auto")

        messages = [self._system_message, *state.get("messages", [])]
        response = self._model.invoke(messages, config=invoke_config)
        return {"messages": [response]}

    def run(
        self,
        history: Sequence[BaseMessage],
        *,
        callbacks: Sequence[CallbackHandler] | None,
    ) -> list[BaseMessage]:
        invoke_config: dict[str, Any] = {
            "configurable": {"recursion_limit": 6},
            "run_name": "factoid_chat",
        }
        if callbacks:
            invoke_config["callbacks"] = list(callbacks)

        result = self._graph.invoke(
            {"messages": list(history)},
            config=invoke_config,
        )
        return result["messages"]


def _random_tool_supporting_model(*, api_key: str, base_url: str) -> str | None:
    """Select a random model that supports tools for the chat agent."""
    try:
        models_payload = fetch_openrouter_models(api_key=api_key, base_url=base_url)
    except Exception:  # pragma: no cover - network/introspection failure
        return None

    # Filter for models that support tools and prefer paid/stable models
    tool_candidates = []
    preferred_candidates = []

    for item in models_payload:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        if not isinstance(model_id, str):
            continue

        # Check if this model supports tools
        if model_supports_tools(model_id, api_key=api_key, base_url=base_url):
            tool_candidates.append(model_id)

            # Prefer non-free models and well-known providers to avoid rate limits
            if not model_id.endswith(":free") and any(
                provider in model_id
                for provider in ["openai/", "anthropic/", "google/", "mistralai/"]
            ):
                preferred_candidates.append(model_id)

    # Use preferred models if available, otherwise fall back to all tool-supporting models
    candidates = preferred_candidates if preferred_candidates else tool_candidates

    if not candidates:
        return None

    return random.choice(candidates)


def _resolve_chat_model_key(
    preferred_model: str | None,
    *,
    api_key: str,
    base_url: str,
) -> str:
    """Resolve the model key for chat agent, with random tool-supporting fallback."""
    if preferred_model:
        return preferred_model

    # Try to get a random tool-supporting model
    random_model = _random_tool_supporting_model(api_key=api_key, base_url=base_url)
    if random_model:
        return random_model

    # Fallback to default model
    return getattr(settings, "FACTOID_AGENT_DEFAULT_MODEL", "openai/gpt-4o-mini")


def _get_fallback_model() -> str:
    """Get a reliable fallback model when the selected model fails."""
    # Use a known stable model that supports tools
    return "openai/gpt-4o-mini"


def run_factoid_agent(
    *,
    factoid: Factoid,
    session: chat_models.ChatSession,
    history: Sequence[BaseMessage],
    model_key: str | None,
    temperature: float | None,
    distinct_id: str,
    posthog_properties: dict[str, Any] | None,
) -> list[BaseMessage]:
    """Execute the factoid agent and return the updated message list."""

    api_key = getattr(settings, "OPENROUTER_API_KEY", None)
    base_url = getattr(settings, "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

    resolved_model = _resolve_chat_model_key(
        model_key,
        api_key=api_key,
        base_url=base_url,
    )
    resolved_temperature = temperature if temperature is not None else 0.7

    posthog_client = get_posthog_client()
    trace_id = str(session.id)
    callbacks = _build_callbacks(
        client=posthog_client,
        distinct_id=distinct_id,
        trace_id=trace_id,
        factoid=factoid,
        extra_properties=_merge_properties(posthog_properties, {"factoid_id": str(factoid.id)}),
    )

    # Try with the selected model first
    try:
        agent = FactoidAgent(
            factoid=factoid,
            config=FactoidAgentConfig(
                model_key=resolved_model,
                temperature=resolved_temperature,
                distinct_id=distinct_id,
                trace_id=trace_id,
                posthog_properties=_merge_properties(
                    posthog_properties, {"factoid_id": str(factoid.id)}
                ),
            ),
            posthog_client=posthog_client,
        )
        return agent.run(history, callbacks=callbacks)
    except Exception as exc:
        # Check if it's a rate limit or model-specific error
        error_msg = str(exc).lower()
        if any(keyword in error_msg for keyword in ["rate limit", "429", "temporarily", "quota"]):
            # Try with a fallback model
            fallback_model = _get_fallback_model()
            if fallback_model != resolved_model:
                try:
                    fallback_agent = FactoidAgent(
                        factoid=factoid,
                        config=FactoidAgentConfig(
                            model_key=fallback_model,
                            temperature=resolved_temperature,
                            distinct_id=distinct_id,
                            trace_id=trace_id,
                            posthog_properties=_merge_properties(
                                posthog_properties, {"factoid_id": str(factoid.id)}
                            ),
                        ),
                        posthog_client=posthog_client,
                    )
                    return fallback_agent.run(history, callbacks=callbacks)
                except Exception:
                    # If fallback also fails, re-raise the original exception
                    pass
        # Re-raise the original exception if we can't handle it
        raise exc


def history_to_messages(history: Iterable[chat_models.ChatMessage]) -> list[BaseMessage]:
    """Convert stored chat messages into LangChain message objects."""

    messages: list[BaseMessage] = []
    for item in history:
        message = _chat_message_to_langchain(item)
        if message is not None:
            messages.append(message)
    return messages


def serialise_message(message: BaseMessage) -> tuple[str, dict[str, Any]]:
    """Convert a LangChain message to a ChatMessage role and payload."""

    if isinstance(message, HumanMessage):
        payload = _normalise_human_content(message.content)
        return chat_models.ChatMessageRole.USER, {"text": payload}

    if isinstance(message, AIMessage):
        payload: dict[str, Any] = {
            "content": message.content,
        }
        if message.additional_kwargs:
            payload["additional_kwargs"] = message.additional_kwargs
        if message.tool_calls:
            payload["tool_calls"] = message.tool_calls
        return chat_models.ChatMessageRole.ASSISTANT, payload

    if isinstance(message, ToolMessage):
        payload = {
            "content": message.content,
            "tool_call_id": message.tool_call_id,
        }
        return chat_models.ChatMessageRole.TOOL, payload

    logger.debug("Unsupported message type encountered: %s", type(message))
    return chat_models.ChatMessageRole.ASSISTANT, {"content": str(message.content)}


def _chat_message_to_langchain(message: chat_models.ChatMessage) -> BaseMessage | None:
    payload = message.content or {}

    if message.role == chat_models.ChatMessageRole.USER:
        text = _extract_text(payload)
        return HumanMessage(content=text)

    if message.role == chat_models.ChatMessageRole.ASSISTANT:
        content = payload.get("content") if isinstance(payload, dict) else payload
        additional_kwargs = payload.get("additional_kwargs") if isinstance(payload, dict) else {}
        raw_tool_calls = payload.get("tool_calls") if isinstance(payload, dict) else None
        if isinstance(raw_tool_calls, list):
            tool_calls = raw_tool_calls
        else:
            tool_calls = []
        return AIMessage(
            content=content,
            additional_kwargs=additional_kwargs or {},
            tool_calls=tool_calls,
        )

    if message.role == chat_models.ChatMessageRole.TOOL:
        if not isinstance(payload, dict):
            return ToolMessage(content=str(payload), tool_call_id="")
        return ToolMessage(
            content=payload.get("content", ""),
            tool_call_id=str(payload.get("tool_call_id", "")),
        )

    return None


def build_system_prompt(factoid: Factoid) -> str:
    subject = factoid.subject or "Unknown subject"
    emoji = factoid.emoji or "✨"
    return (
        "You are the Andy's Daily Factoids companion agent. Provide helpful,"
        " accurate, and curious insights about the featured factoid."
        "\n\n"
        "Factoid subject: {subject}\n"
        "Factoid emoji: {emoji}\n"
        "Factoid text: {text}\n\n"
        "Available tools:\n"
        "1. web_search(query: string | None, max_results: int) -> dict\n"
        "   - Use when you need external references, verification, or current context"
        " about the factoid.\n"
        "   - Always pass a clear query; default to the factoid subject/text if the"
        " user does not specify.\n"
        '   - Return value includes {{"query": ... , "results": [...]}}'
        " that you can cite or summarise.\n"
        "   - Call this tool whenever the user explicitly asks for sources or verification.\n"
        "     Perform the search before drafting your final answer.\n\n"
        "Guidelines:\n"
        "- Ground answers in the factoid and reputable sources.\n"
        "- Use web_search to locate citations, links, or when you need to double-check facts.\n"
        "- If you promise to search, call web_search through the tool interface.\n"
        "  Never describe the call in plain text—execute it so the tool returns results.\n"
        "- IMPORTANT: Use web_search efficiently - make one comprehensive search instead of\n"
        "  multiple separate calls. Combine related queries into a single search when possible.\n"
        "- CRITICAL: NEVER include raw JSON data, search results, or tool output in your\n"
        "  response. Tool results appear separately in the UI. Only provide natural\n"
        "  conversation, analysis, and summaries based on the results.\n"
        "- FORBIDDEN: Do not copy-paste or quote the JSON response from web_search.\n"
        "  The tool results are shown separately to users.\n"
        "- Include disclaimers when information is uncertain or speculative.\n"
        "- Keep tone friendly, concise, and curious."
    ).format(subject=subject, emoji=emoji, text=factoid.text)


def _normalise_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text:
                    parts.append(str(text))
        return "\n".join(parts)
    return str(content)


def _merge_properties(
    base: dict[str, Any] | None,
    extra: dict[str, Any] | None,
) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    if isinstance(base, dict):
        merged.update(base)
    if isinstance(extra, dict):
        merged.update(extra)
    return merged


def _build_callbacks(
    *,
    client: Posthog | None,
    distinct_id: str,
    trace_id: str,
    factoid: Factoid,
    extra_properties: dict[str, Any] | None,
) -> list[Any]:
    callbacks = []

    # PostHog callback
    logger.info(f"PostHog client status: {client is not None}")
    if client:
        logger.info(f"PostHog client disabled: {getattr(client, 'disabled', 'unknown')}")
        properties = {
            "factoid_id": str(factoid.id),
            "factoid_subject": factoid.subject,
            "factoid_emoji": factoid.emoji,
        }
        if extra_properties:
            properties.update(extra_properties)

        posthog_callback = DebugPostHogCallback(
            client=client,
            distinct_id=distinct_id,
            trace_id=trace_id,
            properties=properties,
            groups={"factoid": str(factoid.id)},
        )
        callbacks.append(posthog_callback)
        logger.info(f"PostHog callback added to callbacks list. Total callbacks: {len(callbacks)}")
    else:
        logger.warning("PostHog client is None - no PostHog callback will be added")

    # Initialize Braintrust (this will set up global handler automatically)
    initialize_braintrust()

    # Optionally add a specific Braintrust callback for this chat session
    braintrust_callback = get_braintrust_callback_handler()
    if braintrust_callback:
        callbacks.append(braintrust_callback)

    # Log operation metadata for trace filtering
    log_operation_metadata(
        "factoid_chat",
        service="chat_agent",
        factoid_id=str(factoid.id),
    )

    # Initialize LangSmith (this will set up global tracing automatically)
    initialize_langsmith()

    # Optionally add a specific LangSmith callback for this chat session
    langsmith_callback = get_langsmith_callback_handler()
    if langsmith_callback:
        callbacks.append(langsmith_callback)

    # Initialize Datadog LLM observability
    initialize_datadog()

    # Optionally add a specific Datadog callback for this chat session
    datadog_callback = get_datadog_callback_handler()
    if datadog_callback:
        callbacks.append(datadog_callback)

    # Initialize Langfuse tracing
    initialize_langfuse()

    # Optionally add a specific Langfuse callback for this chat session
    langfuse_callback = get_langfuse_callback_handler()
    if langfuse_callback:
        callbacks.append(langfuse_callback)

    return callbacks


def _extract_text(payload: Any) -> str:
    if isinstance(payload, dict) and isinstance(payload.get("text"), str):
        return payload["text"]
    if isinstance(payload, str):
        return payload
    return _normalise_content(payload)


def _normalise_human_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(str(item) for item in content)
    if isinstance(content, dict) and isinstance(content.get("text"), str):
        return content["text"]
    return str(content)


def _normalise_search_results(payload: Any, limit: int) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []

    raw_items: list[Any] = []
    if isinstance(payload, dict) and isinstance(payload.get("results"), list):
        raw_items = payload["results"]
    elif isinstance(payload, list):
        raw_items = payload

    for item in raw_items:
        if not isinstance(item, dict):
            continue
        title = item.get("title") or item.get("name") or item.get("query")
        snippet = (
            item.get("content")
            or item.get("snippet")
            or item.get("description")
            or item.get("summary")
        )
        url = item.get("url") or item.get("link")
        if title or url:
            results.append({"title": title, "snippet": snippet, "url": url})
        if len(results) >= limit:
            break
    return results


__all__ = [
    "FactoidAgent",
    "FactoidAgentConfig",
    "build_system_prompt",
    "history_to_messages",
    "run_factoid_agent",
    "serialise_message",
]
