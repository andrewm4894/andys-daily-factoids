# LLM Observability

This document provides a comprehensive overview of the LLM observability tools integrated into Andy's Daily Factoids. The project serves as a showcase for different observability approaches in production LLM applications.

## Overview

Andy's Daily Factoids integrates multiple observability platforms to demonstrate different approaches to monitoring, tracing, and evaluating LLM-powered applications. Each tool serves specific purposes and offers unique capabilities for understanding system behavior, debugging issues, and improving performance.

## Integrated Platforms

### 1. PostHog

**Purpose**: Product analytics and AI generation tracking
**Implementation**: Custom callback handler with event capture
**Location**: `backend/apps/core/posthog.py`

#### Features
- Tracks `$ai_generation` events with comprehensive metadata
- Captures user interactions and feature usage
- Provides cost tracking and model performance metrics
- Supports both anonymous and authenticated user tracking

#### Implementation Details
```python
# Custom callback handler
class PosthogCallbackHandler(BaseCallbackHandler):
    - on_llm_start: Captures generation initialization
    - on_llm_end: Records completion with tokens and cost
    - on_llm_error: Logs generation failures
```

#### Event Structure
```json
{
  "event": "$ai_generation",
  "properties": {
    "model": "anthropic/claude-3.5-sonnet",
    "prompt_tokens": 1234,
    "completion_tokens": 567,
    "total_tokens": 1801,
    "cost": 0.0234,
    "duration": 2.34,
    "status": "success"
  }
}
```

#### Configuration
- **API Key**: `POSTHOG_PROJECT_API_KEY`
- **Host**: `POSTHOG_HOST` (defaults to PostHog Cloud)
- **Client Hash**: Derived from IP + User-Agent for anonymous tracking

### 2. Braintrust

**Purpose**: LLM evaluation and experiment tracking
**Implementation**: Native LangChain integration
**Location**: `backend/apps/core/braintrust.py`

#### Features
- Structured tracing for LLM calls
- Experiment tracking and A/B testing support
- Model performance benchmarking
- Dataset management for evaluations

#### Implementation Details
```python
from braintrust.langchain import BraintrustTracer

# Integration with LangChain
callbacks = [BraintrustTracer(
    project=settings.BRAINTRUST_PROJECT_NAME,
    tags=["production", "factoid_generation"]
)]
```

#### Trace Structure
- Hierarchical spans for request lifecycle
- Input/output capture at each stage
- Metadata including prompts, model parameters, and responses
- Cost and latency metrics

#### Configuration
- **API Key**: `BRAINTRUST_API_KEY`
- **Project**: `BRAINTRUST_PROJECT_NAME` (default: "factoids")
- **Auto-logging**: Enabled by default for all LangChain calls

### 3. LangSmith

**Purpose**: LangChain-specific debugging and monitoring
**Implementation**: Native LangChain integration
**Location**: `backend/apps/core/langsmith.py`

#### Features
- Deep integration with LangChain components
- Run tree visualization
- Prompt versioning and management
- Detailed token usage analysis

#### Implementation Details
```python
from langsmith import Client
from langsmith.run_helpers import traceable

# Automatic tracing via environment variables
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = settings.LANGSMITH_API_KEY
```

#### Trace Information
- Complete call chains with intermediate steps
- Tool usage in agent interactions
- Retry logic and error handling
- Streaming token tracking

#### Configuration
- **API Key**: `LANGSMITH_API_KEY`
- **Project**: `LANGCHAIN_PROJECT` (default: "factoids")
- **Tracing**: `LANGCHAIN_TRACING_V2=true`
- **Endpoint**: `LANGCHAIN_ENDPOINT` (optional)

### 4. Langfuse

**Purpose**: Open-source LLM observability
**Implementation**: Custom callback handler via langfuse-langchain package
**Location**: `backend/apps/core/langfuse.py`

#### Features
- Session tracking and user journey analysis
- Prompt management and versioning
- Cost tracking and optimization insights
- Self-hostable alternative to commercial solutions

#### Implementation Details
```python
from langfuse.callback import CallbackHandler as LangfuseCallbackHandler

# Integration with LangChain
callbacks = [LangfuseCallbackHandler(
    public_key=settings.LANGFUSE_PUBLIC_KEY,
    secret_key=settings.LANGFUSE_SECRET_KEY,
    host=settings.LANGFUSE_HOST,
    session_id=request.client_hash,
    user_id=request.client_hash,
    tags=["production", "factoid_generation"]
)]
```

#### Configuration
- **Public Key**: `LANGFUSE_PUBLIC_KEY`
- **Secret Key**: `LANGFUSE_SECRET_KEY`
- **Host**: `LANGFUSE_HOST` (defaults to Langfuse Cloud)
- **Enabled**: Automatically enabled when keys are present

## Implementation Patterns

### Callback Handler Architecture

All observability integrations follow a consistent callback pattern:

```python
class ObservabilityCallbackHandler(BaseCallbackHandler):
    def on_llm_start(self, serialized, prompts, **kwargs):
        # Track generation start
        pass

    def on_llm_end(self, response, **kwargs):
        # Record completion metrics
        pass

    def on_llm_error(self, error, **kwargs):
        # Log failures
        pass
```

### Unified Integration Point

All handlers are registered in the service layer:

```python
# backend/apps/factoids/services/generator.py
callbacks = []

if settings.POSTHOG_PROJECT_API_KEY:
    callbacks.append(PosthogCallbackHandler(...))

if settings.BRAINTRUST_API_KEY:
    callbacks.append(BraintrustTracer(...))

if settings.LANGFUSE_PUBLIC_KEY and settings.LANGFUSE_SECRET_KEY:
    callbacks.append(LangfuseCallbackHandler(...))

if settings.LANGSMITH_API_KEY:
    # LangSmith auto-configures via env vars
    pass

# Use with LangChain
llm.invoke(prompt, config={"callbacks": callbacks})
```

### Metadata Enrichment

Each platform receives enriched metadata:

```python
metadata = {
    "client_hash": request.client_hash,
    "profile": request.user_profile,
    "request_id": str(uuid.uuid4()),
    "environment": settings.ENVIRONMENT,
    "version": settings.VERSION,
    "feature_flags": get_feature_flags(request)
}
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

The project includes a comprehensive evaluation system:

```python
# backend/scripts/eval_factoids.py
class FactoidEvaluator:
    - evaluate_quality: 1-5 scale rating
    - evaluate_truthfulness: Fact-checking via web search
    - evaluate_interestingness: Engagement scoring
    - evaluate_uniqueness: Deduplication analysis
```

### Metrics Tracked
- **Quality Score**: Overall factoid quality (1-5)
- **Truthfulness**: Verified via external sources
- **Uniqueness**: Similarity to recent factoids
- **Generation Time**: End-to-end latency
- **Cost**: Per-factoid generation cost
- **Error Rate**: Failed generation percentage

## Best Practices

### 1. Graceful Degradation
All observability integrations are optional:
```python
try:
    if settings.POSTHOG_PROJECT_API_KEY:
        setup_posthog()
except Exception as e:
    logger.warning(f"PostHog setup failed: {e}")
    # Continue without PostHog
```

### 2. Minimal Performance Impact
- Async event capture where possible
- Batch uploads for high-volume events
- Sampling for expensive operations
- Local caching to reduce API calls

### 3. Privacy Considerations
- Hash user identifiers
- Exclude PII from events
- Respect opt-out preferences
- Comply with data retention policies

### 4. Cost Management
- Monitor API usage for each platform
- Set up alerts for unusual activity
- Use sampling for high-volume endpoints
- Leverage free tiers effectively

## Environment Configuration

### Required for Basic Operation
```bash
# At least one observability platform recommended
POSTHOG_PROJECT_API_KEY=phx_xxxxx
# OR
BRAINTRUST_API_KEY=bt_xxxxx
# OR
LANGSMITH_API_KEY=ls_xxxxx
```

### Full Observability Stack
```bash
# PostHog Configuration
POSTHOG_PROJECT_API_KEY=phx_xxxxx
POSTHOG_HOST=https://app.posthog.com  # or self-hosted URL

# Braintrust Configuration
BRAINTRUST_API_KEY=bt_xxxxx
BRAINTRUST_PROJECT_NAME=factoids

# LangSmith Configuration
LANGSMITH_API_KEY=ls_xxxxx
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=factoids
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com  # optional

# Langfuse Configuration
LANGFUSE_PUBLIC_KEY=pk_xxxxx
LANGFUSE_SECRET_KEY=sk_xxxxx
LANGFUSE_HOST=https://cloud.langfuse.com  # or self-hosted
```

## Testing Observability

### Manual Testing
```bash
# Generate factoid with all platforms enabled
make test-generate-factoid

# Check specific platform
curl http://localhost:8000/api/factoids/debug/observability/
```

### Integration Tests
```python
# backend/apps/factoids/tests/test_observability.py
def test_posthog_events_captured():
    with mock.patch('posthog.capture') as mock_capture:
        generate_factoid()
        assert mock_capture.called
        assert mock_capture.call_args[0][1] == "$ai_generation"

def test_braintrust_trace_created():
    # Verify trace appears in Braintrust project
    pass

def test_langsmith_run_logged():
    # Confirm run visible in LangSmith UI
    pass

def test_langfuse_trace_created():
    # Verify trace appears in Langfuse dashboard
    pass
```

## Debugging Guide

### PostHog Not Capturing Events
1. Verify API key is correct
2. Check network connectivity to PostHog
3. Enable debug mode: `posthog.debug = True`
4. Review logs for capture errors

### Braintrust Traces Missing
1. Confirm API key has write permissions
2. Verify project name matches
3. Check for LangChain version compatibility
4. Review callback registration

### LangSmith Not Tracing
1. Ensure environment variables are set
2. Verify LANGCHAIN_TRACING_V2 is "true" (string)
3. Check API key permissions
4. Test with simple LangChain script

### Langfuse Not Recording
1. Check both public and secret keys are set
2. Verify host URL is correct
3. Review network connectivity
4. Check callback registration in generator.py

## Contributing

To add a new observability platform:

1. Create handler in `backend/apps/core/{platform}.py`
2. Implement BaseCallbackHandler interface
3. Add configuration to settings
4. Register in `generator.py`
5. Add tests in `test_observability.py`
6. Update this documentation

## Resources

- [PostHog AI Docs](https://posthog.com/docs/product-analytics/llm-analytics)
- [Braintrust Documentation](https://www.braintrust.dev/docs)
- [LangSmith Guide](https://docs.smith.langchain.com/)
- [Langfuse Documentation](https://langfuse.com/docs)
- [LangChain Callbacks](https://python.langchain.com/docs/modules/callbacks/)