"""URL configuration for Andy's Daily Factoids project."""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/factoids/", include("apps.factoids.api", namespace="factoids")),
]
