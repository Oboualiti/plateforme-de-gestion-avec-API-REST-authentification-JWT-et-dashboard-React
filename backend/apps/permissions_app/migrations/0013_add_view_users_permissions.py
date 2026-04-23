from django.db import migrations


PERMISSIONS = [
    (
        "view_users_global",
        "View Users Global",
        "View users globally.",
        "user_management",
    ),
    (
        "view_users_company",
        "View Users Company",
        "View users within the same company.",
        "user_management",
    ),
    (
        "view_users_entity",
        "View Users Entity",
        "View users within the same entity.",
        "user_management",
    ),
]


def add_view_users_permissions(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    Role = apps.get_model("roles", "Role")
    RolePermission = apps.get_model("permissions_app", "RolePermission")
    PermissionDelegation = apps.get_model("permissions_app", "PermissionDelegation")

    created_permissions = []
    for key, name, description, category in PERMISSIONS:
        permission, _ = AppPermission.objects.get_or_create(
            key=key,
            defaults={
                "name": name,
                "description": description,
                "category": category,
            },
        )
        created_permissions.append(permission)

    super_admin = Role.objects.filter(key="super_admin").first()
    if super_admin is None:
        return

    for permission in created_permissions:
        RolePermission.objects.get_or_create(role=super_admin, permission=permission)
        PermissionDelegation.objects.get_or_create(role=super_admin, permission=permission)


def remove_view_users_permissions(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    AppPermission.objects.filter(key__in=[item[0] for item in PERMISSIONS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("permissions_app", "0012_add_view_all_entities_permission"),
    ]

    operations = [
        migrations.RunPython(add_view_users_permissions, remove_view_users_permissions),
    ]

