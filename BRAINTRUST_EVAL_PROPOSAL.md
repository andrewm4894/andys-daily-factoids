# Braintrust Evaluation Framework Proposal
## Andy's Daily Factoids

### Executive Summary
This proposal outlines a comprehensive evaluation framework for the factoid generation system using Braintrust SDK and Autoevals. The framework will provide automated quality assurance for generated factoids, ensuring they meet structural requirements and maintain truthfulness standards.

### Architecture Overview

```
backend/
├── evals/
│   ├── __init__.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── base.py              # Base eval classes and utilities
│   │   ├── scorers.py           # Custom scoring functions
│   │   └── datasets.py          # Dataset loaders and generators
│   ├── factoid_structure.py     # Structure validation eval
│   ├── factoid_truthfulness.py  # Truthfulness eval with LLM judge
│   ├── run_evals.py            # Main eval runner script
│   └── data/
│       ├── test_topics.json     # Sample topics for generation
│       └── golden_factoids.json # Known good examples
```

### Core Components

#### 1. Structure Validation Eval (`factoid_structure.py`)

**Purpose**: Validate that generated factoids can be parsed into our Pydantic model.

**Implementation Strategy**:
- Reuse existing `FactoidPayload` from `apps.factoids.services.openrouter`
- Test extraction logic for both tool-based and JSON responses
- Validate field constraints (emoji length, subject length)

```python
from braintrust import Eval
from apps.factoids.services.openrouter import FactoidPayload, extract_factoid_from_response

async def structure_scorer(input, output, expected=None):
    """Score based on successful parsing into FactoidPayload"""
    try:
        # Use actual app logic
        factoid = extract_factoid_from_response(output["raw_response"])

        # Validate with Pydantic
        payload = FactoidPayload(
            text=factoid.text,
            subject=factoid.subject,
            emoji=factoid.emoji
        )

        return {
            "score": 1.0,
            "metadata": {
                "parsed": True,
                "subject_length": len(payload.subject),
                "has_emoji": bool(payload.emoji),
                "text_length": len(payload.text)
            }
        }
    except Exception as e:
        return {
            "score": 0.0,
            "metadata": {
                "parsed": False,
                "error": str(e)
            }
        }

eval = Eval(
    name="factoid-structure-validation",
    data=lambda: load_test_topics(),
    task=generate_factoid_wrapper,
    scores=[structure_scorer]
)
```

#### 2. Truthfulness Eval (`factoid_truthfulness.py`)

**Purpose**: Assess factoid accuracy using GPT-4/5 as a judge.

**Implementation Strategy**:
- Use Autoevals' `Factuality` scorer or custom `LLMClassifierFromTemplate`
- Include web search capability for fact verification
- Return binary true/false with explanation

```python
from autoevals import LLMClassifierFromTemplate
from braintrust import Eval

truthfulness_judge = LLMClassifierFromTemplate({
    "name": "FactoidTruthfulness",
    "promptTemplate": """You are an expert fact-checker. Evaluate if the following factoid is truthful.

Topic: {{input}}
Factoid: {{output}}

The factoid claims: "{{factoid_text}}"

Instructions:
1. Verify the core claim is factually accurate
2. Check for misleading statements or exaggerations
3. Consider if the emoji appropriately represents the content

Return TRUE if the factoid is accurate, FALSE if it contains errors or misleading information.

Use chain-of-thought reasoning before your final verdict.""",
    "choiceScores": {"TRUE": 1.0, "FALSE": 0.0},
    "useCoT": True,
    "model": "gpt-4-turbo-preview"  # or gpt-5 when available
})

async def truthfulness_scorer(input, output, expected=None):
    """Evaluate factoid truthfulness using LLM judge"""
    result = await truthfulness_judge({
        "input": input["topic"],
        "output": output["factoid_text"],
        "factoid_text": output["factoid_text"]
    })

    return {
        "score": result.score,
        "metadata": {
            "reasoning": result.metadata.get("rationale"),
            "judge_model": "gpt-4-turbo-preview"
        }
    }
```

#### 3. Dataset Management (`core/datasets.py`)

**Purpose**: Manage test data and golden examples.

```python
import json
import random
from pathlib import Path

class DatasetManager:
    def __init__(self, data_dir="evals/data"):
        self.data_dir = Path(data_dir)

    def load_test_topics(self, sample_size=None):
        """Load test topics for generation"""
        with open(self.data_dir / "test_topics.json") as f:
            topics = json.load(f)

        if sample_size:
            return random.sample(topics, min(sample_size, len(topics)))
        return topics

    def load_golden_factoids(self):
        """Load known-good factoids for regression testing"""
        with open(self.data_dir / "golden_factoids.json") as f:
            return json.load(f)

    def create_daily_sample(self, size=10):
        """Generate a random sample for daily evals"""
        all_topics = self.load_test_topics()
        sample = random.sample(all_topics, min(size, len(all_topics)))

        # Add some production topics from recent factoids
        from apps.factoids.models import Factoid
        recent = Factoid.objects.order_by("-created_at")[:5]
        for factoid in recent:
            sample.append({"topic": factoid.subject, "type": "production"})

        return sample
```

#### 4. Main Eval Runner (`run_evals.py`)

**Purpose**: Orchestrate all evaluations with configurable options.

```python
import asyncio
from braintrust import init_dataset, summarize
import click

@click.command()
@click.option('--eval-type', type=click.Choice(['structure', 'truthfulness', 'all']), default='all')
@click.option('--sample-size', type=int, default=10, help='Number of test cases')
@click.option('--model', default='gpt-4o-mini', help='Model to use for generation')
@click.option('--judge-model', default='gpt-4-turbo-preview', help='Model for truthfulness judging')
@click.option('--daily', is_flag=True, help='Run daily eval on random sample')
def run_evals(eval_type, sample_size, model, judge_model, daily):
    """Run Braintrust evaluations for factoid generation"""

    # Initialize Braintrust
    project = init_dataset("andys-daily-factoids")

    # Configure evals based on options
    evals_to_run = []

    if eval_type in ['structure', 'all']:
        evals_to_run.append(structure_eval)

    if eval_type in ['truthfulness', 'all']:
        evals_to_run.append(truthfulness_eval)

    # Run evals
    results = []
    for eval in evals_to_run:
        result = asyncio.run(eval.run(
            sample_size=sample_size,
            model=model,
            judge_model=judge_model
        ))
        results.append(result)

    # Summarize results
    summary = summarize(results)
    print(summary)

    return 0 if all(r.success for r in results) else 1

if __name__ == "__main__":
    run_evals()
```

### Makefile Integration

Add these commands to the existing Makefile:

```makefile
# Braintrust Evaluation Commands
.PHONY: eval eval-structure eval-truthfulness eval-daily eval-install

eval-install:  ## Install eval dependencies
	cd backend && uv pip install braintrust autoevals

eval: eval-install  ## Run all evaluations
	cd backend && uv run python evals/run_evals.py --eval-type all

eval-structure: eval-install  ## Test factoid structure parsing
	cd backend && uv run python evals/run_evals.py --eval-type structure

eval-truthfulness: eval-install  ## Test factoid truthfulness with LLM judge
	cd backend && uv run python evals/run_evals.py --eval-type truthfulness --judge-model gpt-4-turbo-preview

eval-daily: eval-install  ## Run daily eval on small random sample
	cd backend && uv run python evals/run_evals.py --daily --sample-size 5

eval-report:  ## Generate HTML eval report
	cd backend && uv run python evals/run_evals.py --eval-type all --report-format html > eval_report.html
```

### Test Data Examples

#### `test_topics.json`
```json
[
  {"topic": "Ancient Rome", "category": "history"},
  {"topic": "Quantum Computing", "category": "technology"},
  {"topic": "Deep Sea Creatures", "category": "nature"},
  {"topic": "Space Exploration", "category": "science"},
  {"topic": "Jazz Music", "category": "culture"}
]
```

#### `golden_factoids.json`
```json
[
  {
    "topic": "Ancient Rome",
    "expected": {
      "text": "The ancient Romans used urine as mouthwash because its ammonia content helped whiten teeth and kill bacteria.",
      "subject": "Ancient Roman Dental Hygiene",
      "emoji": "🦷"
    }
  }
]
```

### Integration with Existing Code

#### Reusing Django App Logic

```python
# evals/core/base.py
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'factoids_project.settings.local')
django.setup()

# Now we can import Django models and services
from apps.factoids.services.generator import FactoidGeneratorService
from apps.factoids.services.openrouter import FactoidPayload, extract_factoid_from_response

class FactoidEvalTask:
    """Wrapper to use actual Django service in evals"""

    def __init__(self, model="gpt-4o-mini"):
        self.service = FactoidGeneratorService()
        self.model = model

    async def __call__(self, input_data):
        """Generate factoid using actual app logic"""
        topic = input_data.get("topic", "random interesting fact")

        try:
            # Use real generation service
            result = await self.service.generate_factoid_async(
                topic=topic,
                model=self.model
            )

            return {
                "factoid_text": result.factoid.text,
                "subject": result.factoid.subject,
                "emoji": result.factoid.emoji,
                "raw_response": result.raw_response,
                "model_used": result.model
            }
        except Exception as e:
            return {
                "error": str(e),
                "factoid_text": None
            }
```

### Scheduling Daily Evals

#### Option 1: GitHub Actions (Recommended)
```yaml
# .github/workflows/daily-evals.yml
name: Daily Factoid Evals

on:
  schedule:
    - cron: '0 9 * * *'  # Run at 9 AM UTC daily
  workflow_dispatch:  # Allow manual trigger

jobs:
  run-evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install uv
          make eval-install

      - name: Run daily evals
        env:
          BRAINTRUST_API_KEY: ${{ secrets.BRAINTRUST_API_KEY }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
        run: make eval-daily

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: eval-results
          path: backend/eval_report.html
```

#### Option 2: Render Cron Job
Add to existing cron configuration:
```python
# backend/cron/daily_evals.py
from evals.run_evals import run_daily_eval

def main():
    """Run daily evaluation sample"""
    run_daily_eval(sample_size=5)

if __name__ == "__main__":
    main()
```

### Benefits of This Approach

1. **Source Control**: All eval code and config stored in repo
2. **Reusability**: Leverages existing Django models and services
3. **Flexibility**: Easy to add new scorers and eval types
4. **Automation**: Daily runs with configurable samples
5. **Visibility**: Braintrust dashboard for tracking performance over time
6. **Integration**: Works with existing test infrastructure

### Next Steps

1. Review and approve this proposal
2. Create initial eval structure and base classes
3. Implement structure validation eval
4. Implement truthfulness eval with GPT-4 judge
5. Add sample test data
6. Configure daily automation
7. Document usage and best practices

### Questions for Discussion

1. **Sample Size**: What's an appropriate daily eval sample size? (Proposed: 5-10)
2. **Judge Model**: Should we use GPT-4-turbo or wait for GPT-5?
3. **Additional Scorers**: Any other quality metrics to evaluate?
   - Emoji relevance
   - Subject line quality
   - Engagement prediction
   - Variety/uniqueness
4. **Failure Handling**: How should we handle eval failures in CI/CD?
5. **Cost Management**: Budget considerations for daily LLM judge calls?

### Estimated Implementation Timeline

- **Phase 1** (2-3 hours): Basic structure and code scorer
- **Phase 2** (2-3 hours): Truthfulness scorer with LLM judge
- **Phase 3** (1-2 hours): Daily automation and CI integration
- **Phase 4** (1 hour): Documentation and team training

Total: ~8 hours of implementation