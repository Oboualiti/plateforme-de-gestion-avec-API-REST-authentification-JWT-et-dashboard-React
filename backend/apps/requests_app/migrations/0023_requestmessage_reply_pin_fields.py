from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0022_team_unique_active_leader_constraint"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="requestmessage",
            name="is_pinned",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="requestmessage",
            name="pinned_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="requestmessage",
            name="pinned_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="pinned_request_messages",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="requestmessage",
            name="reply_to_comment",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="replies",
                to="requests_app.requestmessage",
            ),
        ),
        migrations.AddField(
            model_name="requestmessage",
            name="telegram_message_id",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="requestmessage",
            name="telegram_reply_to_message_id",
            field=models.BigIntegerField(blank=True, null=True),
        ),
    ]
