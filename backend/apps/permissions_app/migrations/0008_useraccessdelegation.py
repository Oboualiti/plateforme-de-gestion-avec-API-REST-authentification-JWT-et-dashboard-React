from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("permissions_app", "0007_alter_apppermission_id_alter_permissiondelegation_id_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="UserAccessDelegation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("start_date", models.DateField()),
                ("end_date", models.DateField()),
                ("reason", models.CharField(blank=True, max_length=255)),
                ("is_revoked", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="delegations_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "delegate",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="delegations_received",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "delegator",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="delegations_given",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "permissions",
                    models.ManyToManyField(blank=True, related_name="user_access_delegations", to="permissions_app.apppermission"),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
