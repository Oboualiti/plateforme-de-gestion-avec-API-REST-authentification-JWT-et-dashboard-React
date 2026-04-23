from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("permissions_app", "0011_remove_handler_role"),
    ]

    operations = [
        migrations.CreateModel(
            name="RoleDefaultPermission",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "permission",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="role_default_permissions",
                        to="permissions_app.apppermission",
                    ),
                ),
                (
                    "role",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="default_permissions",
                        to="roles.role",
                    ),
                ),
            ],
            options={
                "unique_together": {("role", "permission")},
            },
        ),
    ]
