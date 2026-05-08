from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("permissions_app", "0024_user_request_permission_override"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserScopedAccessOverride",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("control_key", models.CharField(choices=[("view_users", "View Users"), ("manage_users", "Manage Users"), ("permission_management", "Permission Management")], max_length=40)),
                ("allowed", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name="created_scoped_access_overrides", to=settings.AUTH_USER_MODEL)),
                ("subject_user", models.ForeignKey(on_delete=models.CASCADE, related_name="scoped_access_subject_overrides", to=settings.AUTH_USER_MODEL)),
                ("user", models.ForeignKey(on_delete=models.CASCADE, related_name="scoped_access_overrides", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "indexes": [
                    models.Index(fields=["user", "control_key"], name="permissions__user_id_10ebfc_idx"),
                    models.Index(fields=["subject_user", "control_key"], name="permissions__subject_e49d61_idx"),
                    models.Index(fields=["user", "subject_user", "control_key"], name="permissions__user_id_3d7954_idx"),
                ],
                "unique_together": {("user", "subject_user", "control_key")},
            },
        ),
    ]
