from django.db import migrations


PERMISSION_KEY = "comment_request"
DEFAULT_ROLE_KEYS = ["super_admin", "senior", "manager", "team_leader", "user"]


def add_comment_request_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    Role = apps.get_model("roles", "Role")
    RolePermission = apps.get_model("permissions_app", "RolePermission")
    PermissionDelegation = apps.get_model("permissions_app", "PermissionDelegation")

    permission, _ = AppPermission.objects.get_or_create(
        key=PERMISSION_KEY,
        defaults={
            "name": "Comment Request",
            "description": "Post messages in request discussions.",
            "category": "requests",
        },
    )

    roles = Role.objects.filter(key__in=DEFAULT_ROLE_KEYS)
    for role in roles:
        RolePermission.objects.get_or_create(role=role, permission=permission)
        PermissionDelegation.objects.get_or_create(role=role, permission=permission)


def remove_comment_request_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    AppPermission.objects.filter(key=PERMISSION_KEY).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("permissions_app", "0013_add_view_users_permissions"),
    ]

    operations = [
        migrations.RunPython(add_comment_request_permission, remove_comment_request_permission),
    ]

