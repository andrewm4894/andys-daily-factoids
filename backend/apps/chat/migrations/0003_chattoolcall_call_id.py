"""Add call identifier to chat tool calls."""

from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0002_chatsession_factoid"),
    ]

    operations = [
        migrations.AddField(
            model_name="chattoolcall",
            name="call_id",
            field=models.CharField(blank=True, max_length=128),
        ),
    ]
