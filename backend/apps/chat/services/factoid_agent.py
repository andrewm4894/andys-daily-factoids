"""LangGraph-powered agent for factoid conversations."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Annotated, Any, Iterable, Sequence, TypedDict

from django.conf import settings
from langchain_core.callbacks import CallbackManagerForToolRun
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.prompts import ChatPromptTemplate
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
from apps.factoids.services.openrouter import DEFAULT_FACTOID_MODEL

try:
    from langchain_tavily import TavilySearchResults
except ImportError:  # pragma: no cover - optional dependency
    TavilySearchResults = None  # type: ignore[assignment]

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
    """Use Tavily search to surface supporting references for the factoid."""

    name: str = "web_search"
    description: str = (
        "Use this tool to find recent sources, background material, or verification"
        " for the factoid. Provide the core subject or user question in the query."
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
        self._available = TavilySearchResults is not None and bool(tavily_api_key)

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
            if TavilySearchResults is None:  # pragma: no cover - defensive
                raise RuntimeError("TavilySearchResults is unavailable")
            tool = TavilySearchResults(
                max_results=requested,
                tavily_api_key=self._tavily_api_key,
            )
            payload = tool.invoke(actual_query)
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
    if TavilySearchResults is None or not tavily_api_key:
        return None
    return WebSearchTool(
        factoid=factoid,
        tavily_api_key=tavily_api_key,
        max_results=max_results,
    )


class FactoidReportTool(BaseTool):
    """Generate a longer, shareable report about the factoid."""

    name: str = "make_factoid_report"
    description: str = (
        "Expand the core factoid into a concise markdown report with context,"
        " implications, and a short shareable summary. Use when the user asks"
        " for more detail or something to share with others."
    )

    def __init__(
        self,
        *,
        factoid: Factoid,
        model_key: str,
        api_key: str | None,
        base_url: str,
        distinct_id: str,
        trace_id: str,
        posthog_client: Posthog | None,
        extra_properties: dict[str, Any] | None,
        temperature: float = 0.6,
    ) -> None:
        super().__init__()
        self._factoid = factoid
        self._model_key = model_key
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._temperature = temperature
        self._distinct_id = distinct_id
        self._trace_id = trace_id
        self._posthog_client = posthog_client
        self._extra_properties = extra_properties or {}

    def _run(  # type: ignore[override]
        self,
        directive: str | None = None,
        run_manager: CallbackManagerForToolRun | None = None,
    ) -> str:
        if not self._api_key:
            return (
                "Report generation is unavailable because the language model API key"
                " is not configured."
            )

        manager = run_manager or CallbackManagerForToolRun.get_noop_manager()

        llm = ChatOpenAI(
            api_key=self._api_key,
            base_url=self._base_url,
            model=self._model_key,
            temperature=self._temperature,
        )

        messages = _build_report_messages(self._factoid, directive)
        callbacks = _build_posthog_callbacks(
            client=self._posthog_client,
            distinct_id=self._distinct_id,
            trace_id=f"{self._trace_id}:report",
            factoid=self._factoid,
            extra_properties={"tool": "make_factoid_report", **self._extra_properties},
        )

        collected_callbacks: list[Any] = []
        if callbacks:
            collected_callbacks.extend(callbacks)
        child_manager = manager.get_child()
        if getattr(child_manager, "handlers", None):
            collected_callbacks.extend(child_manager.handlers)

        invoke_config: dict[str, Any] = {}
        if collected_callbacks:
            invoke_config["callbacks"] = collected_callbacks

        try:
            response = llm.invoke(messages, config=invoke_config)
        except Exception as exc:  # pragma: no cover - defensive
            manager.on_tool_error(exc)
            raise

        report_text = _normalise_content(response.content)
        payload = {
            "status": "report_ready",
            "markdown": report_text,
        }
        payload_json = json.dumps(payload)
        manager.on_tool_end(payload_json)
        return payload_json


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
        report_tool = FactoidReportTool(
            factoid=factoid,
            model_key=config.model_key,
            api_key=api_key,
            base_url=base_url,
            distinct_id=config.distinct_id,
            trace_id=config.trace_id,
            posthog_client=posthog_client,
            extra_properties=_merge_properties(
                config.posthog_properties, {"factoid_id": str(factoid.id)}
            ),
        )

        tools: list[BaseTool] = []
        if search_tool:
            tools.append(search_tool)
        tools.append(report_tool)

        if tools:
            self._model = self._model.bind_tools(tools)

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

    resolved_model = model_key or DEFAULT_FACTOID_MODEL
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
    return chat_models.ChatMessageRole.TOOL, {"content": str(message.content)}


def _chat_message_to_langchain(message: chat_models.ChatMessage) -> BaseMessage | None:
    payload = message.content or {}

    if message.role == chat_models.ChatMessageRole.USER:
        text = _extract_text(payload)
        return HumanMessage(content=text)

    if message.role == chat_models.ChatMessageRole.ASSISTANT:
        content = payload.get("content") if isinstance(payload, dict) else payload
        raw_additional = payload.get("additional_kwargs") if isinstance(payload, dict) else {}
        if isinstance(raw_additional, dict):
            additional_kwargs = raw_additional
        else:
            additional_kwargs = {}
        raw_tool_calls = None
        if isinstance(payload, dict):
            raw_tool_calls = payload.get("tool_calls")
            if not raw_tool_calls:
                raw_tool_calls = payload.get("additional_kwargs", {}).get("tool_calls")
        if isinstance(raw_tool_calls, list):
            tool_calls = raw_tool_calls
        else:
            tool_calls = []
        return AIMessage(
            content=content,
            additional_kwargs=additional_kwargs,
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
        '   - Return value includes {{"query": ... , "results": [...]}} '
        "that you can cite or summarise.\n"
        "2. make_factoid_report(directive: string | None) -> markdown string\n"
        "   - Call only when the user explicitly requests a detailed report,"
        " write-up, markdown export, or shareable summary.\n"
        "   - Never use this tool when the user wants a brief answer, citation, or"
        " link—respond directly (optionally after web_search).\n"
        "   - Return concise, well-structured markdown (2-3 paragraphs and bullet"
        " highlights).\n"
        '   - The tool returns JSON like {{"status": "report_ready",'
        ' "markdown": ...}}. Do not expose the markdown. Reply with a brief'
        " confirmation and direct the user to the download link.\n\n"
        "Examples:\n"
        '- User: "Where can I read more about this?" -> Use web_search to find'
        " links, then answer with sources. Do NOT call make_factoid_report.\n"
        '- User: "Please create a downloadable report I can share" -> Call'
        " make_factoid_report and then acknowledge the download link.\n\n"
        "Guidelines:\n"
        "- Ground answers in the factoid and reputable sources.\n"
        "- Use web_search to locate citations, links, or when you need to double-check facts.\n"
        "- Only call make_factoid_report when the user clearly requests a report,"
        " shareable markdown, or detailed write-up.\n"
        "  If the intent is unclear, ask the user whether they want a report"
        " instead of calling the tool.\n"
        "- Include disclaimers when information is uncertain or speculative.\n"
        "- Keep tone friendly, concise, and curious."
    ).format(subject=subject, emoji=emoji, text=factoid.text)


def _build_report_messages(factoid: Factoid, directive: str | None) -> list[BaseMessage]:
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You write short markdown reports (2-3 paragraphs) that expand on a factoid."
                " Provide background context, interesting implications, and include a bullet list"
                " of shareable highlights at the end. Always stay grounded in well-known"
                " information and mention if verification is required.",
            ),
            (
                "human",
                (
                    "Factoid subject: {subject}\n"
                    "Factoid emoji: {emoji}\n"
                    "Factoid text: {text}\n\n"
                    "Write the expanded report. {extra}"
                ),
            ),
        ]
    )

    extra = directive or "Focus on why this factoid matters and who might find it useful."
    return prompt.format_messages(
        subject=factoid.subject or "Unknown subject",
        emoji=factoid.emoji or "✨",
        text=factoid.text,
        extra=extra,
    )


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
