from django.db import migrations


PERMISSION_KEY = "permission_management"
DEFAULT_ROLE_KEYS = ["super_admin", "senior", "manager", "team_leader"]


def add_permission_management_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    Role = apps.get_model("roles", "Role")
    RolePermission = apps.get_model("permissions_app", "RolePermission")
    RoleDefaultPermission = apps.get_model("permissions_app", "RoleDefaultPermission")
    PermissionDelegation = apps.get_model("permissions_app", "PermissionDelegation")

    permission, _ = AppPermission.objects.get_or_create(
        key=PERMISSION_KEY,
        defaults={
            "name": "Permission Management",
            "description": "Manage user roles and permission assignments within allowed scope.",
            "category": "user_management",
        },
    )

    roles = Role.objects.filter(key__in=DEFAULT_ROLE_KEYS)
    for role in roles:
        RolePermission.objects.get_or_create(role=role, permission=permission)
        RoleDefaultPermission.objects.get_or_create(role=role, permission=permission)
        PermissionDelegation.objects.get_or_create(role=role, permission=permission)


def remove_permission_management_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    AppPermission.objects.filter(key=PERMISSION_KEY).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("permissions_app", "0018_alter_apppermission_id_alter_permissiondelegation_id_and_more"),
    ]

    operations = [
        migrations.RunPython(
            add_permission_management_permission,
            remove_permission_management_permission,
        ),
    ]

