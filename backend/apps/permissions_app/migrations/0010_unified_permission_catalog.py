from django.db import migrations


ROLE_DEFINITIONS = [
    ("super_admin", "Super Admin"),
    ("senior", "Senior"),
    ("manager", "Manager"),
    ("team_leader", "Team Leader"),
    ("handler", "Handler"),
    ("user", "User"),
]

PERMISSION_DEFINITIONS = [
    ("manage_companies", "Manage Companies", "Create, edit, or delete companies.", "organization"),
    ("view_all_companies", "View All Companies", "View all companies in read-only mode.", "organization"),
    ("manage_entities", "Manage Entities", "Create, edit, or delete entities.", "organization"),
    ("view_company_entities", "View Company Entities", "View entities belonging to the current company.", "organization"),
    ("manage_users_global", "Manage Users Global", "Create, update, and deactivate users globally.", "user_management"),
    ("manage_users_company", "Manage Users Company", "Manage users within the same company.", "user_management"),
    ("manage_users_entity", "Manage Users Entity", "Manage users within the same entity.", "user_management"),
    ("create_request", "Create Request", "Create a new request.", "requests"),
    ("view_all_requests", "View All Requests", "View all requests in the system.", "requests"),
    ("view_company_requests", "View Company Requests", "View requests inside the current company.", "requests"),
    ("view_entity_requests", "View Entity Requests", "View requests inside the current entity.", "requests"),
    ("view_team_requests", "View Team Requests", "View requests for the current team.", "requests"),
    ("view_own_requests", "View Own Requests", "View own requests only.", "requests"),
    ("approve_request", "Approve Request", "Approve requests in approval workflow.", "actions"),
    ("assign_request", "Assign Request", "Assign requests to a handler or team.", "actions"),
    ("resolve_request", "Resolve Request", "Mark work as completed or resolved.", "actions"),
    ("close_request", "Close Request", "Finalize and close the request.", "actions"),
    ("view_global_reports", "View Global Reports", "Access global reporting.", "reporting"),
    ("view_company_reports", "View Company Reports", "Access company reporting.", "reporting"),
    ("view_entity_reports", "View Entity Reports", "Access entity reporting.", "reporting"),
    ("export_data", "Export Data", "Export reporting data.", "reporting"),
]

DEFAULT_ROLE_PERMISSION_MATRIX = {
    "super_admin": {row[0] for row in PERMISSION_DEFINITIONS},
    "senior": {
        "manage_entities",
        "view_company_entities",
        "manage_users_company",
        "create_request",
        "view_company_requests",
        "view_entity_requests",
        "view_team_requests",
        "view_own_requests",
        "approve_request",
        "assign_request",
        "resolve_request",
        "close_request",
        "view_company_reports",
        "view_entity_reports",
        "export_data",
    },
    "manager": {
        "view_company_entities",
        "manage_users_entity",
        "create_request",
        "view_entity_requests",
        "view_team_requests",
        "view_own_requests",
        "approve_request",
        "assign_request",
        "close_request",
        "view_entity_reports",
        "export_data",
    },
    "team_leader": {
        "view_company_entities",
        "create_request",
        "view_team_requests",
        "view_own_requests",
        "approve_request",
        "assign_request",
    },
    "user": {"create_request", "view_own_requests", "close_request"},
    "handler": {"create_request", "view_own_requests", "assign_request", "resolve_request"},
}

LEGACY_APPROVAL_KEYS = ["approve_request_tl", "approve_request_mgr", "approve_request_snr"]
DELEGATION_ROLES = {"super_admin", "senior", "manager", "team_leader"}


def forward(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    AppPermission = apps.get_model("permissions_app", "AppPermission")
    RolePermission = apps.get_model("permissions_app", "RolePermission")
    PermissionDelegation = apps.get_model("permissions_app", "PermissionDelegation")
    UserPermissionOverride = apps.get_model("permissions_app", "UserPermissionOverride")
    UserAccessDelegation = apps.get_model("permissions_app", "UserAccessDelegation")

    roles = {}
    for key, name in ROLE_DEFINITIONS:
        role, _ = Role.objects.get_or_create(
            key=key,
            defaults={"name": name, "description": f"Default role: {name}", "is_active": True},
        )
        changed_fields = []
        if role.name != name:
            role.name = name
            changed_fields.append("name")
        if not role.is_active:
            role.is_active = True
            changed_fields.append("is_active")
        if changed_fields:
            role.save(update_fields=changed_fields)
        roles[key] = role

    permissions_by_key = {}
    for key, name, description, category in PERMISSION_DEFINITIONS:
        permission, _ = AppPermission.objects.get_or_create(
            key=key,
            defaults={"name": name, "description": description, "category": category},
        )
        changed_fields = []
        if permission.name != name:
            permission.name = name
            changed_fields.append("name")
        if permission.description != description:
            permission.description = description
            changed_fields.append("description")
        if permission.category != category:
            permission.category = category
            changed_fields.append("category")
        if changed_fields:
            permission.save(update_fields=changed_fields)
        permissions_by_key[key] = permission

    approve_permission = permissions_by_key["approve_request"]
    for old_key in LEGACY_APPROVAL_KEYS:
        old_permission = AppPermission.objects.filter(key=old_key).first()
        if old_permission is None:
            continue
        for row in RolePermission.objects.filter(permission=old_permission):
            RolePermission.objects.get_or_create(role_id=row.role_id, permission=approve_permission)
        for row in UserPermissionOverride.objects.filter(permission=old_permission):
            UserPermissionOverride.objects.update_or_create(
                user_id=row.user_id,
                permission=approve_permission,
                defaults={"is_allowed": row.is_allowed, "reason": row.reason},
            )
        for delegation in UserAccessDelegation.objects.filter(permissions=old_permission):
            delegation.permissions.add(approve_permission)

    allowed_permission_keys = {row[0] for row in PERMISSION_DEFINITIONS}
    RolePermission.objects.exclude(permission__key__in=allowed_permission_keys).delete()
    PermissionDelegation.objects.exclude(permission__key__in=allowed_permission_keys).delete()
    UserPermissionOverride.objects.exclude(permission__key__in=allowed_permission_keys).delete()
    AppPermission.objects.exclude(key__in=allowed_permission_keys).delete()

    for role_key, permission_keys in DEFAULT_ROLE_PERMISSION_MATRIX.items():
        role = roles.get(role_key)
        if role is None:
            continue
        desired_permissions = [
            permissions_by_key[item] for item in permission_keys if item in permissions_by_key
        ]
        RolePermission.objects.filter(role=role).exclude(permission__in=desired_permissions).delete()
        for permission in desired_permissions:
            RolePermission.objects.get_or_create(role=role, permission=permission)

    PermissionDelegation.objects.all().delete()
    for role_key in DELEGATION_ROLES:
        role = roles.get(role_key)
        if role is None:
            continue
        for permission_key in DEFAULT_ROLE_PERMISSION_MATRIX.get(role_key, set()):
            permission = permissions_by_key.get(permission_key)
            if permission is not None:
                PermissionDelegation.objects.get_or_create(role=role, permission=permission)


def backward(apps, schema_editor):
    # Keep forward-compatible data; rollback is intentionally no-op.
    return


class Migration(migrations.Migration):
    dependencies = [
        ("permissions_app", "0009_alter_apppermission_id_alter_permissiondelegation_id_and_more"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
