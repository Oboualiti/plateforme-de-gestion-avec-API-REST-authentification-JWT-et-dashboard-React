from django.db import migrations


def add_view_all_entities_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    Role = apps.get_model("roles", "Role")
    RolePermission = apps.get_model("permissions_app", "RolePermission")
    PermissionDelegation = apps.get_model("permissions_app", "PermissionDelegation")

    permission, _ = AppPermission.objects.get_or_create(
        key="view_all_entities",
        defaults={
            "name": "View All Entities",
            "description": "View entities from all companies in read-only mode.",
            "category": "organization",
        },
    )

    super_admin = Role.objects.filter(key="super_admin").first()
    if super_admin is None:
        return

    RolePermission.objects.get_or_create(role=super_admin, permission=permission)
    PermissionDelegation.objects.get_or_create(role=super_admin, permission=permission)


def remove_view_all_entities_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    AppPermission.objects.filter(key="view_all_entities").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("permissions_app", "0011_remove_handler_role"),
    ]

    operations = [
        migrations.RunPython(add_view_all_entities_permission, remove_view_all_entities_permission),
    ]

