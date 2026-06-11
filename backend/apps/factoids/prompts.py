"""Prompt templates for factoid generation."""

from __future__ import annotations

from typing import Optional

from django.conf import settings

from apps.core.prompt_management import ManagedPrompt, get_managed_prompt
from apps.factoids.models import Factoid

DEFAULT_FACTOID_GENERATION_PROMPT_NAME = "factoid-generation"
FACTOID_GENERATION_PROMPT_VERSION: int | None = None

FACTOID_GENERATION_PROMPT_FALLBACK = (
    "{{recent_examples}}Please provide a new, concise, interesting fact{{topic_clause}} "
    "in one sentence, along with its subject and an emoji that represents the fact.\n\n"
    "- Do not repeat any of the provided examples.\n"
    "- Avoid boilerplate phrases like 'Did you know'.\n"
    "- Keep it to one sentence with minimal commentary.\n"
    "- Avoid discussing what a fact 'showcases' or 'highlights'.\n"
    "- Avoid overused topics like jellyfish, octopus, or whales unless specifically requested.\n"
    "- Think about novel and intriguing facts that people might not know.\n"
    "- Make it genuinely surprising or mind-blowing.\n\n"
    "{{response_instructions}}"
)


def build_factoid_generation_prompt(
    topic: Optional[str] = None,
    recent_factoids: Optional[list[Factoid]] = None,
    num_examples: int = settings.FACTOID_GENERATION_EXAMPLES_COUNT,
    use_factoid_tool: bool = False,
) -> str:
    """Build a comprehensive prompt for factoid generation including recent examples."""
    return build_factoid_generation_managed_prompt(
        topic=topic,
        recent_factoids=recent_factoids,
        num_examples=num_examples,
        use_factoid_tool=use_factoid_tool,
    ).content


def build_factoid_generation_managed_prompt(
    topic: Optional[str] = None,
    recent_factoids: Optional[list[Factoid]] = None,
    num_examples: int = settings.FACTOID_GENERATION_EXAMPLES_COUNT,
    use_factoid_tool: bool = False,
) -> ManagedPrompt:
    """Build a factoid generation prompt from PostHog or the local fallback."""

    return get_managed_prompt(
        name=DEFAULT_FACTOID_GENERATION_PROMPT_NAME,
        version=FACTOID_GENERATION_PROMPT_VERSION,
        fallback=FACTOID_GENERATION_PROMPT_FALLBACK,
        variables={
            "recent_examples": _format_recent_examples(recent_factoids, num_examples),
            "topic_clause": f" about {topic}" if topic else "",
            "response_instructions": _format_response_instructions(use_factoid_tool),
        },
    )


def _format_recent_examples(
    recent_factoids: Optional[list[Factoid]],
    num_examples: int,
) -> str:
    if recent_factoids:
        prompt_parts = [
            "Here are some recent examples of interesting factoids "
            "(note the votes up and down counts which comes from user feedback):",
            "",
            "## Examples:",
        ]

        for factoid in recent_factoids[:num_examples]:
            votes_info = f"(votes up: {factoid.votes_up}, votes down: {factoid.votes_down})"
            prompt_parts.append(f"- **{factoid.subject}**: {factoid.text} {votes_info}")

        return "\n".join(prompt_parts) + "\n\n"

    return ""


def _format_response_instructions(use_factoid_tool: bool) -> str:
    if use_factoid_tool:
        return "\n".join(
            [
                "When you are satisfied, call the `make_factoid` tool once with arguments:",
                '{"text": "your factoid text", "subject": "category/topic", '
                '"emoji": "<some suitable emoji>"}',
                "Do not include additional assistant text once you call the tool.",
            ]
        )

    return "\n".join(
        [
            "Respond as JSON with exactly these keys:",
            '{"text": "your factoid text", "subject": "category/topic", '
            '"emoji": "<some suitable emoji>"}',
        ]
    )


__all__ = [
    "DEFAULT_FACTOID_GENERATION_PROMPT_NAME",
    "FACTOID_GENERATION_PROMPT_FALLBACK",
    "FACTOID_GENERATION_PROMPT_VERSION",
    "build_factoid_generation_managed_prompt",
    "build_factoid_generation_prompt",
]
