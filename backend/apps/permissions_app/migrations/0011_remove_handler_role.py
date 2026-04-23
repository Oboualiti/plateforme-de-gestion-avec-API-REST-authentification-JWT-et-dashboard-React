from django.db import migrations


def migrate_handler_to_user(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    UserRole = apps.get_model("permissions_app", "UserRole")

    handler_role = Role.objects.filter(key="handler").first()
    if handler_role is None:
        return

    user_role = Role.objects.filter(key="user").first()
    if user_role is not None:
        UserRole.objects.filter(role_id=handler_role.id).update(role_id=user_role.id)

    handler_role.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("permissions_app", "0010_unified_permission_catalog"),
    ]

    operations = [
        migrations.RunPython(migrate_handler_to_user, migrations.RunPython.noop),
    ]