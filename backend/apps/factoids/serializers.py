"""Serializers for factoid APIs."""

from rest_framework import serializers

from . import models


class FactoidSerializer(serializers.ModelSerializer):
    generation_request_id = serializers.SerializerMethodField()

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
            "generation_request_id",
        ]
        read_only_fields = fields

    def get_generation_request_id(self, obj):
        """Return the generation request ID if available."""
        if obj.created_by:
            return str(obj.created_by.id)
        return None


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
