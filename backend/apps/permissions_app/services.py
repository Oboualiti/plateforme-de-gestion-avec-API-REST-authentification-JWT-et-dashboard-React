from django.db.models import Q

from apps.permissions_app.models import AppPermission, RolePermission, UserPermissionOverride


ROLE_HIERARCHY = {
    "super_admin": 6,
    "senior": 5,
    "manager": 4,
    "team_leader": 3,
    "user": 2,
    "handler": 1,
}

MANAGE_PERMISSION_SCOPE_ORDER = [
    "manage_users_global",
    "manage_users_company",
    "manage_users_entity",
    "manage_users_team",
]


def get_user_role_keys(user):
    return list(user.assigned_roles.select_related("role").values_list("role__key", flat=True))


def get_user_max_role_level(user):
    levels = [ROLE_HIERARCHY.get(role_key, 0) for role_key in get_user_role_keys(user)]
    return max(levels, default=0)


def get_inherited_permission_keys(user):
    role_keys = get_user_role_keys(user)
    if not role_keys:
        return set()
    return set(
        RolePermission.objects.filter(role__key__in=role_keys).values_list(
            "permission__key", flat=True
        )
    )


def get_effective_permission_keys(user):
    inherited = get_inherited_permission_keys(user)
    overrides = {
        item["permission__key"]: item["is_allowed"]
        for item in UserPermissionOverride.objects.filter(user=user).values(
            "permission__key", "is_allowed"
        )
    }
    allowed = inherited | {key for key, value in overrides.items() if value}
    denied = {key for key, value in overrides.items() if not value}
    return sorted(allowed - denied)


def get_manage_scope(user):
    effective_permissions = set(get_effective_permission_keys(user))
    for permission_key in MANAGE_PERMISSION_SCOPE_ORDER:
        if permission_key in effective_permissions:
            return permission_key
    return None


def get_scope_filter(user):
    scope = get_manage_scope(user)
    if scope == "manage_users_global":
        return Q()
    if scope == "manage_users_company" and user.company_id:
        return Q(company_id=user.company_id)
    if scope in {"manage_users_entity", "manage_users_team"} and user.entity_id:
        return Q(entity_id=user.entity_id)
    return None


def can_manage_any_users(user):
    return get_manage_scope(user) is not None and get_user_max_role_level(user) > 0


def get_manageable_users_queryset(user):
    scope_filter = get_scope_filter(user)
    if scope_filter is None:
        return user.__class__.objects.none()

    actor_level = get_user_max_role_level(user)
    manageable_ids = []
    queryset = (
        user.__class__.objects.exclude(id=user.id)
        .filter(scope_filter)
        .prefetch_related("assigned_roles__role", "permission_overrides__permission")
        .order_by("username")
    )
    for candidate in queryset:
        if get_user_max_role_level(candidate) < actor_level:
            manageable_ids.append(candidate.id)
    return user.__class__.objects.filter(id__in=manageable_ids).order_by("username")


def can_manage_target_user(actor, target):
    if actor.id == target.id:
        return False
    return get_manageable_users_queryset(actor).filter(id=target.id).exists()


def get_permission_matrix_for_user(user):
    inherited = set(get_inherited_permission_keys(user))
    overrides = {
        override.permission.key: override
        for override in UserPermissionOverride.objects.filter(user=user).select_related(
            "permission"
        )
    }
    result = []
    for permission in AppPermission.objects.all().order_by("category", "key"):
        override = overrides.get(permission.key)
        is_effective = permission.key in inherited
        if override is not None:
            is_effective = override.is_allowed
        result.append(
            {
                "key": permission.key,
                "name": permission.name,
                "category": permission.category,
                "description": permission.description,
                "inherited": permission.key in inherited,
                "override": None if override is None else override.is_allowed,
                "effective": is_effective,
            }
        )
    return result
