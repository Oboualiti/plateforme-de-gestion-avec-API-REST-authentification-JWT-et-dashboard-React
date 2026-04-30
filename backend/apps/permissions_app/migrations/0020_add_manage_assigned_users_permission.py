from django.db import migrations


PERMISSION_KEY = "manage_assigned_users"


def add_manage_assigned_users_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    Role = apps.get_model("roles", "Role")
    RolePermission = apps.get_model("permissions_app", "RolePermission")
    RoleDefaultPermission = apps.get_model("permissions_app", "RoleDefaultPermission")
    PermissionDelegation = apps.get_model("permissions_app", "PermissionDelegation")

    permission, _ = AppPermission.objects.get_or_create(
        key=PERMISSION_KEY,
        defaults={
            "name": "Manage Assigned Users",
            "description": "Manage users directly assigned to the current team leader.",
            "category": "user_management",
        },
    )

    team_leader = Role.objects.filter(key="team_leader").first()
    if team_leader is not None:
        RolePermission.objects.get_or_create(role=team_leader, permission=permission)
        RoleDefaultPermission.objects.get_or_create(role=team_leader, permission=permission)
        PermissionDelegation.objects.get_or_create(role=team_leader, permission=permission)


def remove_manage_assigned_users_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    AppPermission.objects.filter(key=PERMISSION_KEY).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("permissions_app", "0019_add_permission_management_permission"),
    ]

    operations = [
        migrations.RunPython(
            add_manage_assigned_users_permission,
            remove_manage_assigned_users_permission,
        ),
    ]

