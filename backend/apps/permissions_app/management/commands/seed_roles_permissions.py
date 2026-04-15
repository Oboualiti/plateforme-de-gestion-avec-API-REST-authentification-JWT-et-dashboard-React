from django.core.management.base import BaseCommand

from apps.permissions_app.models import AppPermission, RolePermission
from apps.roles.models import Role


ROLE_DEFINITIONS = [
    ("super_admin", "Super Admin"),
    ("senior", "Senior"),
    ("manager", "Manager"),
    ("team_leader", "Team Leader"),
    ("user", "User"),
    ("handler", "Handler"),
]

PERMISSION_MATRIX = {
    "manage_companies": {"super_admin"},
    "view_all_companies": {"super_admin"},
    "manage_entities": {"super_admin", "senior"},
    "view_company_entities": {"super_admin", "senior", "manager", "team_leader"},
    "manage_users_global": {"super_admin"},
    "manage_users_company": {"super_admin", "senior"},
    "manage_users_entity": {"super_admin", "senior", "manager"},
    "create_request": {
        "super_admin",
        "senior",
        "manager",
        "team_leader",
        "user",
        "handler",
    },
    "view_all_requests": {"super_admin"},
    "view_company_requests": {"super_admin", "senior"},
    "view_entity_requests": {"super_admin", "senior", "manager"},
    "view_team_requests": {"super_admin", "senior", "manager", "team_leader"},
    "view_own_requests": {
        "super_admin",
        "senior",
        "manager",
        "team_leader",
        "user",
        "handler",
    },
    "approve_request_tl": {"super_admin", "senior", "manager", "team_leader"},
    "approve_request_mgr": {"super_admin", "senior", "manager"},
    "approve_request_snr": {"super_admin", "senior"},
    "assign_request": {"super_admin", "senior", "manager", "team_leader", "handler"},
    "resolve_request": {"super_admin", "senior", "handler"},
    "close_request": {"super_admin", "senior", "manager", "user"},
    "view_global_reports": {"super_admin"},
    "view_company_reports": {"super_admin", "senior"},
    "view_entity_reports": {"super_admin", "senior", "manager"},
    "export_data": {"super_admin", "senior", "manager"},
}

CATEGORY_MAP = {
    "manage_companies": "organization",
    "view_all_companies": "organization",
    "manage_entities": "organization",
    "view_company_entities": "organization",
    "manage_users_global": "user_management",
    "manage_users_company": "user_management",
    "manage_users_entity": "user_management",
    "create_request": "requests",
    "view_all_requests": "requests",
    "view_company_requests": "requests",
    "view_entity_requests": "requests",
    "view_team_requests": "requests",
    "view_own_requests": "requests",
    "approve_request_tl": "actions",
    "approve_request_mgr": "actions",
    "approve_request_snr": "actions",
    "assign_request": "actions",
    "resolve_request": "actions",
    "close_request": "actions",
    "view_global_reports": "reporting",
    "view_company_reports": "reporting",
    "view_entity_reports": "reporting",
    "export_data": "reporting",
}


class Command(BaseCommand):
    help = "Seed default roles and permissions matrix."

    def handle(self, *args, **options):
        roles = {}
        for key, name in ROLE_DEFINITIONS:
            role, _ = Role.objects.get_or_create(
                key=key,
                defaults={"name": name, "description": f"Default role: {name}"},
            )
            if role.name != name:
                role.name = name
                role.save(update_fields=["name"])
            roles[key] = role

        permissions = {}
        for permission_key, allowed_roles in PERMISSION_MATRIX.items():
            permission, _ = AppPermission.objects.get_or_create(
                key=permission_key,
                defaults={
                    "name": permission_key.replace("_", " ").title(),
                    "category": CATEGORY_MAP.get(permission_key, ""),
                },
            )
            if permission.category != CATEGORY_MAP.get(permission_key, ""):
                permission.category = CATEGORY_MAP.get(permission_key, "")
                permission.save(update_fields=["category"])
            permissions[permission_key] = permission

            for role_key in allowed_roles:
                RolePermission.objects.get_or_create(
                    role=roles[role_key], permission=permission
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(roles)} roles, {len(permissions)} permissions, and role mappings."
            )
        )
