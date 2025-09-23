"""ASGI config for Andy's Daily Factoids project."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.production")

application = get_asgi_application()
