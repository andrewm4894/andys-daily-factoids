"""Tests for the factoid agent service logic."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from django.conf import settings
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from apps.chat import models as chat_models
from apps.chat.services.factoid_agent import (
    FactoidAgent,
    FactoidAgentConfig,
    WebSearchTool,
    _build_search_tool,
    _merge_properties,
    _normalise_search_results,
    build_system_prompt,
    history_to_messages,
    run_factoid_agent,
    serialise_message,
)
from apps.factoids import models as factoid_models


@pytest.fixture
def sample_factoid():
    """Create a sample factoid for testing."""
    return factoid_models.Factoid.objects.create(
        text="Water is composed of hydrogen and oxygen atoms.",
        subject="Chemistry",
        emoji="💧",
    )


@pytest.fixture
def chat_session(sample_factoid):
    """Create a sample chat session."""
    return chat_models.ChatSession.objects.create(
        factoid=sample_factoid,
        model_key="gpt-4",
    )


@pytest.fixture
def agent_config():
    """Create a sample agent configuration."""
    return FactoidAgentConfig(
        model_key="gpt-4",
        temperature=0.7,
        distinct_id="test-user",
        trace_id="test-trace",
        posthog_properties={"test": "value"},
    )


class TestBuildSystemPrompt:
    """Tests for the build_system_prompt function."""

    @pytest.mark.django_db()
    def test_builds_prompt_with_all_factoid_data(self, sample_factoid):
        prompt = build_system_prompt(sample_factoid)

        assert "Chemistry" in prompt
        assert "💧" in prompt
        assert "Water is composed of hydrogen and oxygen atoms." in prompt
        assert "Andy's Daily Factoids companion agent" in prompt
        assert "web_search" in prompt

    @pytest.mark.django_db()
    def test_handles_missing_subject(self):
        factoid = factoid_models.Factoid.objects.create(
            text="Some interesting fact",
            subject="",
            emoji="🔬",
        )

        prompt = build_system_prompt(factoid)
        assert "Unknown subject" in prompt
        assert "Some interesting fact" in prompt

    @pytest.mark.django_db()
    def test_handles_missing_emoji(self):
        factoid = factoid_models.Factoid.objects.create(
            text="Some interesting fact",
            subject="Science",
            emoji="",
        )

        prompt = build_system_prompt(factoid)
        assert "✨" in prompt  # Default emoji
        assert "Science" in prompt

    @pytest.mark.django_db()
    def test_includes_tool_documentation(self, sample_factoid):
        prompt = build_system_prompt(sample_factoid)

        assert "web_search(query: string | None, max_results: int)" in prompt
        assert "Always pass a clear query" in prompt
        assert "NEVER include raw JSON data" in prompt
        assert "Use web_search efficiently" in prompt


class TestWebSearchTool:
    """Tests for the WebSearchTool class."""

    @pytest.mark.django_db()
    def test_init_without_tavily(self, sample_factoid):
        tool = WebSearchTool(
            factoid=sample_factoid,
            tavily_api_key=None,
            max_results=5,
        )

        assert tool.name == "web_search"
        assert tool._factoid == sample_factoid
        assert tool._available is False

    @pytest.mark.django_db()
    def test_init_with_tavily_but_no_key(self, sample_factoid):
        with patch("apps.chat.services.factoid_agent.TavilySearch", MagicMock()):
            tool = WebSearchTool(
                factoid=sample_factoid,
                tavily_api_key=None,
                max_results=5,
            )
            assert tool._available is False

    @pytest.mark.django_db()
    def test_init_with_tavily_and_key(self, sample_factoid):
        with patch("apps.chat.services.factoid_agent.TavilySearch", MagicMock()):
            tool = WebSearchTool(
                factoid=sample_factoid,
                tavily_api_key="test-key",
                max_results=5,
            )
            assert tool._available is True

    @pytest.mark.django_db()
    def test_run_when_unavailable(self, sample_factoid):
        tool = WebSearchTool(
            factoid=sample_factoid,
            tavily_api_key=None,
            max_results=5,
        )

        result = tool._run(query="test query")

        assert result["error"] == "search_unavailable"
        assert result["detail"] == "Tavily search is not configured"
        assert result["results"] == []

    @pytest.mark.django_db()
    def test_run_with_empty_query_and_no_factoid_content(self):
        factoid = factoid_models.Factoid.objects.create(
            text="",
            subject="",
            emoji="🔬",
        )

        tool = WebSearchTool(
            factoid=factoid,
            tavily_api_key="test-key",
            max_results=5,
        )

        result = tool._run(query=None)

        assert "warning" in result
        assert "No query provided" in result["warning"]
        assert result["results"] == []

    @pytest.mark.django_db()
    def test_run_uses_factoid_subject_as_default_query(self, sample_factoid):
        with patch("apps.chat.services.factoid_agent.TavilySearch") as mock_tavily:
            mock_instance = MagicMock()
            mock_instance.invoke.return_value = {"results": []}
            mock_tavily.return_value = mock_instance

            tool = WebSearchTool(
                factoid=sample_factoid,
                tavily_api_key="test-key",
                max_results=5,
            )

            result = tool._run(query=None)

            assert result["query"] == "Chemistry"
            mock_instance.invoke.assert_called_once_with({"query": "Chemistry"})

    @pytest.mark.django_db()
    def test_run_uses_factoid_text_when_no_subject(self):
        factoid = factoid_models.Factoid.objects.create(
            text="Interesting fact about nature",
            subject="",
            emoji="🌿",
        )

        with patch("apps.chat.services.factoid_agent.TavilySearch") as mock_tavily:
            mock_instance = MagicMock()
            mock_instance.invoke.return_value = {"results": []}
            mock_tavily.return_value = mock_instance

            tool = WebSearchTool(
                factoid=factoid,
                tavily_api_key="test-key",
                max_results=5,
            )

            result = tool._run(query=None)

            assert result["query"] == "Interesting fact about nature"

    @pytest.mark.django_db()
    def test_run_with_explicit_query(self, sample_factoid):
        with patch("apps.chat.services.factoid_agent.TavilySearch") as mock_tavily:
            mock_instance = MagicMock()
            mock_instance.invoke.return_value = {"results": []}
            mock_tavily.return_value = mock_instance

            tool = WebSearchTool(
                factoid=sample_factoid,
                tavily_api_key="test-key",
                max_results=5,
            )

            result = tool._run(query="custom search query")

            assert result["query"] == "custom search query"
            mock_instance.invoke.assert_called_once_with({"query": "custom search query"})

    @pytest.mark.django_db()
    def test_run_limits_max_results(self, sample_factoid):
        with patch("apps.chat.services.factoid_agent.TavilySearch") as mock_tavily:
            mock_instance = MagicMock()
            mock_instance.invoke.return_value = {"results": []}
            mock_tavily.return_value = mock_instance

            tool = WebSearchTool(
                factoid=sample_factoid,
                tavily_api_key="test-key",
                max_results=3,
            )

            # Request more than max_results
            tool._run(query="test", max_results=10)

            # Should be limited to tool's max_results
            mock_tavily.assert_called_once_with(
                max_results=3,
                tavily_api_key="test-key",
            )

    @pytest.mark.django_db()
    def test_run_handles_tavily_exception(self, sample_factoid):
        with patch("apps.chat.services.factoid_agent.TavilySearch") as mock_tavily:
            mock_instance = MagicMock()
            mock_instance.invoke.side_effect = Exception("Network error")
            mock_tavily.return_value = mock_instance

            tool = WebSearchTool(
                factoid=sample_factoid,
                tavily_api_key="test-key",
                max_results=5,
            )

            result = tool._run(query="test")

            assert result["error"] == "search_failed"
            assert result["detail"] == "Network error"
            assert result["results"] == []

    @pytest.mark.django_db()
    def test_run_successful_search(self, sample_factoid):
        mock_results = [
            {"title": "Test Result", "content": "Test content", "url": "http://example.com"}
        ]

        with patch("apps.chat.services.factoid_agent.TavilySearch") as mock_tavily:
            mock_instance = MagicMock()
            mock_instance.invoke.return_value = {"results": mock_results}
            mock_tavily.return_value = mock_instance

            tool = WebSearchTool(
                factoid=sample_factoid,
                tavily_api_key="test-key",
                max_results=5,
            )

            result = tool._run(query="test")

            assert result["query"] == "test"
            assert result["source"] == "tavily"
            assert len(result["results"]) == 1
            assert result["results"][0]["title"] == "Test Result"


class TestBuildSearchTool:
    """Tests for the _build_search_tool function."""

    @pytest.mark.django_db()
    def test_builds_tool_when_tavily_unavailable(self, sample_factoid):
        with patch("apps.chat.services.factoid_agent.TavilySearch", None):
            tool = _build_search_tool(
                factoid=sample_factoid,
                tavily_api_key="test-key",
                max_results=5,
            )

            assert isinstance(tool, WebSearchTool)
            assert tool._available is False

    @pytest.mark.django_db()
    def test_builds_tool_when_tavily_available(self, sample_factoid):
        with patch("apps.chat.services.factoid_agent.TavilySearch", MagicMock()):
            tool = _build_search_tool(
                factoid=sample_factoid,
                tavily_api_key="test-key",
                max_results=5,
            )

            assert isinstance(tool, WebSearchTool)
            assert tool._tavily_api_key == "test-key"


class TestFactoidAgent:
    """Tests for the FactoidAgent class."""

    @pytest.mark.django_db()
    @patch("apps.chat.services.factoid_agent.ChatOpenAI")
    @patch("apps.chat.services.factoid_agent._build_search_tool")
    def test_init_configures_model(
        self,
        mock_build_search,
        mock_chat_openai,
        sample_factoid,
        agent_config,
    ):
        mock_build_search.return_value = None
        mock_model_instance = MagicMock()
        mock_chat_openai.return_value = mock_model_instance

        FactoidAgent(
            factoid=sample_factoid,
            config=agent_config,
            posthog_client=None,
        )

        mock_chat_openai.assert_called_once_with(
            api_key=getattr(settings, "OPENROUTER_API_KEY", None),
            base_url=getattr(
                settings, "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
            ).rstrip("/"),
            model="gpt-4",
            temperature=0.7,
        )

    @pytest.mark.django_db()
    @patch("apps.chat.services.factoid_agent.ChatOpenAI")
    @patch("apps.chat.services.factoid_agent._build_search_tool")
    def test_init_binds_tools_when_available(
        self,
        mock_build_search,
        mock_chat_openai,
        sample_factoid,
        agent_config,
    ):
        mock_tool = MagicMock()
        mock_build_search.return_value = mock_tool
        mock_model_instance = MagicMock()
        mock_bound_model = MagicMock()
        mock_model_instance.bind_tools.return_value = mock_bound_model
        mock_chat_openai.return_value = mock_model_instance

        FactoidAgent(
            factoid=sample_factoid,
            config=agent_config,
            posthog_client=None,
        )

        mock_model_instance.bind_tools.assert_called_once_with([mock_tool], tool_choice="auto")

    @pytest.mark.django_db()
    @patch("apps.chat.services.factoid_agent.ChatOpenAI")
    @patch("apps.chat.services.factoid_agent._build_search_tool")
    def test_call_model_includes_system_message(
        self,
        mock_build_search,
        mock_chat_openai,
        sample_factoid,
        agent_config,
    ):
        mock_build_search.return_value = None
        mock_model_instance = MagicMock()
        mock_model_instance.invoke.return_value = AIMessage(content="Test response")
        mock_chat_openai.return_value = mock_model_instance

        agent = FactoidAgent(
            factoid=sample_factoid,
            config=agent_config,
            posthog_client=None,
        )

        state = {"messages": [HumanMessage(content="Hello")]}
        agent._call_model(state, {})

        # Should invoke with system message + state messages
        called_messages = mock_model_instance.invoke.call_args[0][0]
        assert len(called_messages) == 2
        assert isinstance(called_messages[0], SystemMessage)
        assert isinstance(called_messages[1], HumanMessage)
        assert called_messages[1].content == "Hello"

    @pytest.mark.django_db()
    @patch("apps.chat.services.factoid_agent.ChatOpenAI")
    @patch("apps.chat.services.factoid_agent._build_search_tool")
    def test_run_processes_history(
        self,
        mock_build_search,
        mock_chat_openai,
        sample_factoid,
        agent_config,
    ):
        mock_build_search.return_value = None
        mock_model_instance = MagicMock()
        mock_model_instance.invoke.return_value = AIMessage(content="Test response")
        mock_chat_openai.return_value = mock_model_instance

        agent = FactoidAgent(
            factoid=sample_factoid,
            config=agent_config,
            posthog_client=None,
        )

        # Mock the graph's invoke method
        with patch.object(agent._graph, "invoke") as mock_invoke:
            mock_invoke.return_value = {"messages": [AIMessage(content="Response")]}

            history = [HumanMessage(content="Hello")]
            agent.run(history, callbacks=None)

            mock_invoke.assert_called_once()
            called_state = mock_invoke.call_args[0][0]
            assert called_state["messages"] == history


class TestRunFactoidAgent:
    """Tests for the run_factoid_agent function."""

    @pytest.mark.django_db()
    @patch("apps.chat.services.factoid_agent.FactoidAgent")
    @patch("apps.chat.services.factoid_agent.get_posthog_client")
    @patch("apps.chat.services.factoid_agent._build_callbacks")
    def test_uses_default_model_when_none_provided(
        self, mock_build_callbacks, mock_get_posthog, mock_agent_class, sample_factoid, chat_session
    ):
        mock_agent_instance = MagicMock()
        mock_agent_instance.run.return_value = [AIMessage(content="Response")]
        mock_agent_class.return_value = mock_agent_instance
        mock_get_posthog.return_value = None
        mock_build_callbacks.return_value = []

        with patch.object(settings, "FACTOID_AGENT_DEFAULT_MODEL", "test-default-model"):
            run_factoid_agent(
                factoid=sample_factoid,
                session=chat_session,
                history=[],
                model_key=None,
                temperature=None,
                distinct_id="test-user",
                posthog_properties=None,
            )

        # Check that FactoidAgent was initialized with default model
        mock_agent_class.assert_called_once()
        config = mock_agent_class.call_args[1]["config"]
        assert config.model_key == "test-default-model"

    @pytest.mark.django_db()
    @patch("apps.chat.services.factoid_agent.FactoidAgent")
    @patch("apps.chat.services.factoid_agent.get_posthog_client")
    @patch("apps.chat.services.factoid_agent._build_callbacks")
    def test_uses_provided_model_and_temperature(
        self, mock_build_callbacks, mock_get_posthog, mock_agent_class, sample_factoid, chat_session
    ):
        mock_agent_instance = MagicMock()
        mock_agent_instance.run.return_value = [AIMessage(content="Response")]
        mock_agent_class.return_value = mock_agent_instance
        mock_get_posthog.return_value = None
        mock_build_callbacks.return_value = []

        run_factoid_agent(
            factoid=sample_factoid,
            session=chat_session,
            history=[],
            model_key="gpt-3.5-turbo",
            temperature=0.5,
            distinct_id="test-user",
            posthog_properties={"custom": "prop"},
        )

        # Check that FactoidAgent was initialized with provided values
        mock_agent_class.assert_called_once()
        config = mock_agent_class.call_args[1]["config"]
        assert config.model_key == "gpt-3.5-turbo"
        assert config.temperature == 0.5
        assert config.distinct_id == "test-user"
        assert config.trace_id == str(chat_session.id)

    @pytest.mark.django_db()
    @patch("apps.chat.services.factoid_agent.FactoidAgent")
    @patch("apps.chat.services.factoid_agent.get_posthog_client")
    @patch("apps.chat.services.factoid_agent._build_callbacks")
    def test_merges_posthog_properties_with_factoid_id(
        self, mock_build_callbacks, mock_get_posthog, mock_agent_class, sample_factoid, chat_session
    ):
        mock_agent_instance = MagicMock()
        mock_agent_instance.run.return_value = [AIMessage(content="Response")]
        mock_agent_class.return_value = mock_agent_instance
        mock_get_posthog.return_value = None
        mock_build_callbacks.return_value = []

        run_factoid_agent(
            factoid=sample_factoid,
            session=chat_session,
            history=[],
            model_key="gpt-4",
            temperature=0.7,
            distinct_id="test-user",
            posthog_properties={"custom": "prop"},
        )

        # Check that posthog_properties includes factoid_id
        config = mock_agent_class.call_args[1]["config"]
        assert config.posthog_properties["custom"] == "prop"
        assert config.posthog_properties["factoid_id"] == str(sample_factoid.id)


class TestHistoryToMessages:
    """Tests for the history_to_messages function."""

    @pytest.mark.django_db()
    def test_converts_user_messages(self):
        chat_message = chat_models.ChatMessage.objects.create(
            role=chat_models.ChatMessageRole.USER, content={"text": "Hello there"}
        )

        messages = history_to_messages([chat_message])

        assert len(messages) == 1
        assert isinstance(messages[0], HumanMessage)
        assert messages[0].content == "Hello there"

    @pytest.mark.django_db()
    def test_converts_assistant_messages(self):
        chat_message = chat_models.ChatMessage.objects.create(
            role=chat_models.ChatMessageRole.ASSISTANT,
            content={
                "content": "Hello back",
                "additional_kwargs": {"model": "gpt-4"},
                "tool_calls": [],
            },
        )

        messages = history_to_messages([chat_message])

        assert len(messages) == 1
        assert isinstance(messages[0], AIMessage)
        assert messages[0].content == "Hello back"
        assert messages[0].additional_kwargs == {"model": "gpt-4"}

    @pytest.mark.django_db()
    def test_converts_tool_messages(self):
        chat_message = chat_models.ChatMessage.objects.create(
            role=chat_models.ChatMessageRole.TOOL,
            content={"content": "Search results here", "tool_call_id": "call_123"},
        )

        messages = history_to_messages([chat_message])

        assert len(messages) == 1
        assert isinstance(messages[0], ToolMessage)
        assert messages[0].content == "Search results here"
        assert messages[0].tool_call_id == "call_123"

    @pytest.mark.django_db()
    def test_skips_invalid_messages(self):
        # Create a message with an unknown role
        chat_message = chat_models.ChatMessage.objects.create(
            role="INVALID_ROLE",  # This will be saved as string
            content={"text": "This should be skipped"},
        )

        messages = history_to_messages([chat_message])

        # Should skip invalid messages
        assert len(messages) == 0

    def test_handles_empty_history(self):
        messages = history_to_messages([])
        assert messages == []


class TestSerialiseMessage:
    """Tests for the serialise_message function."""

    def test_serialises_human_message(self):
        message = HumanMessage(content="Hello world")

        role, payload = serialise_message(message)

        assert role == chat_models.ChatMessageRole.USER
        assert payload == {"text": "Hello world"}

    def test_serialises_ai_message_basic(self):
        message = AIMessage(content="Hello back")

        role, payload = serialise_message(message)

        assert role == chat_models.ChatMessageRole.ASSISTANT
        assert payload["content"] == "Hello back"

    def test_serialises_ai_message_with_tool_calls(self):
        from langchain_core.messages.tool import ToolCall

        message = AIMessage(
            content="Let me search for that",
            additional_kwargs={"model": "gpt-4"},
            tool_calls=[ToolCall(name="search", args={}, id="call_123")],
        )

        role, payload = serialise_message(message)

        assert role == chat_models.ChatMessageRole.ASSISTANT
        assert payload["content"] == "Let me search for that"
        assert payload["additional_kwargs"] == {"model": "gpt-4"}
        assert len(payload["tool_calls"]) == 1
        assert payload["tool_calls"][0]["name"] == "search"

    def test_serialises_tool_message(self):
        message = ToolMessage(content="Search results", tool_call_id="call_123")

        role, payload = serialise_message(message)

        assert role == chat_models.ChatMessageRole.TOOL
        assert payload == {"content": "Search results", "tool_call_id": "call_123"}

    def test_serialises_unknown_message_type(self):
        message = SystemMessage(content="System message")

        role, payload = serialise_message(message)

        # Should default to assistant role
        assert role == chat_models.ChatMessageRole.ASSISTANT
        assert payload == {"content": "System message"}


class TestUtilityFunctions:
    """Tests for utility functions."""

    def test_merge_properties_with_both_dicts(self):
        base = {"a": 1, "b": 2}
        extra = {"b": 3, "c": 4}

        result = _merge_properties(base, extra)

        assert result == {"a": 1, "b": 3, "c": 4}  # extra overwrites base

    def test_merge_properties_with_none_base(self):
        result = _merge_properties(None, {"a": 1})
        assert result == {"a": 1}

    def test_merge_properties_with_none_extra(self):
        result = _merge_properties({"a": 1}, None)
        assert result == {"a": 1}

    def test_merge_properties_with_both_none(self):
        result = _merge_properties(None, None)
        assert result == {}

    def test_normalise_search_results_with_dict_payload(self):
        payload = {
            "results": [
                {"title": "Test 1", "content": "Content 1", "url": "http://test1.com"},
                {"title": "Test 2", "snippet": "Content 2", "url": "http://test2.com"},
                {"name": "Test 3", "description": "Content 3", "link": "http://test3.com"},
            ]
        }

        results = _normalise_search_results(payload, 5)

        assert len(results) == 3
        assert results[0] == {"title": "Test 1", "snippet": "Content 1", "url": "http://test1.com"}
        assert results[1] == {"title": "Test 2", "snippet": "Content 2", "url": "http://test2.com"}
        assert results[2] == {"title": "Test 3", "snippet": "Content 3", "url": "http://test3.com"}

    def test_normalise_search_results_with_list_payload(self):
        payload = [
            {"title": "Test 1", "content": "Content 1", "url": "http://test1.com"},
            {"title": "Test 2", "content": "Content 2", "url": "http://test2.com"},
        ]

        results = _normalise_search_results(payload, 5)

        assert len(results) == 2
        assert results[0]["title"] == "Test 1"

    def test_normalise_search_results_respects_limit(self):
        payload = {
            "results": [
                {"title": f"Test {i}", "content": f"Content {i}", "url": f"http://test{i}.com"}
                for i in range(10)
            ]
        }

        results = _normalise_search_results(payload, 3)

        assert len(results) == 3

    def test_normalise_search_results_skips_invalid_items(self):
        payload = {
            "results": [
                {"title": "Valid", "url": "http://valid.com"},
                "invalid_string",
                {"description": "No title or url"},  # Should be skipped
                None,
                {"title": "Valid 2", "url": "http://valid2.com"},
            ]
        }

        results = _normalise_search_results(payload, 5)

        assert len(results) == 2
        assert results[0]["title"] == "Valid"
        assert results[1]["title"] == "Valid 2"
