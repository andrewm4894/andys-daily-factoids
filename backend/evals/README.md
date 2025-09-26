# Braintrust Evaluations for Factoid Generation

This directory contains the Braintrust evaluation framework for testing factoid generation quality.

## Quick Start

**Prerequisites**: Ensure `BRAINTRUST_API_KEY` is set in `backend/.env`

```bash
# Install dependencies
make eval-install

# Create production dataset from database
make eval-create-dataset

# Run all evaluations (structure + truthfulness)
make eval

# Run specific evaluations
make eval-structure      # Test factoid structure parsing only
make eval-truthfulness   # Test truthfulness with GPT-4 judge

# Run daily eval on small sample
make eval-daily

# Run evals on production data
make eval-production
```

## Available Evaluations

### 1. Structure Validation
Tests that generated factoids can be parsed into the required format:
- **JSON Validator** - Uses production parsing logic to validate JSON structure
- **Field Completeness** - Validates presence and quality of text, subject, emoji fields
- **Length Constraints** - Checks subject ≤255 chars, emoji ≤16 chars

### 2. Truthfulness Evaluation
Uses GPT-4 as a judge (via OpenRouter) to assess:
- **Factual Accuracy** - LLM judge determines if factoids are truthful
- **Topic Relevance** - Keyword-based relevance scoring

## Custom Scorers

All scorers are defined in `evals/scorers.py`:

- `json_is_valid()` - Code scorer using production FactoidPayload validation
- `factoid_truthfulness()` - LLM-as-judge using OpenRouter GPT-4

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