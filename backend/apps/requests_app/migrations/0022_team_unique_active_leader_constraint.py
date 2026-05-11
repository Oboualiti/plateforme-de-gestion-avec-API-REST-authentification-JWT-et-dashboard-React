from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0021_backfill_teams_and_request_target_team"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="team",
            constraint=models.UniqueConstraint(
                fields=("leader",),
                condition=Q(is_active=True),
                name="uniq_active_team_per_leader",
            ),
        ),
    ]

