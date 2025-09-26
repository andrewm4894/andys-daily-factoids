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

        if sample_size:
            return random.sample(topics, min(sample_size, len(topics)))
        return topics

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
        all_topics = self.load_test_topics()
        sample = random.sample(all_topics, min(size, len(all_topics)))

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

        return sample[:size]  # Trim to requested size

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
