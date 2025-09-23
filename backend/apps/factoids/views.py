"""API views for factoids."""

from rest_framework import viewsets

from . import models, serializers


class FactoidViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only access to factoids; will expand in later phases."""

    queryset = models.Factoid.objects.all()
    serializer_class = serializers.FactoidSerializer


class FactoidFeedbackViewSet(viewsets.ModelViewSet):
    """Collect optional feedback from users."""

    http_method_names = ["post", "head", "options"]
    queryset = models.FactoidFeedback.objects.all()
    serializer_class = serializers.FactoidFeedbackSerializer
