"""Seed the database with example factoids for local development."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.factoids import models


SEED_FACTOIDS = [
    {
        "text": "Honey never spoils; archaeologists have found pots of honey in ancient Egyptian tombs still perfectly edible.",
        "subject": "Food",
        "emoji": "🍯",
    },
    {
        "text": "Bananas are berries, but strawberries are not.",
        "subject": "Botany",
        "emoji": "🍌",
    },
    {
        "text": "Octopuses have three hearts and blue blood.",
        "subject": "Marine Biology",
        "emoji": "🐙",
    },
]


class Command(BaseCommand):
    help = "Seed the database with a handful of factoids"

    def handle(self, *args, **options):
        created = 0
        for entry in SEED_FACTOIDS:
            factoid, was_created = models.Factoid.objects.get_or_create(
                text=entry["text"],
                defaults={
                    "subject": entry["subject"],
                    "emoji": entry["emoji"],
                },
            )
            if was_created:
                created += 1
        self.stdout.write(self.style.SUCCESS(f"Imported {created} factoids"))
