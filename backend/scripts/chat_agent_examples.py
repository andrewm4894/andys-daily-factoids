"""Smoke scripts for the factoid chat agent.

These examples test the chat agent's behavior with different types of queries to see
when it appropriately uses or doesn't use the web_search tool.

Note: The examples will show web_search tool calls but will return "search_unavailable"
since Tavily search needs to be configured. The important thing is observing
when the agent attempts to use the tool vs when it doesn't.

Run with different arguments:
- python chat_agent_examples.py        # Quick test suite
- python chat_agent_examples.py search      # Examples that should trigger search
- python chat_agent_examples.py no-search   # Examples that should NOT trigger search
- python chat_agent_examples.py edge        # Edge cases
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Sequence

import django
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env", override=False)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")
django.setup()

from apps.chat.services.factoid_agent import (  # noqa: E402
    FactoidAgent,
    FactoidAgentConfig,
    build_system_prompt,
)
from apps.core.posthog import get_posthog_client  # noqa: E402
from apps.factoids.models import Factoid  # noqa: E402
from django.conf import settings  # noqa: E402
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage  # noqa: E402
from posthog.ai.langchain import CallbackHandler  # noqa: E402


def _get_demo_factoid() -> Factoid:
    factoid = Factoid.objects.order_by("-created_at").first()
    if factoid is None:
        raise SystemExit("No factoid found. Seed the database before running the demo.")
    return factoid


def _build_callbacks(
    *,
    client,
    factoid: Factoid,
    distinct_id: str,
    trace_id: str,
    extra_properties: dict[str, object] | None,
) -> list[CallbackHandler]:
    if client is None:
        return []

    properties = {
        "factoid_id": str(factoid.id),
        "factoid_subject": factoid.subject,
        "factoid_emoji": factoid.emoji,
    }
    if extra_properties:
        properties.update(extra_properties)

    return [
        CallbackHandler(
            client=client,
            distinct_id=distinct_id,
            trace_id=trace_id,
            properties=properties,
            groups={"factoid": str(factoid.id)},
        )
    ]


def _run_agent(messages: Sequence[str]) -> tuple[bool, list[str]]:
    """Run agent and return (success, tools_used)."""
    factoid = _get_demo_factoid()
    default_model = getattr(settings, "FACTOID_AGENT_DEFAULT_MODEL", "openai/gpt-5-mini")
    model_from_factoid = (
        factoid.generation_metadata.get("model")  # type: ignore[union-attr]
        if isinstance(getattr(factoid, "generation_metadata", None), dict)
        else None
    )
    config = FactoidAgentConfig(
        model_key=model_from_factoid or default_model,
        temperature=0.7,
        distinct_id="smoke-demo",
        trace_id="smoke-demo-trace",
        posthog_properties={"source": "chat_agent_examples"},
    )
    posthog_client = get_posthog_client()
    agent = FactoidAgent(factoid=factoid, config=config, posthog_client=posthog_client)

    system_prompt = build_system_prompt(factoid)
    history = [HumanMessage(content=msg) for msg in messages]
    callbacks = _build_callbacks(
        client=posthog_client,
        factoid=factoid,
        distinct_id=config.distinct_id,
        trace_id=config.trace_id,
        extra_properties=config.posthog_properties,
    )

    print("Factoid subject:", factoid.subject)
    print("Factoid text:", factoid.text)
    print("System prompt preview:\n", system_prompt, sep="")
    print("User turns:")
    for idx, msg in enumerate(messages, start=1):
        print(f"  {idx}. {msg}")
    print()

    responses = agent.run(history, callbacks=callbacks)

    new_messages = responses[len(history) :] if len(responses) >= len(history) else responses

    tool_usage: list[str] = []
    for message in new_messages:
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
            content = message.content if hasattr(message, "content") else str(message)
            print(f"{header} {content}")

    if tool_usage:
        summary = ", ".join(tool_usage)
        print(f"Tools invoked: {summary}")
    else:
        print("Tools invoked: none")

    if posthog_client:
        try:
            posthog_client.flush()
        except Exception as exc:  # pragma: no cover - diagnostics only
            print(f"PostHog flush failed: {exc}")

    return True, tool_usage


# Examples that SHOULD trigger web search


def run_explicit_search_request() -> tuple[bool, list[str]]:
    """Direct request for sources - should definitely use web_search."""
    return _run_agent(
        ["Please call web_search to gather recent, reputable sources that verify this factoid."]
    )


def run_verification_request() -> tuple[bool, list[str]]:
    """Asking for verification - should use web_search."""
    return _run_agent(
        ["Can you verify this factoid with current sources? I want to make sure it's accurate."]
    )


def run_current_status_question() -> tuple[bool, list[str]]:
    """Asking about current status - should use web_search for recent info."""
    return _run_agent(["What's the current status of this topic? Has anything changed recently?"])


def run_citation_request() -> tuple[bool, list[str]]:
    """Asking for citations - should use web_search."""
    return _run_agent(["Can you provide citations and references for this information?"])


def run_controversy_question() -> tuple[bool, list[str]]:
    """Asking about debates/controversy - should search for different perspectives."""
    return _run_agent(
        ["Is there any debate or controversy around this topic? What do different sources say?"]
    )


# Examples that should NOT necessarily trigger web search


def run_explanation_request() -> tuple[bool, list[str]]:
    """Simple explanation request - agent can work with factoid content."""
    return _run_agent(["Can you explain this factoid to me in simpler terms?"])


def run_opinion_question() -> tuple[bool, list[str]]:
    """Personal opinion question - doesn't need external sources."""
    return _run_agent(["What do you think is the most interesting part of this factoid?"])


def run_hypothetical_question() -> tuple[bool, list[str]]:
    """Hypothetical scenario - can be answered without search."""
    return _run_agent(["If this factoid were different, how might that change things?"])


def run_definition_question() -> tuple[bool, list[str]]:
    """Definition question about terms in the factoid."""
    return _run_agent(["What does [key term from factoid] mean?"])


def run_simple_follow_up() -> tuple[bool, list[str]]:
    """Simple follow-up that can be answered from existing knowledge."""
    return _run_agent(["That's interesting! Can you tell me more about why this happens?"])


# Edge cases / borderline examples


def run_related_topics() -> tuple[bool, list[str]]:
    """Asking about related topics - might or might not trigger search."""
    return _run_agent(["What other topics are related to this factoid?"])


def run_comparison_request() -> tuple[bool, list[str]]:
    """Comparison question - might need search for accurate comparison."""
    return _run_agent(["How does this compare to similar situations in other countries/times?"])


def run_multi_turn_conversation() -> tuple[bool, list[str]]:
    """Multi-turn conversation to test context handling."""
    return _run_agent(
        [
            "This is really interesting!",
            "Can you find some sources that talk more about this?",
            "Thanks! What's the most surprising thing from those sources?",
        ]
    )


def analyze_tool_usage(examples_list, expected_tool_usage):
    """Analyze a set of examples and check if tool usage matches expectations."""
    results = []

    for i, (name, func, expected) in enumerate(examples_list):
        print(f"\n[{i + 1}/{len(examples_list)}] {name}:")
        print("=" * (len(name) + 10))
        print(f"Expected web_search usage: {expected}")

        try:
            success, tools_used = func()
            web_search_used = "web_search" in tools_used

            print(f"Tools used: {', '.join(tools_used) if tools_used else 'none'}")

            # Check if behavior matches expectations
            if expected is True and web_search_used:
                print("✓ CORRECT: Used web_search as expected")
                results.append((name, True, "correct"))
            elif expected is False and not web_search_used:
                print("✓ CORRECT: Did not use web_search as expected")
                results.append((name, True, "correct"))
            elif expected == "Maybe":
                status = "used" if web_search_used else "not used"
                print(f"ℹ️ EDGE CASE: Web search {status} (acceptable either way)")
                results.append((name, True, "edge_case"))
            elif expected is True and not web_search_used:
                print("✗ UNEXPECTED: Should have used web_search but didn't")
                results.append((name, True, "missed_search"))
            elif expected is False and web_search_used:
                print("⚠️ UNEXPECTED: Used web_search when not needed")
                results.append((name, True, "unnecessary_search"))

        except Exception as e:
            print(f"✗ Error: {e}")
            results.append((name, False, "error"))

        print("-" * 60)

    return results


if __name__ == "__main__":
    import sys

    # Define test suites
    should_search_examples = [
        ("Explicit search request", run_explicit_search_request, True),
        ("Verification request", run_verification_request, True),
        ("Citation request", run_citation_request, True),
    ]

    should_not_search_examples = [
        ("Simple explanation", run_explanation_request, False),
        ("Opinion question", run_opinion_question, False),
        ("Simple follow-up", run_simple_follow_up, False),
    ]

    edge_case_examples = [
        ("Related topics", run_related_topics, "Maybe"),
        ("Comparison request", run_comparison_request, "Maybe"),
    ]

    # Allow running specific test suites
    if len(sys.argv) > 1:
        suite = sys.argv[1]
        if suite == "search":
            print("=== TESTING: SHOULD TRIGGER WEB SEARCH ===")
            analyze_tool_usage(should_search_examples, True)
        elif suite == "no-search":
            print("=== TESTING: SHOULD NOT TRIGGER WEB SEARCH ===")
            analyze_tool_usage(should_not_search_examples, False)
        elif suite == "edge":
            print("=== TESTING: EDGE CASES ===")
            analyze_tool_usage(edge_case_examples, "Maybe")
        else:
            print("Usage: python chat_agent_examples.py [search|no-search|edge]")
            sys.exit(1)
    else:
        # Run a quick subset by default
        print("=== QUICK TEST SUITE ===")
        print("(Run with 'search', 'no-search', or 'edge' for specific test suites)\n")

        quick_tests = [
            ("🔍 Should search: Explicit request", run_explicit_search_request, True),
            ("💭 Should not search: Simple explanation", run_explanation_request, False),
            ("❓ Edge case: Related topics", run_related_topics, "Maybe"),
        ]

        analyze_tool_usage(quick_tests, "Mixed")
