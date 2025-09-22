"""Serializers for factoid APIs."""

from rest_framework import serializers

from . import models


class FactoidSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Factoid
        fields = ["id", "text", "subject", "emoji", "created_at"]


class FactoidFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.FactoidFeedback
        fields = ["id", "factoid", "vote", "client_hash", "comments", "created_at"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {
            "client_hash": {"write_only": True},
        }
