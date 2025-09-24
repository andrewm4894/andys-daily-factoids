"""Add factoid reference to chat sessions."""

from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("factoids", "0002_allow_repeat_votes"),
        ("chat", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatsession",
            name="factoid",
            field=models.ForeignKey(
                to="factoids.factoid",
                null=True,
                blank=True,
                on_delete=models.CASCADE,
                related_name="chat_sessions",
            ),
        ),
    ]
