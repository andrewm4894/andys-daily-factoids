"""LangGraph-powered agent for factoid conversations."""

from __future__ import annotations

import logging
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
from apps.core.posthog import get_posthog_client
from apps.factoids.models import Factoid

try:
    from langchain_tavily import TavilySearch
except ImportError:  # pragma: no cover - optional dependency
    TavilySearch = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


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
        invoke_config: dict[str, Any] = {}
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
        invoke_config: dict[str, Any] = {}
        if callbacks:
            invoke_config["callbacks"] = list(callbacks)

        result = self._graph.invoke(
            {"messages": list(history)},
            config={"configurable": {"recursion_limit": 6}, **invoke_config},
        )
        return result["messages"]


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

    default_model = getattr(
        settings,
        "FACTOID_AGENT_DEFAULT_MODEL",
        "openai/gpt-5-mini",
    )
    resolved_model = model_key or default_model
    resolved_temperature = temperature if temperature is not None else 0.7

    posthog_client = get_posthog_client()
    trace_id = str(session.id)
    callbacks = _build_posthog_callbacks(
        client=posthog_client,
        distinct_id=distinct_id,
        trace_id=trace_id,
        factoid=factoid,
        extra_properties=_merge_properties(posthog_properties, {"factoid_id": str(factoid.id)}),
    )

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


def _build_posthog_callbacks(
    *,
    client: Posthog | None,
    distinct_id: str,
    trace_id: str,
    factoid: Factoid,
    extra_properties: dict[str, Any] | None,
) -> list[CallbackHandler]:
    if not client:
        return []

    properties = {
        "factoid_id": str(factoid.id),
        "factoid_subject": factoid.subject,
        "factoid_emoji": factoid.emoji,
    }
    if extra_properties:
        properties.update(extra_properties)

    callback = CallbackHandler(
        client=client,
        distinct_id=distinct_id,
        trace_id=trace_id,
        properties=properties,
        groups={"factoid": str(factoid.id)},
    )
    return [callback]


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
