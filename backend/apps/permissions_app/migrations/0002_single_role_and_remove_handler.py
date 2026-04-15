from django.db import migrations, models


ROLE_HIERARCHY = {
    "super_admin": 6,
    "senior": 5,
    "manager": 4,
    "team_leader": 3,
    "user": 2,
}


def forward_cleanup(apps, schema_editor):
    UserRole = apps.get_model("permissions_app", "UserRole")
    Role = apps.get_model("roles", "Role")

    user_role = Role.objects.filter(key="user").first()
    handler_role = Role.objects.filter(key="handler").first()

    if handler_role is not None:
        if user_role is not None:
            handler_assignments = list(UserRole.objects.filter(role_id=handler_role.id))
            for assignment in handler_assignments:
                if not UserRole.objects.filter(
                    user_id=assignment.user_id, role_id=user_role.id
                ).exists():
                    UserRole.objects.create(user_id=assignment.user_id, role_id=user_role.id)
        UserRole.objects.filter(role_id=handler_role.id).delete()
        handler_role.delete()

    for user_id in UserRole.objects.values_list("user_id", flat=True).distinct():
        assignments = list(
            UserRole.objects.filter(user_id=user_id).select_related("role").order_by("-id")
        )
        if len(assignments) <= 1:
            continue

        assignments.sort(
            key=lambda item: (ROLE_HIERARCHY.get(item.role.key, 0), item.id),
            reverse=True,
        )
        keep = assignments[0]
        UserRole.objects.filter(user_id=user_id).exclude(id=keep.id).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("permissions_app", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(forward_cleanup, migrations.RunPython.noop),
        migrations.AlterUniqueTogether(
            name="userrole",
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name="userrole",
            constraint=models.UniqueConstraint(
                fields=("user",), name="unique_role_per_user"
            ),
        ),
        migrations.AddConstraint(
            model_name="userrole",
            constraint=models.UniqueConstraint(
                fields=("user", "role"), name="unique_user_role_pair"
            ),
        ),
    ]
