"""Smoke scripts for the factoid chat agent."""

from __future__ import annotations

import os
from typing import Sequence

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")
django.setup()

from apps.chat.services.factoid_agent import (  # noqa: E402
    FactoidAgent,
    FactoidAgentConfig,
    build_system_prompt,
)
from apps.core.posthog import get_posthog_client  # noqa: E402
from apps.factoids.models import Factoid  # noqa: E402
from langchain_core.messages import (  # noqa: E402
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)


def _get_demo_factoid() -> Factoid:
    factoid = Factoid.objects.order_by("-created_at").first()
    if factoid is None:
        raise SystemExit("No factoid found. Seed the database before running the demo.")
    return factoid


def _run_agent(messages: Sequence[str]) -> None:
    factoid = _get_demo_factoid()
    posthog_client = get_posthog_client()
    config = FactoidAgentConfig(
        model_key=factoid.generation_metadata.get("model", "openai/gpt-4o-mini"),
        temperature=0.7,
        distinct_id="smoke-demo",
        trace_id="smoke-demo-trace",
        posthog_properties={"source": "chat_agent_examples"},
    )
    agent = FactoidAgent(factoid=factoid, config=config, posthog_client=posthog_client)

    history = [SystemMessage(content=build_system_prompt(factoid))]
    history.extend(HumanMessage(content=msg) for msg in messages)

    print("Factoid subject:", factoid.subject)
    print("Factoid text:", factoid.text)
    print("User turns:")
    for idx, msg in enumerate(messages, start=1):
        print(f"  {idx}. {msg}")
    print()

    responses = agent.run(history, callbacks=[])
    tool_usage: list[str] = []
    for message in responses:
        header = f"[{message.__class__.__name__}]"
        if isinstance(message, AIMessage) and message.tool_calls:
            for tool_call in message.tool_calls:
                tool_name = tool_call.get("name") or tool_call.get("tool") or "unknown"
                tool_usage.append(tool_name)
                args = tool_call.get("args") or tool_call.get("arguments")
                print(f"{header} -> tool call: {tool_name} args={args}")
        elif isinstance(message, ToolMessage):
            print(f"{header} (tool response) -> {message.content}")
        else:
            print(f"{header} {message.content}\n")

    if tool_usage:
        summary = ", ".join(tool_usage)
        print(f"Tools invoked: {summary}\n")
    else:
        print("Tools invoked: none\n")


def run_web_search_example() -> None:
    """Ask the agent for sources to force the web_search tool."""

    _run_agent(["Can you find recent sources to verify this factoid?"])


def run_report_example() -> None:
    """Request a detailed report to exercise make_factoid_report."""

    _run_agent(["Please generate a shareable markdown report about this factoid."])


def run_link_example() -> None:
    """Ask for a link only (should *not* trigger the report tool)."""

    _run_agent(["Where can I read more about this?"])


if __name__ == "__main__":
    print("Web search example:\n======================")
    run_web_search_example()
    print("\nReport example:\n==============")
    run_report_example()
    print("\nLink example:\n============")
    run_link_example()
