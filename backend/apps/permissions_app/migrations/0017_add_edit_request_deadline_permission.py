from django.db import migrations


PERMISSION_KEY = "edit_request_deadline"
DEFAULT_ROLE_KEYS = ["super_admin", "senior", "manager", "team_leader"]


def add_edit_request_deadline_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    Role = apps.get_model("roles", "Role")
    RolePermission = apps.get_model("permissions_app", "RolePermission")
    PermissionDelegation = apps.get_model("permissions_app", "PermissionDelegation")

    permission, _ = AppPermission.objects.get_or_create(
        key=PERMISSION_KEY,
        defaults={
            "name": "Edit Request Deadline",
            "description": "Set and update approximate request completion deadlines.",
            "category": "requests",
        },
    )

    roles = Role.objects.filter(key__in=DEFAULT_ROLE_KEYS)
    for role in roles:
        RolePermission.objects.get_or_create(role=role, permission=permission)
        PermissionDelegation.objects.get_or_create(role=role, permission=permission)


def remove_edit_request_deadline_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    AppPermission.objects.filter(key=PERMISSION_KEY).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("permissions_app", "0016_merge_0012_role_default_permission_0015_add_view_request_discussion_permission"),
    ]

    operations = [
        migrations.RunPython(
            add_edit_request_deadline_permission,
            remove_edit_request_deadline_permission,
        ),
    ]
