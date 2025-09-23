"""Allow repeat voting by removing unique client constraint."""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("factoids", "0001_initial"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="voteaggregate",
            name="unique_factoid_vote",
        ),
    ]
