import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="team_leader",
            field=models.ForeignKey(
                blank=True,
                limit_choices_to={"is_active": True},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="team_members",
                to="users.user",
            ),
        ),
    ]
