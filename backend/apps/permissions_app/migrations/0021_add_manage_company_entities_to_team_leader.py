from django.db import migrations


def add_manage_company_entities_to_team_leader(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    Role = apps.get_model("roles", "Role")
    RolePermission = apps.get_model("permissions_app", "RolePermission")
    RoleDefaultPermission = apps.get_model("permissions_app", "RoleDefaultPermission")
    PermissionDelegation = apps.get_model("permissions_app", "PermissionDelegation")

    role = Role.objects.filter(key="team_leader").first()
    permission = AppPermission.objects.filter(key="manage_company_entities").first()
    if role is None or permission is None:
        return

    RolePermission.objects.get_or_create(role=role, permission=permission)
    RoleDefaultPermission.objects.get_or_create(role=role, permission=permission)
    PermissionDelegation.objects.get_or_create(role=role, permission=permission)


def remove_manage_company_entities_from_team_leader(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    Role = apps.get_model("roles", "Role")
    RolePermission = apps.get_model("permissions_app", "RolePermission")
    RoleDefaultPermission = apps.get_model("permissions_app", "RoleDefaultPermission")
    PermissionDelegation = apps.get_model("permissions_app", "PermissionDelegation")

    role = Role.objects.filter(key="team_leader").first()
    permission = AppPermission.objects.filter(key="manage_company_entities").first()
    if role is None or permission is None:
        return

    RolePermission.objects.filter(role=role, permission=permission).delete()
    RoleDefaultPermission.objects.filter(role=role, permission=permission).delete()
    PermissionDelegation.objects.filter(role=role, permission=permission).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("permissions_app", "0020_add_manage_assigned_users_permission"),
    ]

    operations = [
        migrations.RunPython(
            add_manage_company_entities_to_team_leader,
            remove_manage_company_entities_from_team_leader,
        ),
    ]

