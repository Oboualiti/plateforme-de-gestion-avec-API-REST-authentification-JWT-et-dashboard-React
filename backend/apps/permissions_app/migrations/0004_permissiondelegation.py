import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("permissions_app", "0003_alter_apppermission_id_alter_rolepermission_id_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="PermissionDelegation",
            fields=[
                (
                    "id",
                    models.AutoField(
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
                        related_name="delegatable_by_roles",
                        to="permissions_app.apppermission",
                    ),
                ),
                (
                    "role",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="delegatable_permissions",
                        to="roles.role",
                    ),
                ),
            ],
            options={
                "unique_together": {("role", "permission")},
            },
        ),
    ]
