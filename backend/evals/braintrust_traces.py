"""Fetch traces from Braintrust for evaluation."""

import logging
from datetime import datetime
from typing import Any, Dict, List

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

try:
    from braintrust import init_logger
except ImportError:
    init_logger = None


def get_recent_braintrust_traces_via_api(
    limit: int = 20, project: str = "andys-daily-factoids"
) -> List[Dict[str, Any]]:
    """
    Fetch recent LLM traces from Braintrust via project logs API.
    """
    api_key = getattr(settings, "BRAINTRUST_API_KEY", None)
    if not api_key:
        logger.warning("BRAINTRUST_API_KEY not configured - cannot fetch traces")
        return []

    try:
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

        # First, get the project ID
        projects_url = "https://api.braintrust.dev/v1/projects"
        projects_response = requests.get(headers=headers, url=projects_url)

        if projects_response.status_code != 200:
            logger.warning(f"Failed to fetch projects: {projects_response.status_code}")
            return []

        projects = projects_response.json().get("projects", [])
        project_data = next((p for p in projects if p.get("name") == project), None)

        if not project_data:
            logger.warning(f"Project '{project}' not found")
            return []

        project_id = project_data.get("id")
        logger.info(f"Found project ID: {project_id}")

        # Fetch project logs using the documented API
        logs_url = f"https://api.braintrust.dev/v1/project_logs/{project_id}/fetch"
        logs_response = requests.get(logs_url, headers=headers, params={"limit": limit})

        if logs_response.status_code != 200:
            logger.warning(f"Failed to fetch project logs: {logs_response.status_code}")
            logger.warning(f"Response: {logs_response.text}")
            return []

        logs_data = logs_response.json()
        events = logs_data.get("events", [])

        # Filter to only include factoid generation traces (not chat)
        factoid_events = [event for event in events if is_factoid_generation_trace(event)]

        logger.info(
            f"Retrieved {len(events)} total events, "
            f"filtered to {len(factoid_events)} factoid generation traces"
        )
        return factoid_events

    except Exception as e:
        logger.error(f"Failed to fetch Braintrust traces via API: {e}")
        return []


def get_recent_braintrust_traces(
    limit: int = 20, project: str = "andys-daily-factoids"
) -> List[Dict[str, Any]]:
    """
    Fetch recent LLM traces from Braintrust for structure evaluation.

    This gives us ALL LLM attempts, including ones that failed to parse
    and never made it to the database.
    """
    # For now, try the API approach since the SDK export doesn't work as expected
    return get_recent_braintrust_traces_via_api(limit=limit, project=project)


def is_factoid_generation_trace(trace: Dict[str, Any]) -> bool:
    """
    Determine if a trace is from factoid generation (not chat).

    Returns True if this looks like a factoid generation trace.
    """
    # First check for explicit metadata
    metadata = trace.get("metadata", {})
    if isinstance(metadata, dict):
        operation_type = metadata.get("operation_type")
        if operation_type == "factoid_generation":
            return True
        elif operation_type == "factoid_chat":
            return False

    # Fallback to content-based filtering for older traces without metadata
    input_data = trace.get("input", {})

    if isinstance(input_data, dict):
        # Check for messages (LangChain format)
        if "messages" in input_data and input_data["messages"]:
            messages = input_data["messages"]
            if isinstance(messages, list) and messages:
                # Look for factoid generation prompt patterns
                for message in messages:
                    if isinstance(message, dict) and "content" in message:
                        content = str(message["content"]).lower()
                        # Factoid generation prompts typically mention "factoid" and "json"
                        if (
                            ("factoid" in content and "json" in content)
                            or ("interesting fact" in content)
                            or ("subject" in content and "text" in content and "emoji" in content)
                        ):
                            return True
                        # Chat prompts typically have conversational patterns
                        if (
                            ("conversation" in content)
                            or ("user:" in content and "assistant:" in content)
                            or ("chat" in content)
                        ):
                            return False

    # Check output for JSON structure typical of factoids
    output = trace.get("output", "")
    if isinstance(output, str) and output.strip():
        try:
            # If it looks like factoid JSON structure
            if '"text":' in output and '"subject":' in output and '"emoji":' in output:
                return True
        except Exception:
            pass

    # Default to True if we can't determine (better to include than exclude factoid traces)
    return True


def format_trace_for_evaluation(trace: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format a Braintrust trace/event for use in evaluation.

    Convert Braintrust event format to match our evaluation input format.
    """
    # Extract the LLM output from the trace event
    output = trace.get("output", "")

    # Extract input parameters
    input_data = trace.get("input", {})

    # Try to extract topic from input
    topic = "Unknown"
    if isinstance(input_data, dict):
        # Check for direct topic field
        if "topic" in input_data:
            topic = input_data["topic"]
        # Check for messages (LangChain format)
        elif "messages" in input_data and input_data["messages"]:
            last_message = input_data["messages"][-1]
            if isinstance(last_message, dict) and "content" in last_message:
                # Extract topic from message content (might need parsing)
                content = last_message["content"]
                if isinstance(content, str) and "topic:" in content.lower():
                    # Try to extract topic from prompt
                    lines = content.split("\n")
                    for line in lines:
                        if "topic:" in line.lower():
                            topic = line.split(":", 1)[-1].strip()
                            break
                else:
                    topic = content[:100] + "..." if len(content) > 100 else content

    # Create a unique ID for the trace
    trace_id = trace.get("id", f"trace_{datetime.now().isoformat()}")

    # Get timestamp
    created_at = trace.get("created", datetime.now().isoformat())

    return {
        "input": {
            "topic": topic,
            "trace_id": str(trace_id),
            "created_at": str(created_at),
            "source": "braintrust_trace",
        },
        "raw_output": str(output),  # Raw LLM response for structure testing
    }


def get_traces_for_structure_eval(limit: int = 20) -> List[Dict[str, Any]]:
    """Get traces formatted specifically for structure evaluation."""
    traces = get_recent_braintrust_traces(limit=limit)
    return [format_trace_for_evaluation(trace) for trace in traces]
