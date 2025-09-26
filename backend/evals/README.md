# Braintrust Evaluations for Factoid Generation

This directory contains the Braintrust evaluation framework for testing factoid generation quality.

## Quick Start

```bash
# Install dependencies
make eval-install

# Run all evaluations (structure + truthfulness)
make eval

# Run specific evaluations
make eval-structure      # Test factoid structure parsing only
make eval-truthfulness   # Test truthfulness with GPT-4 judge

# Run daily eval on small sample
make eval-daily
```

## Available Evaluations

### 1. Structure Validation
Tests that generated factoids can be parsed into the required format:
- Validates presence of text, subject, and emoji fields
- Checks field length constraints
- Ensures proper JSON/tool call parsing

### 2. Truthfulness Evaluation
Uses GPT-4 as a judge (via autoevals) to assess:
- Factual accuracy of generated factoids
- Relevance to the requested topic

## Project Structure

```
evals/
├── core/
│   ├── base.py          # Django integration and eval task wrapper
│   └── datasets.py      # Test data management
├── data/
│   └── test_topics.json # Sample test topics
├── eval_factoid_structure.py      # Structure validation eval
├── eval_factoid_truthfulness.py   # Truthfulness eval
└── run_evals.py         # Main runner script
```

## Viewing Results

Results are sent to Braintrust dashboard:
https://www.braintrust.dev/app/andys-daily-factoids

## Adding New Evaluations

1. Create a new eval file (e.g., `eval_factoid_emoji.py`)
2. Implement scorer functions
3. Add to `run_evals.py`
4. Update Makefile with new command

## Configuration

- Model for generation: `--model openai/gpt-4o-mini`
- Sample size: `--sample-size 5`
- Eval type: `--eval-type structure|truthfulness|all`