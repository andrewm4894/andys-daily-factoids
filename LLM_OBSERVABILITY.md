# LLM Observability

This document provides a comprehensive overview of the LLM observability tools integrated into Andy's Daily Factoids. The project serves as a showcase for different observability approaches in production LLM applications.

## Overview

Andy's Daily Factoids integrates multiple observability platforms to demonstrate different approaches to monitoring, tracing, and evaluating LLM-powered applications. Each tool serves specific purposes and offers unique capabilities for understanding system behavior, debugging issues, and improving performance.

## Integrated Platforms

### 1. PostHog

**Purpose**: Product analytics and AI generation tracking
**Implementation**: Uses `posthog.ai.langchain.CallbackHandler` (native PostHog LangChain integration)
**Location**: `backend/apps/core/posthog.py`

#### Features
- Automatic `$ai_generation` event tracking via LangChain callbacks
- Exception autocapture with Django integration
- Synchronous mode in production to prevent event loss
- Group tracking by user profile

#### Implementation Details

**Client Configuration** (`apps/core/posthog.py:47-99`):
```python
def configure_posthog() -> Optional[Posthog]:
    client = Posthog(
        api_key,
        host=host,
        enable_exception_autocapture=True,
        sync_mode=use_sync_mode,  # True in production, False in dev
        flush_at=1,
        flush_interval=2.0,
        max_retries=2,
        timeout=10.0,
    )
```

**Callback Integration** (`apps/factoids/services/generator.py:198-205`):
```python
from posthog.ai.langchain import CallbackHandler

posthog_callback = CallbackHandler(
    client=posthog_client,
    distinct_id=distinct_id,
    trace_id=trace_id,
    properties=properties,
    groups={"profile": profile} if profile else None,
)
```

#### Configuration
- **API Key**: `POSTHOG_PROJECT_API_KEY` (`factoids_project/settings/config.py:67-70`)
- **Host**: `POSTHOG_HOST` (defaults to `https://us.i.posthog.com`)
- **Debug**: `POSTHOG_DEBUG` (boolean, default `False`)
- **Disabled**: `POSTHOG_DISABLED` (boolean, allows disabling without removing API key)
- **Client Hash**: Derived from IP + User-Agent in `apps/factoids/api.py` for anonymous tracking

### 2. Braintrust

**Purpose**: LLM evaluation and experiment tracking
**Implementation**: Uses `braintrust_langchain.BraintrustCallbackHandler` with global handler
**Location**: `backend/apps/core/braintrust.py`

#### Features
- Automatic LangChain tracing via global handler
- Project-level trace organization
- Operation metadata logging for filtering
- Manual callback handler creation for specific chains

#### Implementation Details

**Initialization** (`apps/core/braintrust.py:22-50`):
```python
from braintrust import init_logger
from braintrust_langchain import BraintrustCallbackHandler, set_global_handler

def initialize_braintrust() -> bool:
    init_logger(
        project="andys-daily-factoids",
        api_key=api_key,
    )

    # Global handler automatically traces all LangChain calls
    handler = BraintrustCallbackHandler()
    set_global_handler(handler)
```

**Callback Integration** (`apps/factoids/services/generator.py:207-218`):
```python
# Initialize Braintrust (sets up global handler automatically)
initialize_braintrust()

# Optionally add a specific callback for this generation
braintrust_callback = get_braintrust_callback_handler()
if braintrust_callback:
    callbacks.append(braintrust_callback)

# Log operation metadata for trace filtering
log_operation_metadata(
    "factoid_generation",
    service="generator",
    topic=topic,
    request_source=str(request_source)
)
```

#### Configuration
- **API Key**: `BRAINTRUST_API_KEY` (`factoids_project/settings/config.py:83-86`)
- **Project**: Hardcoded to `"andys-daily-factoids"` in `apps/core/braintrust.py:38`
- **Auto-logging**: Global handler automatically traces all LangChain calls once initialized

### 3. LangSmith

**Purpose**: LangChain-specific debugging and monitoring
**Implementation**: Environment variable-based auto-tracing + optional callback handler
**Location**: `backend/apps/core/langsmith.py`

#### Features
- Automatic LangChain tracing via environment variables
- Optional explicit callback handlers
- OpenAI client wrapping for non-LangChain calls
- Configurable project-level organization

#### Implementation Details

**Initialization** (`apps/core/langsmith.py:58-77`):
```python
def initialize_langsmith() -> None:
    # Set environment variables for automatic LangSmith tracing
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = api_key
    os.environ["LANGCHAIN_PROJECT"] = project_name
```

**Callback Handler** (`apps/core/langsmith.py:40-55`):
```python
from langsmith.callbacks import LangChainTracer

def get_langsmith_callback_handler() -> LangChainTracer | None:
    return LangChainTracer(project_name=project_name)
```

**Integration** (`apps/factoids/services/generator.py:220-226`):
```python
# Initialize LangSmith (sets up global tracing via env vars)
initialize_langsmith()

# Optionally add a specific callback for this generation
langsmith_callback = get_langsmith_callback_handler()
if langsmith_callback:
    callbacks.append(langsmith_callback)
```

#### Configuration
- **API Key**: `LANGSMITH_API_KEY` (`factoids_project/settings/config.py:87-90`)
- **Project**: `LANGSMITH_PROJECT` (default: `"andys-daily-factoids"`)
- **Tracing**: `LANGSMITH_TRACING` (boolean, default `False` - must be explicitly enabled)
- **Note**: Tracing is controlled via `LANGSMITH_TRACING` setting, not `LANGCHAIN_TRACING_V2`

### 4. Langfuse

**Purpose**: Open-source LLM observability
**Implementation**: Uses `langfuse.langchain.CallbackHandler` with cached client
**Location**: `backend/apps/core/langfuse.py`

#### Features
- Client initialization with caching
- Callback handler for LangChain integration
- Self-hostable alternative to commercial solutions
- Cloud or self-hosted deployment options

#### Implementation Details

**Client Initialization** (`apps/core/langfuse.py:23-53`):
```python
from langfuse import Langfuse

@lru_cache()
def get_langfuse_client() -> Langfuse | None:
    _client = Langfuse(
        public_key=public_key,
        secret_key=secret_key,
        host=host,
    )
    return _client
```

**Callback Handler** (`apps/core/langfuse.py:56-70`):
```python
from langfuse.langchain import CallbackHandler

def get_langfuse_callback_handler() -> CallbackHandler | None:
    # Ensures client is initialized first
    client = get_langfuse_client()
    if not client:
        return None

    return CallbackHandler()
```

**Integration** (`apps/factoids/services/generator.py:236-242`):
```python
# Initialize Langfuse tracing
initialize_langfuse()

# Optionally add a specific callback for this generation
langfuse_callback = get_langfuse_callback_handler()
if langfuse_callback:
    callbacks.append(langfuse_callback)
```

#### Configuration
- **Public Key**: `LANGFUSE_PUBLIC_KEY` (`factoids_project/settings/config.py:119-122`)
- **Secret Key**: `LANGFUSE_SECRET_KEY` (`factoids_project/settings/config.py:123-126`)
- **Host**: `LANGFUSE_HOST` (default: `https://cloud.langfuse.com`)
- **Enabled**: Automatically enabled when both keys are present

## Implementation Patterns

### Unified Integration Point

All handlers are registered in the `_build_callbacks` function (`apps/factoids/services/generator.py:175-244`):

```python
def _build_callbacks(
    posthog_client: Posthog | None,
    *,
    distinct_id: str,
    trace_id: str,
    topic: str,
    profile: str,
    request_source: models.RequestSource,
    extra_properties: Optional[dict[str, Any]] = None,
) -> list[Any]:
    callbacks = []

    # PostHog callback (explicit)
    if posthog_client:
        posthog_callback = CallbackHandler(
            client=posthog_client,
            distinct_id=distinct_id,
            trace_id=trace_id,
            properties=properties,
            groups={"profile": profile} if profile else None,
        )
        callbacks.append(posthog_callback)

    # Braintrust (global handler + optional explicit callback)
    initialize_braintrust()
    braintrust_callback = get_braintrust_callback_handler()
    if braintrust_callback:
        callbacks.append(braintrust_callback)

    # LangSmith (environment variables + optional explicit callback)
    initialize_langsmith()
    langsmith_callback = get_langsmith_callback_handler()
    if langsmith_callback:
        callbacks.append(langsmith_callback)

    # Datadog (if configured)
    initialize_datadog()
    datadog_callback = get_datadog_callback_handler()
    if datadog_callback:
        callbacks.append(datadog_callback)

    # Langfuse (client initialization + callback)
    initialize_langfuse()
    langfuse_callback = get_langfuse_callback_handler()
    if langfuse_callback:
        callbacks.append(langfuse_callback)

    return callbacks
```

### Metadata Enrichment

PostHog receives enriched metadata (`apps/factoids/services/generator.py:189-196`):

```python
properties = {
    "topic": topic,
    "profile": profile,
    "request_source": str(request_source),
    "generation_request_id": trace_id,
}
if extra_properties:
    properties.update(extra_properties)
```

Braintrust receives operation metadata for filtering (`apps/factoids/services/generator.py:216-218`):

```python
log_operation_metadata(
    "factoid_generation",
    service="generator",
    topic=topic,
    request_source=str(request_source)
)
```

## Use Cases by Platform

### PostHog
- **Product Analytics**: Track feature adoption and user engagement
- **Cost Analysis**: Monitor OpenRouter spending by user segment
- **Performance Monitoring**: Identify slow generations and optimize
- **A/B Testing**: Compare different prompts or models

### Braintrust
- **Quality Evaluation**: Run automated evals on factoid quality
- **Regression Testing**: Ensure changes don't degrade output
- **Prompt Engineering**: Compare prompt variations systematically
- **Dataset Curation**: Build test sets from production data

### LangSmith
- **Debugging**: Trace complex agent interactions
- **Development**: Iterate on prompts with immediate feedback
- **Monitoring**: Track production issues and anomalies
- **Optimization**: Identify inefficient chain patterns

### Langfuse
- **Session Tracking**: Follow user journeys across multiple generations
- **Prompt Management**: Version and track prompt performance
- **Cost Analysis**: Detailed breakdown of LLM costs
- **Open Source**: Self-host for data sovereignty

## Evaluation Framework

The project uses Braintrust for evaluation tracking. Evaluation scripts are located in `backend/evals/` and `backend/scripts/`:

- **Daily Evaluation**: `backend/scripts/daily_eval_cron.py` - Automated daily quality checks
- **Manual Evaluation**: Run via `make eval-daily` or `make eval-manual` (see `Makefile:119-126`)

Evaluation dependencies are installed separately via `make eval-install` which installs `braintrust` and `autoevals` packages.

## Best Practices

### 1. Graceful Degradation
All observability integrations are optional and handled gracefully:

**Import-time safety** (all integration modules use try/except for imports):
```python
# Example from apps/core/posthog.py:13-22
try:
    from posthog import Posthog
except ImportError:
    Posthog = None  # type: ignore
```

**Runtime checks** (functions return None if not configured):
```python
# Example from apps/core/braintrust.py:22-28
def initialize_braintrust() -> bool:
    if not init_logger or not BraintrustCallbackHandler:
        logger.info("Braintrust not available - install with 'pip install braintrust'")
        return False

    api_key = getattr(settings, "BRAINTRUST_API_KEY", None)
    if not api_key:
        logger.info("Braintrust API key not configured")
        return False
```

### 2. Minimal Performance Impact

**PostHog synchronous mode** (`apps/core/posthog.py:71-77`):
```python
# Synchronous in production to avoid consumer thread issues
use_sync_mode = getattr(settings, "POSTHOG_SYNC_MODE", not settings.DEBUG)

client = Posthog(
    api_key,
    host=host,
    sync_mode=use_sync_mode,  # True in production, False in dev
    flush_at=1,
    flush_interval=2.0,
)
```

**Langfuse client caching** (`apps/core/langfuse.py:23`):
```python
@lru_cache()
def get_langfuse_client() -> Langfuse | None:
    # Client is initialized once and reused
```

### 3. Privacy Considerations
- Client hashing: User identity derived from IP + User-Agent (`apps/factoids/api.py`)
- No PII stored: PostHog `distinct_id` uses hashed client identifier
- Profile grouping: Users grouped by profile type (anonymous, api_key) not individuals

### 4. Cost Management
- All platforms optional: No cost incurred unless API keys configured
- LangSmith tracing: Must be explicitly enabled via `LANGSMITH_TRACING=true`
- PostHog can be disabled: Set `POSTHOG_DISABLED=true` to disable without removing API key

## Environment Configuration

All observability platforms are **optional**. The application works without any observability configured.

### Configuration Settings

Settings are defined in `factoids_project/settings/config.py` and mapped to Django settings in `factoids_project/settings/base.py`.

**PostHog** (`config.py:67-82`, `base.py:148-151`):
```bash
POSTHOG_PROJECT_API_KEY=phx_xxxxx
POSTHOG_HOST=https://us.i.posthog.com  # default
POSTHOG_DEBUG=false                     # default
POSTHOG_DISABLED=false                  # default
```

**Braintrust** (`config.py:83-86`, `base.py:153`):
```bash
BRAINTRUST_API_KEY=bt_xxxxx
# Project name is hardcoded to "andys-daily-factoids" in apps/core/braintrust.py:38
```

**LangSmith** (`config.py:87-98`, `base.py:156-158`):
```bash
LANGSMITH_API_KEY=ls_xxxxx
LANGSMITH_PROJECT=andys-daily-factoids  # default
LANGSMITH_TRACING=true                  # must be explicitly enabled, default is false
# Note: LANGCHAIN_TRACING_V2 is set internally by initialize_langsmith()
```

**Langfuse** (`config.py:119-130`, `base.py:167-169`):
```bash
LANGFUSE_PUBLIC_KEY=pk_xxxxx
LANGFUSE_SECRET_KEY=sk_xxxxx
LANGFUSE_HOST=https://cloud.langfuse.com  # default
```

## Testing Observability

### Manual Testing Commands

Available via Makefile (see `Makefile:83-96`):

```bash
# Generate factoid via Django service layer (includes PostHog when configured)
make test-generate-factoid

# Test Braintrust integration setup and configuration
make test-braintrust

# Test simple LangChain call with Braintrust tracing
make test-braintrust-simple

# Test Langfuse integration with full factoid generation
make test-langfuse

# Test simple LangChain call with Langfuse tracing
make test-langfuse-simple

# Quick API sanity check
make smoke-backend-api
```

### Test Scripts

**Braintrust** (`backend/scripts/test_braintrust_integration.py`):
- Verifies API key configuration
- Tests `initialize_braintrust()` function
- Creates callback handler
- Reports next steps with dashboard URL

**Langfuse** (`backend/scripts/test_langfuse_integration.py` and `test_langfuse_simple.py`):
- Tests full factoid generation with Langfuse tracing
- Tests simple LangChain calls with callback handler

**LangSmith** (`backend/scripts/test_langsmith_integration.py` and `test_langsmith_simple.py`):
- Tests integration configuration
- Validates environment variable setup

## Debugging Guide

### PostHog Not Capturing Events
1. **Check configuration**: Verify `POSTHOG_PROJECT_API_KEY` is set in settings
2. **Check disabled flag**: Ensure `POSTHOG_DISABLED` is not `true`
3. **Check import**: Verify `posthog` package is installed (`pip install posthog`)
4. **Check sync mode**: In production, sync_mode is `True` by default (see `apps/core/posthog.py:71`)
5. **Check logs**: Look for "PostHog configured" message in Django logs

### Braintrust Traces Missing
1. **Check API key**: Verify `BRAINTRUST_API_KEY` is set
2. **Check packages**: Ensure both `braintrust` and `braintrust-langchain` are installed
3. **Run test**: Use `make test-braintrust` to verify setup
4. **Check initialization**: Look for "Braintrust initialized successfully" in logs (`apps/core/braintrust.py:46`)
5. **Dashboard**: Check https://www.braintrust.dev/ for "andys-daily-factoids" project

### LangSmith Not Tracing
1. **Check API key**: Verify `LANGSMITH_API_KEY` is set
2. **Enable tracing**: Set `LANGSMITH_TRACING=true` (it's `False` by default!)
3. **Check environment**: After initialization, verify `LANGCHAIN_TRACING_V2` env var is set
4. **Check initialization**: Look for "LangSmith tracing initialized" log (`apps/core/langsmith.py:77`)
5. **Run test**: Use `make test-langsmith-simple` to verify

### Langfuse Not Recording
1. **Check keys**: Verify both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set
2. **Check package**: Ensure `langfuse` is installed (`pip install langfuse`)
3. **Check client**: Look for "Langfuse client initialized successfully" log (`apps/core/langfuse.py:49`)
4. **Run test**: Use `make test-langfuse-simple` to verify
5. **Check host**: Default is `https://cloud.langfuse.com`, verify if using self-hosted

## Contributing

To add a new observability platform:

1. **Create integration module** in `backend/apps/core/{platform}.py`
   - Use try/except for optional imports (see existing integrations)
   - Implement client initialization with caching if appropriate
   - Create callback handler getter function
   - Create initialization function

2. **Add configuration** to `backend/factoids_project/settings/config.py`
   - Add settings fields to `AppSettings` class with proper validation aliases
   - Include defaults and optional flags

3. **Map to Django settings** in `backend/factoids_project/settings/base.py`
   - Add settings mappings (e.g., `PLATFORM_API_KEY = settings.platform_api_key`)

4. **Register in generator** (`backend/apps/factoids/services/generator.py`)
   - Import initialization and callback functions
   - Add to `_build_callbacks` function following existing pattern
   - Call initialization and conditionally append callback

5. **Create test script** in `backend/scripts/test_{platform}_integration.py`
   - Verify API key configuration
   - Test initialization
   - Test callback handler creation
   - Provide next steps guidance

6. **Add Makefile target** for easy testing

7. **Update this documentation** with code references and line numbers

## Resources

- [PostHog AI Analytics](https://posthog.com/docs/ai-engineering)
- [PostHog LangChain Integration](https://posthog.com/docs/ai-engineering/langchain-integration)
- [Braintrust Documentation](https://www.braintrust.dev/docs)
- [Braintrust LangChain Integration](https://www.braintrust.dev/docs/integrations/langchain)
- [LangSmith Guide](https://docs.smith.langchain.com/)
- [Langfuse Documentation](https://langfuse.com/docs)
- [Langfuse LangChain Integration](https://langfuse.com/docs/integrations/langchain/tracing)