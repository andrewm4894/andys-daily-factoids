"""Dataset management for Braintrust evals."""

import json
import random
from pathlib import Path
from typing import Any, Dict, List, Optional


class DatasetManager:
    """Manage test data and golden examples for evals."""

    def __init__(self, data_dir: str = "evals/data"):
        """Initialize with the data directory path."""
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def load_test_topics(self, sample_size: Optional[int] = None) -> List[Dict[str, Any]]:
        """Load test topics for generation."""
        topics_file = self.data_dir / "test_topics.json"

        # Create default topics if file doesn't exist
        if not topics_file.exists():
            default_topics = self._get_default_test_topics()
            self.save_test_topics(default_topics)
            topics = default_topics
        else:
            with open(topics_file) as f:
                topics = json.load(f)

        # Wrap topics in input field for Braintrust
        formatted_topics = [{"input": topic} for topic in topics]

        if sample_size:
            return random.sample(formatted_topics, min(sample_size, len(formatted_topics)))
        return formatted_topics

    def load_production_factoids(self, sample_size: int = 50) -> List[Dict[str, Any]]:
        """Load recent production factoids for evaluation."""
        try:
            from apps.factoids.models import Factoid

            # Get most recent factoids
            recent_factoids = Factoid.objects.order_by("-created_at")[:sample_size]

            eval_data = []
            for factoid in recent_factoids:
                eval_data.append(
                    {
                        "input": {
                            "topic": factoid.subject,
                            "factoid_id": str(factoid.id),
                            "created_at": factoid.created_at.isoformat(),
                        },
                        "expected": {
                            "text": factoid.text,
                            "subject": factoid.subject,
                            "emoji": factoid.emoji,
                        },
                        "metadata": {
                            "votes_up": factoid.votes_up,
                            "votes_down": factoid.votes_down,
                            "generation_metadata": factoid.generation_metadata,
                        },
                    }
                )

            return eval_data
        except Exception as e:
            print(f"Warning: Could not load production factoids: {e}")
            # Fall back to test topics
            return self.load_test_topics(sample_size)

    def save_test_topics(self, topics: List[Dict[str, Any]]) -> None:
        """Save test topics to file."""
        topics_file = self.data_dir / "test_topics.json"
        with open(topics_file, "w") as f:
            json.dump(topics, f, indent=2)

    def load_golden_factoids(self) -> List[Dict[str, Any]]:
        """Load known-good factoids for regression testing."""
        golden_file = self.data_dir / "golden_factoids.json"

        if not golden_file.exists():
            # Create some example golden factoids
            default_golden = self._get_default_golden_factoids()
            self.save_golden_factoids(default_golden)
            return default_golden

        with open(golden_file) as f:
            return json.load(f)

    def save_golden_factoids(self, factoids: List[Dict[str, Any]]) -> None:
        """Save golden factoids to file."""
        golden_file = self.data_dir / "golden_factoids.json"
        with open(golden_file, "w") as f:
            json.dump(factoids, f, indent=2)

    def create_daily_sample(self, size: int = 10) -> List[Dict[str, Any]]:
        """Generate a random sample for daily evals."""
        # Load raw topics without input wrapper
        topics_file = self.data_dir / "test_topics.json"
        if topics_file.exists():
            with open(topics_file) as f:
                raw_topics = json.load(f)
        else:
            raw_topics = self._get_default_test_topics()

        sample = random.sample(raw_topics, min(size, len(raw_topics)))

        # Optionally mix in some production topics
        try:
            from apps.factoids.models import Factoid

            # Get recent factoid subjects for variety
            recent = Factoid.objects.order_by("-created_at")[:5]
            for factoid in recent:
                if len(sample) < size + 5:  # Add a few extra
                    sample.append(
                        {
                            "topic": factoid.subject,
                            "category": "production",
                            "source": "recent_factoid",
                        }
                    )
        except Exception:
            pass  # Skip if database isn't available

        # Wrap in input field for Braintrust
        return [{"input": topic} for topic in sample[:size]]

    def _get_default_test_topics(self) -> List[Dict[str, Any]]:
        """Get default test topics across various categories."""
        return [
            # History
            {"topic": "Ancient Rome", "category": "history"},
            {"topic": "The Renaissance", "category": "history"},
            {"topic": "World War II", "category": "history"},
            {"topic": "Egyptian Pyramids", "category": "history"},
            {"topic": "The Great Wall of China", "category": "history"},
            # Science & Technology
            {"topic": "Quantum Computing", "category": "technology"},
            {"topic": "Artificial Intelligence", "category": "technology"},
            {"topic": "Black Holes", "category": "science"},
            {"topic": "DNA", "category": "science"},
            {"topic": "Climate Change", "category": "science"},
            # Nature
            {"topic": "Deep Sea Creatures", "category": "nature"},
            {"topic": "Amazon Rainforest", "category": "nature"},
            {"topic": "Coral Reefs", "category": "nature"},
            {"topic": "Polar Bears", "category": "nature"},
            {"topic": "Volcanoes", "category": "nature"},
            # Space
            {"topic": "The Moon", "category": "space"},
            {"topic": "Mars Exploration", "category": "space"},
            {"topic": "International Space Station", "category": "space"},
            {"topic": "Saturn's Rings", "category": "space"},
            {"topic": "Asteroids", "category": "space"},
            # Culture & Arts
            {"topic": "Jazz Music", "category": "culture"},
            {"topic": "Shakespeare", "category": "culture"},
            {"topic": "Van Gogh", "category": "culture"},
            {"topic": "Ballet", "category": "culture"},
            {"topic": "Ancient Greek Theater", "category": "culture"},
            # Food & Drink
            {"topic": "Coffee", "category": "food"},
            {"topic": "Chocolate", "category": "food"},
            {"topic": "Sushi", "category": "food"},
            {"topic": "Wine Making", "category": "food"},
            {"topic": "Spices", "category": "food"},
            # Sports & Games
            {"topic": "Olympic Games", "category": "sports"},
            {"topic": "Chess", "category": "games"},
            {"topic": "Soccer World Cup", "category": "sports"},
            {"topic": "Baseball", "category": "sports"},
            {"topic": "Video Games", "category": "games"},
            # Geography
            {"topic": "Mount Everest", "category": "geography"},
            {"topic": "The Sahara Desert", "category": "geography"},
            {"topic": "Antarctica", "category": "geography"},
            {"topic": "The Pacific Ocean", "category": "geography"},
            {"topic": "Northern Lights", "category": "geography"},
        ]

    def _get_default_golden_factoids(self) -> List[Dict[str, Any]]:
        """Get some example golden factoids for testing."""
        return [
            {
                "topic": "Ancient Rome",
                "expected": {
                    "text": (
                        "Ancient Romans used a communal sponge on a stick called a 'tersorium' "
                        "in public bathrooms, which was shared by multiple people and rinsed in "
                        "vinegar or salt water between uses."
                    ),
                    "subject": "Roman Bathroom Hygiene",
                    "emoji": "🧽",
                },
            },
            {
                "topic": "Coffee",
                "expected": {
                    "text": (
                        "Coffee is the world's second-most traded commodity after oil, "
                        "with over 2.25 billion cups consumed globally every day."
                    ),
                    "subject": "Global Coffee Trade",
                    "emoji": "☕",
                },
            },
            {
                "topic": "The Moon",
                "expected": {
                    "text": (
                        "The Moon is moving away from Earth at a rate of about 3.8 centimeters "
                        "per year, roughly the same speed at which fingernails grow."
                    ),
                    "subject": "Lunar Drift",
                    "emoji": "🌙",
                },
            },
        ]
