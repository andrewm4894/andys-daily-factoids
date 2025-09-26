# Factoid Quality Evaluation

Unified quality evaluation system for Andy's Daily Factoids using Braintrust.

## Overview

Single `eval.py` script provides **flexible factoid evaluation** with three key quality metrics:

- **🏗️ Structure Quality**: Validates JSON parsing and required fields
- **✅ Truthfulness Quality**: LLM-as-judge evaluation using GPT-4
- **👥 User Feedback**: Score based on user votes (up/down ratio)

## Usage

### Quick Commands
```bash
# Daily automated evaluation (20 factoids, hybrid approach)
make eval-daily

# Manual evaluation (100 factoids, hybrid approach)
make eval-manual
```

### Direct Script Usage
```bash
# Basic usage
uv run python evals/eval.py

# Hybrid evaluation (default approach)
uv run python evals/eval.py --hybrid --sample-size 50 --experiment-name "my-test"

# Fast mode (no API calls)
uv run python evals/eval.py --hybrid --skip-truthfulness

# Daily mode (auto-generates date-based experiment name)
uv run python evals/eval.py --daily --hybrid --sample-size 20

# Production mode (uses production Django settings)
uv run python evals/eval.py --production --daily --hybrid --sample-size 20
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--sample-size` | 20 | Number of recent factoids to evaluate |
| `--experiment-name` | Auto-generated | Custom Braintrust experiment name |
| `--skip-truthfulness` | False | Skip LLM evaluation to avoid API calls |
| `--daily` | False | Use daily mode (date-based experiment naming) |
| `--production` | False | Use production Django settings |
| `--hybrid` | False | Use hybrid approach: Braintrust traces for structure, DB for user feedback |

## Production Automation

**Render Cron Job** runs daily at noon UTC:
```yaml
- type: cron
  name: daily-eval
  schedule: "0 12 * * *"
  startCommand: uv run python evals/eval.py --daily --hybrid --production --sample-size 20
```

## Files

- **`eval.py`**: Unified evaluation script with hybrid approach support
- **`braintrust_traces.py`**: Braintrust API integration for trace retrieval
- **`scorers.py`**: Custom Braintrust scoring functions
- **`test_scorers.py`**: Validation tests for scorers

## Results

All results stored in "andys-daily-factoids" project in Braintrust:
🔗 https://www.braintrust.dev/app/andys-daily-factoids

### Experiment Naming
- **Daily mode**: `daily-eval-YYYY-MM-DD`
- **Manual mode**: `manual-eval-YYYYMMDD-HHMMSS`
- **Custom**: User-specified experiment name

## Quality Benchmarks

**Current scores** (as of latest evaluation):
- Structure Quality: ~100% (excellent)
- Truthfulness Quality: ~90% (very good)
- User Feedback: ~49-50% (room for improvement)

## Performance

| Mode | Sample Size | Truthfulness | Duration |
|------|-------------|--------------|----------|
| Daily (Hybrid) | 20 | ✅ Included | ~15 seconds |
| Manual (Hybrid) | 100 | ✅ Included | ~50 seconds |
| Fast | 50 | ❌ Skipped | ~2 seconds |

Simple, unified, and flexible evaluation system for comprehensive factoid quality monitoring!