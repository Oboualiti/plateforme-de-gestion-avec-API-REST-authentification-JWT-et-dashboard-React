from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0016_alter_mainbranch_id_alter_operationalunit_id_and_more"),
        ("permissions_app", "0023_alter_apppermission_id_alter_permissiondelegation_id_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserRequestPermissionOverride",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("permission_key", models.CharField(max_length=100)),
                ("allowed", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_request_permission_overrides",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "request",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="permission_overrides",
                        to="requests_app.servicerequest",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="request_permission_overrides",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["user", "permission_key"], name="permission_a_user_id_4f9b40_idx"),
                    models.Index(fields=["request", "permission_key"], name="permission_a_request_597710_idx"),
                    models.Index(fields=["user", "request", "permission_key"], name="permission_a_user_id_6f67ee_idx"),
                ],
                "unique_together": {("user", "request", "permission_key")},
            },
        ),
    ]
