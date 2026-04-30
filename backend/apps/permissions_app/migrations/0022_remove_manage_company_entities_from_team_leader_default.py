from django.db import migrations


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


def noop_restore(apps, schema_editor):
    # Intentionally left blank: permission remains available in matrix for all roles.
    return


class Migration(migrations.Migration):
    dependencies = [
        ("permissions_app", "0021_add_manage_company_entities_to_team_leader"),
    ]

    operations = [
        migrations.RunPython(
            remove_manage_company_entities_from_team_leader,
            noop_restore,
        ),
    ]

