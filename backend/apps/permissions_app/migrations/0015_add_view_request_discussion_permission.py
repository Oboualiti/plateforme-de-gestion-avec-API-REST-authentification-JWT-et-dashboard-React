from django.db import migrations


PERMISSION_KEY = "view_request_discussion"
DEFAULT_ROLE_KEYS = ["super_admin", "senior", "manager", "team_leader", "user"]


def add_view_request_discussion_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    Role = apps.get_model("roles", "Role")
    RolePermission = apps.get_model("permissions_app", "RolePermission")
    PermissionDelegation = apps.get_model("permissions_app", "PermissionDelegation")

    permission, _ = AppPermission.objects.get_or_create(
        key=PERMISSION_KEY,
        defaults={
            "name": "View Request Discussion",
            "description": "View request discussion messages.",
            "category": "requests",
        },
    )

    roles = Role.objects.filter(key__in=DEFAULT_ROLE_KEYS)
    for role in roles:
        RolePermission.objects.get_or_create(role=role, permission=permission)
        PermissionDelegation.objects.get_or_create(role=role, permission=permission)


def remove_view_request_discussion_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    AppPermission.objects.filter(key=PERMISSION_KEY).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("permissions_app", "0014_add_comment_request_permission"),
    ]

    operations = [
        migrations.RunPython(
            add_view_request_discussion_permission,
            remove_view_request_discussion_permission,
        ),
    ]

