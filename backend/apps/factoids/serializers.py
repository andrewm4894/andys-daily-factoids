"""Serializers for factoid APIs."""

from rest_framework import serializers

from . import models


class FactoidSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Factoid
        fields = [
            "id",
            "text",
            "subject",
            "emoji",
            "created_at",
            "updated_at",
            "votes_up",
            "votes_down",
            "generation_metadata",
            "cost_usd",
        ]
        read_only_fields = fields


class FactoidFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.FactoidFeedback
        fields = [
            "id",
            "factoid",
            "generation_request",
            "vote",
            "client_hash",
            "comments",
            "tags",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {
            "client_hash": {"write_only": True},
            "generation_request": {"required": False, "allow_null": True},
        }
