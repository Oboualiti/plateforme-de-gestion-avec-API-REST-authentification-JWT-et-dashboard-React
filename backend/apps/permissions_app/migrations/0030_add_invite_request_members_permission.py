from django.db import migrations


PERMISSION_KEY = "invite_request_members"
ROLE_KEYS = ["manager", "team_leader"]


def add_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    Role = apps.get_model("roles", "Role")
    RolePermission = apps.get_model("permissions_app", "RolePermission")
    PermissionDelegation = apps.get_model("permissions_app", "PermissionDelegation")

    permission, _ = AppPermission.objects.update_or_create(
        key=PERMISSION_KEY,
        defaults={
            "name": "Invite Request Members",
            "description": "Invite members to participate in a request.",
            "category": "requests",
        },
    )

    for role_key in ROLE_KEYS:
        role = Role.objects.filter(key=role_key).first()
        if not role:
            continue
        RolePermission.objects.get_or_create(role=role, permission=permission)
        PermissionDelegation.objects.get_or_create(role=role, permission=permission)


def remove_permission(apps, schema_editor):
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    AppPermission.objects.filter(key=PERMISSION_KEY).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("permissions_app", "0029_userpermissionoverride_scope_type_and_more"),
    ]

    operations = [
        migrations.RunPython(add_permission, remove_permission),
    ]
