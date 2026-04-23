from django.core.management.base import BaseCommand
from django.db import transaction

from apps.permissions_app.constants import (
    DEFAULT_ROLE_PERMISSION_MATRIX,
    DELEGATION_ROLES,
    LEGACY_PERMISSION_KEY_MAPPING,
    PERMISSION_DEFINITIONS,
    ROLE_DEFINITIONS,
)
from apps.permissions_app.models import (
    AppPermission,
    PermissionDelegation,
    RolePermission,
    UserAccessDelegation,
    UserPermissionOverride,
    UserRole,
)
from apps.roles.models import Role


PERMISSION_MATRIX = {
    permission_key: {
        role_key
        for role_key, role_permission_keys in DEFAULT_ROLE_PERMISSION_MATRIX.items()
        if permission_key in role_permission_keys
    }
    for permission_key in [item["key"] for item in PERMISSION_DEFINITIONS]
}


class Command(BaseCommand):
    help = "Seed default roles and unified permissions matrix."

    @transaction.atomic
    def handle(self, *args, **options):
        handler_role = Role.objects.filter(key="handler").first()
        user_role = Role.objects.filter(key="user").first()
        if handler_role and user_role:
            UserRole.objects.filter(role=handler_role).update(role=user_role)
        if handler_role:
            handler_role.delete()

        roles = {}
        for key, name in ROLE_DEFINITIONS:
            role, _ = Role.objects.get_or_create(
                key=key,
                defaults={"name": name, "description": f"Default role: {name}"},
            )
            if role.name != name or not role.is_active:
                role.name = name
                role.is_active = True
                role.save(update_fields=["name", "is_active"])
            roles[key] = role

        permissions_by_key = {}
        for definition in PERMISSION_DEFINITIONS:
            permission, _ = AppPermission.objects.get_or_create(
                key=definition["key"],
                defaults={
                    "name": definition["name"],
                    "description": definition["description"],
                    "category": definition["category"],
                },
            )
            changed_fields = []
            if permission.name != definition["name"]:
                permission.name = definition["name"]
                changed_fields.append("name")
            if permission.description != definition["description"]:
                permission.description = definition["description"]
                changed_fields.append("description")
            if permission.category != definition["category"]:
                permission.category = definition["category"]
                changed_fields.append("category")
            if changed_fields:
                permission.save(update_fields=changed_fields)
            permissions_by_key[definition["key"]] = permission

        # Migrate old approval keys into unified approve_request before cleanup.
        approve_permission = permissions_by_key["approve_request"]
        for old_key, new_key in LEGACY_PERMISSION_KEY_MAPPING.items():
            if new_key != "approve_request":
                continue
            old_permission = AppPermission.objects.filter(key=old_key).first()
            if old_permission is None:
                continue
            role_ids = list(
                RolePermission.objects.filter(permission=old_permission).values_list(
                    "role_id", flat=True
                )
            )
            for role_id in role_ids:
                RolePermission.objects.get_or_create(
                    role_id=role_id,
                    permission=approve_permission,
                )
            override_rows = UserPermissionOverride.objects.filter(permission=old_permission)
            for item in override_rows:
                UserPermissionOverride.objects.update_or_create(
                    user_id=item.user_id,
                    permission=approve_permission,
                    defaults={"is_allowed": item.is_allowed, "reason": item.reason},
                )
            for delegation in UserAccessDelegation.objects.filter(permissions=old_permission):
                delegation.permissions.add(approve_permission)

        allowed_permission_keys = set(permissions_by_key.keys())

        RolePermission.objects.exclude(permission__key__in=allowed_permission_keys).delete()
        PermissionDelegation.objects.exclude(permission__key__in=allowed_permission_keys).delete()
        UserPermissionOverride.objects.exclude(permission__key__in=allowed_permission_keys).delete()

        # Remove deprecated permissions from DB so catalog stays canonical.
        AppPermission.objects.exclude(key__in=allowed_permission_keys).delete()

        for role_key, permission_keys in DEFAULT_ROLE_PERMISSION_MATRIX.items():
            role = roles[role_key]
            assigned_permissions = [
                permissions_by_key[permission_key]
                for permission_key in permission_keys
                if permission_key in permissions_by_key
            ]
            RolePermission.objects.filter(role=role).exclude(
                permission__in=assigned_permissions
            ).delete()
            for permission in assigned_permissions:
                RolePermission.objects.get_or_create(role=role, permission=permission)

        PermissionDelegation.objects.all().delete()
        for role_key in DELEGATION_ROLES:
            role = roles[role_key]
            for permission_key in DEFAULT_ROLE_PERMISSION_MATRIX.get(role_key, set()):
                permission = permissions_by_key.get(permission_key)
                if permission is None:
                    continue
                PermissionDelegation.objects.get_or_create(role=role, permission=permission)

        self.stdout.write(
            self.style.SUCCESS(
                "Seeded unified permission model, default role mappings, and delegation mappings."
            )
        )
