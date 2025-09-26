"""Custom Braintrust scorers for factoid evaluation."""

import json
import re
from typing import Any, Dict

from apps.factoids.services.openrouter import FactoidPayload
from braintrust import Score
from django.conf import settings


def json_is_valid(output: str, expected: Any = None) -> Score:
    """
    Code scorer that validates if LLM output can be parsed into a valid FactoidPayload.

    This scorer replicates the same JSON wrangling logic used in production
    to ensure the evaluation matches real-world parsing behavior.
    """
    if not output or not isinstance(output, str):
        return Score(
            name="json_is_valid",
            score=0.0,
            metadata={
                "error": "No output to parse",
                "parsed": False,
                "has_all_fields": False,
            },
        )

    try:
        # Use the same normalization logic as production
        content = _normalize_content(output)

        # Try to parse as JSON
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            return Score(
                name="json_is_valid",
                score=0.0,
                metadata={
                    "error": f"JSON decode error: {str(e)}",
                    "parsed": False,
                    "has_all_fields": False,
                    "content_normalized": content[:200] + "..." if len(content) > 200 else content,
                },
            )

        # Try to validate with Pydantic model (same as production)
        try:
            payload = FactoidPayload.model_validate(data)

            # Check field quality
            has_text = bool(payload.text and payload.text.strip())
            has_subject = bool(payload.subject and payload.subject.strip())
            has_emoji = bool(payload.emoji and payload.emoji.strip())

            # Check length constraints
            subject_valid_length = len(payload.subject) <= 255
            emoji_valid_length = len(payload.emoji) <= 16

            all_fields_valid = has_text and has_subject and has_emoji
            length_constraints_valid = subject_valid_length and emoji_valid_length

            # Calculate score
            if all_fields_valid and length_constraints_valid:
                score = 1.0
            elif all_fields_valid:
                score = 0.8  # Has content but violates length constraints
            elif has_text or has_subject or has_emoji:
                score = 0.3  # Partial parsing
            else:
                score = 0.1  # Parsed but empty fields

            return Score(
                name="json_is_valid",
                score=score,
                metadata={
                    "parsed": True,
                    "has_all_fields": all_fields_valid,
                    "has_text": has_text,
                    "has_subject": has_subject,
                    "has_emoji": has_emoji,
                    "subject_length": len(payload.subject),
                    "emoji_length": len(payload.emoji),
                    "text_length": len(payload.text),
                    "subject_valid_length": subject_valid_length,
                    "emoji_valid_length": emoji_valid_length,
                    "parsed_subject": payload.subject,
                    "parsed_emoji": payload.emoji,
                },
            )

        except Exception as e:
            return Score(
                name="json_is_valid",
                score=0.2,  # Valid JSON but invalid structure
                metadata={
                    "error": f"Pydantic validation error: {str(e)}",
                    "parsed": True,
                    "has_all_fields": False,
                    "json_data": data,
                },
            )

    except Exception as e:
        return Score(
            name="json_is_valid",
            score=0.0,
            metadata={
                "error": f"Unexpected error: {str(e)}",
                "parsed": False,
                "has_all_fields": False,
            },
        )


def factoid_truthfulness(
    output: str, expected: Any = None, context: Dict[str, Any] = None
) -> Score:
    """
    LLM-as-judge scorer for factoid truthfulness using OpenRouter.

    Evaluates whether a generated factoid is factually accurate.
    """
    from openai import OpenAI

    # Extract factoid text from output
    factoid_text = _extract_factoid_text(output)
    if not factoid_text:
        return Score(
            name="factoid_truthfulness",
            score=0.0,
            metadata={
                "error": "Could not extract factoid text",
                "judge_model": "openai/gpt-4-turbo-preview",
            },
        )

    # Get topic context if available
    topic = ""
    if context and "input" in context:
        if isinstance(context["input"], dict):
            topic = context["input"].get("topic", "")
        elif isinstance(context["input"], str):
            topic = context["input"]

    # Build judge prompt
    topic_str = topic if topic else "General knowledge"
    judge_prompt = (
        f"You are an expert fact-checker. Evaluate if the following factoid is truthful.\n\n"
        f"Topic: {topic_str}\n"
        f'Factoid: "{factoid_text}"\n\n'
        "Instructions:\n"
        "1. Verify the core claim is factually accurate\n"
        "2. Check for misleading statements or exaggerations\n"
        "3. Consider if details are precisely correct\n"
        "4. Assess overall truthfulness\n\n"
        'Think step-by-step, then respond with either "TRUE" or "FALSE" '
        "followed by a brief explanation.\n\n"
        "Format your response as:\n"
        "VERDICT: [TRUE/FALSE]\n"
        "REASONING: [Your explanation]"
    )

    try:
        # Use OpenRouter via OpenAI client interface
        client = OpenAI(
            api_key=settings.OPENROUTER_API_KEY,
            base_url=settings.OPENROUTER_BASE_URL,
        )

        response = client.chat.completions.create(
            model="openai/gpt-4-turbo-preview",
            messages=[
                {
                    "role": "system",
                    "content": "You are a meticulous fact-checker. Be thorough but concise.",
                },
                {"role": "user", "content": judge_prompt},
            ],
            temperature=0.0,
            max_tokens=500,
        )

        judge_response = response.choices[0].message.content.strip()

        # Parse verdict
        verdict_line = ""
        reasoning = ""

        for line in judge_response.split("\n"):
            line = line.strip()
            if line.startswith("VERDICT:"):
                verdict_line = line
            elif line.startswith("REASONING:"):
                reasoning = line.replace("REASONING:", "").strip()

        # Determine score
        if "TRUE" in verdict_line.upper():
            score = 1.0
        elif "FALSE" in verdict_line.upper():
            score = 0.0
        else:
            score = 0.5  # Unclear verdict

        return Score(
            name="factoid_truthfulness",
            score=score,
            metadata={
                "judge_response": judge_response,
                "verdict": verdict_line,
                "reasoning": reasoning,
                "factoid_text": factoid_text,
                "topic": topic,
                "judge_model": "openai/gpt-4-turbo-preview",
            },
        )

    except Exception as e:
        return Score(
            name="factoid_truthfulness",
            score=0.0,
            metadata={
                "error": f"Judge API error: {str(e)}",
                "factoid_text": factoid_text,
                "topic": topic,
                "judge_model": "openai/gpt-4-turbo-preview",
            },
        )


def _normalize_content(content: str) -> str:
    """
    Normalize content using the same logic as production.
    Extracted from apps.factoids.services.openrouter._normalise_content
    """
    if not isinstance(content, str):
        return str(content)

    # Look for fenced JSON blocks
    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
    if fenced_match:
        return fenced_match.group(1).strip()

    return content.strip()


def _extract_factoid_text(output: str) -> str:
    """Extract factoid text from LLM output for truthfulness evaluation."""
    if not output:
        return ""

    try:
        # First try to parse as JSON
        content = _normalize_content(output)
        data = json.loads(content)

        # Extract text field
        if isinstance(data, dict) and "text" in data:
            return data["text"]

    except json.JSONDecodeError:
        pass

    # If JSON parsing fails, try to extract from raw text
    # Look for patterns like "text": "..." or just use the whole output
    text_match = re.search(r'"text":\s*"([^"]+)"', output)
    if text_match:
        return text_match.group(1)

    # Fall back to using the output as-is (for simple text responses)
    return output.strip()
