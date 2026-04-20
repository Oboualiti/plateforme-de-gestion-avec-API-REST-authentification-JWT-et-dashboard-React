from django.utils import timezone

from django.db.models import Q

from apps.permissions_app.models import (
    AppPermission,
    PermissionDelegation,
    RolePermission,
    UserAccessDelegation,
    UserPermissionOverride,
)


ROLE_HIERARCHY = {
    "super_admin": 6,
    "senior": 5,
    "manager": 4,
    "team_leader": 3,
    "user": 2,
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


def get_primary_role_key(user):
    role_keys = get_user_role_keys(user)
    if not role_keys:
        return ""
    return max(role_keys, key=lambda item: ROLE_HIERARCHY.get(item, 0))


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
    today = timezone.now().date()
    delegated = set(
        UserAccessDelegation.objects.filter(
            delegate=user,
            is_revoked=False,
            start_date__lte=today,
            end_date__gte=today,
            permissions__isnull=False,
        ).values_list("permissions__key", flat=True)
    )
    overrides = {
        item["permission__key"]: item["is_allowed"]
        for item in UserPermissionOverride.objects.filter(user=user).values(
            "permission__key", "is_allowed"
        )
    }
    allowed = inherited | delegated | {key for key, value in overrides.items() if value}
    denied = {key for key, value in overrides.items() if not value}
    return sorted(allowed - denied)


def get_delegatable_permission_keys(editor_user):
    role_keys = get_user_role_keys(editor_user)
    if not role_keys:
        return []
    return sorted(
        PermissionDelegation.objects.filter(role__key__in=role_keys).values_list(
            "permission__key", flat=True
        ).distinct()
    )


def get_manage_scope(user):
    effective_permissions = set(get_effective_permission_keys(user))
    for permission_key in MANAGE_PERMISSION_SCOPE_ORDER:
        if permission_key in effective_permissions:
            return permission_key
    return None


def get_scope_filter(user):
    role_key = get_primary_role_key(user)
    if role_key == "super_admin":
        return Q()
    if role_key == "senior" and user.company_id:
        return Q(company_id=user.company_id)
    if role_key == "manager" and user.entity_id:
        return Q(entity_id=user.entity_id)
    if role_key == "team_leader":
        return Q(entity_id=user.entity_id, team_leader_id=user.id) | Q(id=user.id)
    if role_key == "user":
        return Q(id=user.id)
    return None


def get_role_visibility_floor(user):
    role_key = get_primary_role_key(user)
    if role_key in {"super_admin", "senior", "manager", "team_leader"}:
        return ROLE_HIERARCHY[role_key]
    return ROLE_HIERARCHY.get("user", 2)


def can_manage_any_users(user):
    role_key = get_primary_role_key(user)
    if role_key in {"super_admin", "senior", "manager"}:
        if role_key == "senior":
            return bool(user.company_id)
        if role_key == "manager":
            return bool(user.company_id and user.entity_id)
        return True
    if role_key == "team_leader":
        return bool(user.company_id and user.entity_id)
    return False


def get_visible_users_queryset(user):
    scope_filter = get_scope_filter(user)
    if scope_filter is None:
        return user.__class__.objects.none()

    actor_level = get_role_visibility_floor(user)
    role_key = get_primary_role_key(user)
    visible_ids = []
    queryset = (
        user.__class__.objects.exclude(id=user.id)
        .filter(scope_filter)
        .prefetch_related("assigned_roles__role", "permission_overrides__permission")
        .order_by("username")
    )
    for candidate in queryset:
        candidate_level = get_user_max_role_level(candidate)
        if candidate_level <= actor_level:
            if role_key == "team_leader":
                if candidate_level <= ROLE_HIERARCHY["team_leader"] and (
                    candidate.team_leader_id == user.id or candidate.id == user.id
                ):
                    visible_ids.append(candidate.id)
            elif role_key == "manager":
                if candidate_level <= ROLE_HIERARCHY["manager"]:
                    visible_ids.append(candidate.id)
            elif role_key == "senior":
                if candidate_level <= ROLE_HIERARCHY["senior"]:
                    visible_ids.append(candidate.id)
            else:
                visible_ids.append(candidate.id)
    return user.__class__.objects.filter(id__in=visible_ids).order_by("username")


def get_manageable_users_queryset(user):
    actor_level = get_user_max_role_level(user)
    manageable_ids = []
    for candidate in get_visible_users_queryset(user):
        if get_user_max_role_level(candidate) < actor_level:
            manageable_ids.append(candidate.id)
    return user.__class__.objects.filter(id__in=manageable_ids).order_by("username")


def can_view_target_user(actor, target):
    if actor.id == target.id:
        return True
    return get_visible_users_queryset(actor).filter(id=target.id).exists()


def can_manage_target_user(actor, target):
    if not can_view_target_user(actor, target):
        return False
    if actor.id == target.id:
        return False
    actor_role = get_primary_role_key(actor)
    target_role = get_primary_role_key(target)
    if actor_role == "team_leader":
        if target.company_id != actor.company_id or target.entity_id != actor.entity_id:
            return False
        if target.team_leader_id not in {None, actor.id}:
            return False
        return target_role in {"", "user"}
    return get_user_max_role_level(target) < get_user_max_role_level(actor)


def get_request_scope_filter(user):
    role_key = get_primary_role_key(user)
    if role_key == "super_admin":
        return Q()
    if role_key == "senior" and user.company_id:
        return Q(requester_user__company_id=user.company_id)
    if role_key == "manager" and user.entity_id:
        return Q(requester_user__entity_id=user.entity_id)
    if role_key == "team_leader":
        team_user_ids = list(
            user.__class__.objects.filter(team_leader_id=user.id).values_list("id", flat=True)
        )
        return (
            Q(requester_user_id=user.id)
            | Q(current_assignee_id=user.id)
            | Q(requester_user_id__in=team_user_ids)
            | Q(current_assignee_id__in=team_user_ids)
        )
    return Q(requester_user_id=user.id) | Q(current_assignee_id=user.id)


def get_permission_matrix_for_user(user, editor_user=None):
    inherited = set(get_inherited_permission_keys(user))
    overrides = {
        override.permission.key: override
        for override in UserPermissionOverride.objects.filter(user=user).select_related(
            "permission"
        )
    }
    result = []
    permissions_queryset = AppPermission.objects.all()
    if editor_user is not None:
        delegatable_keys = get_delegatable_permission_keys(editor_user)
        permissions_queryset = permissions_queryset.filter(key__in=delegatable_keys)
    for permission in permissions_queryset.order_by("category", "key"):
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
