from django.db import migrations


PERMISSION_KEY = "approve_completed_result"


def add_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    AppPermission.objects.update_or_create(
        key=PERMISSION_KEY,
        defaults={
            "name": "Approve Completed Result",
            "description": "Approve or reject completed work results (close or return to in progress).",
            "category": "actions",
        },
    )


def remove_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    AppPermission.objects.filter(key=PERMISSION_KEY).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("permissions_app", "0023_alter_apppermission_id_alter_permissiondelegation_id_and_more"),
    ]

    operations = [
        migrations.RunPython(add_permission, remove_permission),
    ]
