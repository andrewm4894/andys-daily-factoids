"""Prompt templates for factoid generation."""

from __future__ import annotations

from typing import Optional

from apps.factoids.models import Factoid


def build_factoid_generation_prompt(
    topic: Optional[str] = None,
    recent_factoids: Optional[list[Factoid]] = None,
    num_examples: int = 25,
    use_factoid_tool: bool = False,
) -> str:
    """Build a comprehensive prompt for factoid generation including recent examples."""

    prompt_parts = []

    # Add examples section if we have recent factoids
    if recent_factoids:
        prompt_parts.append(
            "Here are some recent examples of interesting factoids "
            "(note the votes up and down counts which comes from user feedback):"
        )
        prompt_parts.append("")
        prompt_parts.append("## Examples:")

        for factoid in recent_factoids[:num_examples]:
            votes_info = f"(votes up: {factoid.votes_up}, votes down: {factoid.votes_down})"
            prompt_parts.append(f"- **{factoid.subject}**: {factoid.text} {votes_info}")

        prompt_parts.append("")

    # Main instruction
    if topic:
        instruction = (
            f"Please provide a new, concise, interesting fact about {topic} "
            "in one sentence, along with its subject and an emoji that represents the fact."
        )
    else:
        instruction = (
            "Please provide a new, concise, interesting fact in one sentence, "
            "along with its subject and an emoji that represents the fact."
        )

    prompt_parts.append(instruction)
    prompt_parts.append("")

    # Guidelines
    guidelines = [
        "- Do not repeat any of the provided examples.",
        "- Avoid boilerplate phrases like 'Did you know'.",
        "- Keep it to one sentence with minimal commentary.",
        "- Avoid discussing what a fact 'showcases' or 'highlights'.",
        "- Avoid overused topics like jellyfish, octopus, or whales unless specifically requested.",
        "- Think about novel and intriguing facts that people might not know.",
        "- Make it genuinely surprising or mind-blowing.",
    ]

    prompt_parts.extend(guidelines)
    prompt_parts.append("")

    if use_factoid_tool:
        prompt_parts.append(
            "When you are satisfied, call the `make_factoid` tool once with arguments:"
        )
        prompt_parts.append(
            '{"text": "your factoid text", "subject": "category/topic", '
            '"emoji": "<some suitable emoji>"}'
        )
        prompt_parts.append("Do not include additional assistant text once you call the tool.")
    else:
        prompt_parts.append("Respond as JSON with exactly these keys:")
        prompt_parts.append(
            '{"text": "your factoid text", "subject": "category/topic", '
            '"emoji": "<some suitable emoji>"}'
        )

    return "\n".join(prompt_parts)
