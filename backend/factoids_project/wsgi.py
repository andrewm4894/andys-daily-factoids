"""WSGI config for Andy's Daily Factoids project."""

import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.production")

application = get_wsgi_application()
