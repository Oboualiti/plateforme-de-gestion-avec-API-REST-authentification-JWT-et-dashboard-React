from django.utils import timezone

from django.db.models import Q, Case, When, Value, IntegerField, Max

from apps.entities.models import Entity
from apps.permissions_app.models import (
    AppPermission,
    PermissionDelegation,
    RolePermission,
    UserAccessDelegation,
    UserPermissionOverride,
)
from .constants import (
    DEFAULT_ROLE_PERMISSION_MATRIX,
    ROLE_HIERARCHY,
)

MANAGE_PERMISSION_SCOPE_ORDER = [
    "manage_users_global",
    "manage_users_company",
    "manage_users_entity",
]

ROLE_PERMISSION_HIERARCHY_ERROR = "You can only manage users below your role."
ROLE_PERMISSION_OWNERSHIP_ERROR = "You can only assign permissions you already have."


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


def can_manage_role_permissions(actor_user, target_role_key):
    actor_role_key = get_primary_role_key(actor_user)
    if actor_role_key == "super_admin":
        return True, ""

    actor_level = ROLE_HIERARCHY.get(actor_role_key, 0)
    target_level = ROLE_HIERARCHY.get(target_role_key, 0)
    if actor_level <= 0 or target_level <= 0 or target_level >= actor_level:
        return False, ROLE_PERMISSION_HIERARCHY_ERROR
    return True, ""


def get_manageable_permission_keys_for_actor(actor_user):
    actor_role_key = get_primary_role_key(actor_user)
    if actor_role_key == "super_admin":
        return set(AppPermission.objects.values_list("key", flat=True))
    return set(get_effective_permission_keys(actor_user))


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


def has_permission(user, permission_key):
    return permission_key in set(get_effective_permission_keys(user))


def has_any_permission(user, permission_keys):
    effective = set(get_effective_permission_keys(user))
    return bool(set(permission_keys) & effective)


def has_all_permissions(user, permission_keys):
    effective = set(get_effective_permission_keys(user))
    return set(permission_keys).issubset(effective)


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


def get_manage_scope_filter(user):
    effective_permissions = set(get_effective_permission_keys(user))
    if "manage_users_global" in effective_permissions:
        return Q()
    if "manage_users_company" in effective_permissions and user.company_id:
        return Q(company_id=user.company_id)
    if "manage_users_entity" in effective_permissions and user.entity_id:
        return Q(entity_id=user.entity_id)
    return None


def get_view_scope(user):
    effective_permissions = set(get_effective_permission_keys(user))

    # Highest-scope visibility wins across both "manage" and "view" permissions.
    has_global = (
        "view_users_global" in effective_permissions
        or "manage_users_global" in effective_permissions
    )
    has_company = (
        bool(user.company_id)
        and (
            "view_users_company" in effective_permissions
            or "manage_users_company" in effective_permissions
        )
    )
    has_entity = (
        bool(user.entity_id)
        and (
            "view_users_entity" in effective_permissions
            or "manage_users_entity" in effective_permissions
        )
    )

    if has_global:
        return "view_users_global"
    if has_company:
        return "view_users_company"
    if has_entity:
        return "view_users_entity"
    return None


def get_view_scope_filter(user):
    scope = get_view_scope(user)
    if scope == "view_users_global":
        return Q()
    if scope == "view_users_company" and user.company_id:
        return Q(company_id=user.company_id)
    if scope == "view_users_entity" and user.entity_id:
        return Q(entity_id=user.entity_id)
    return None


def get_role_visibility_floor(user):
    role_key = get_primary_role_key(user)
    if role_key in {"super_admin", "senior", "manager", "team_leader"}:
        return ROLE_HIERARCHY[role_key]
    return ROLE_HIERARCHY.get("user", 2)


def can_manage_any_users(user):
    scope = get_manage_scope(user)
    if scope == "manage_users_global":
        return True
    if scope == "manage_users_company":
        return bool(user.company_id)
    if scope == "manage_users_entity":
        return bool(user.company_id and user.entity_id)
    return False


def can_view_any_users(user):
    return get_view_scope_filter(user) is not None


def get_visible_users_queryset(user):
    scope_filter = get_view_scope_filter(user)
    if scope_filter is None:
        return user.__class__.objects.none()

    actor_level = get_role_visibility_floor(user)
    role_level_case = Case(
        *[
            When(assigned_roles__role__key=role_key, then=Value(level))
            for role_key, level in ROLE_HIERARCHY.items()
        ],
        default=Value(0),
        output_field=IntegerField(),
    )
    return (
        user.__class__.objects.exclude(id=user.id)
        .filter(scope_filter)
        .annotate(max_role_level=Max(role_level_case))
        .filter(max_role_level__lte=actor_level)
        .order_by("username")
    )


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
    if not can_manage_any_users(actor):
        return False
    if not can_view_target_user(actor, target):
        return False
    if actor.id == target.id:
        return False
    actor_scope = get_manage_scope(actor)
    if actor_scope == "manage_users_entity":
        if target.company_id != actor.company_id or target.entity_id != actor.entity_id:
            return False
    return get_user_max_role_level(target) < get_user_max_role_level(actor)


def get_request_scope_filter(user):
    effective_permissions = set(get_effective_permission_keys(user))
    if "view_all_requests" in effective_permissions:
        return Q()
    if "view_company_requests" in effective_permissions and user.company_id:
        return Q(requester_user__company_id=user.company_id)
    if "view_entity_requests" in effective_permissions and user.entity_id:
        return Q(requester_user__entity_id=user.entity_id)
    if "view_team_requests" in effective_permissions:
        team_user_ids = list(
            user.__class__.objects.filter(team_leader_id=user.id).values_list("id", flat=True)
        )
        return (
            Q(requester_user_id=user.id)
            | Q(current_assignee_id=user.id)
            | Q(requester_user_id__in=team_user_ids)
            | Q(current_assignee_id__in=team_user_ids)
        )
        if user.entity_id:
            return (
                Q(target_entity_id=user.entity_id)
                | Q(target_entity__isnull=True, target_unit__code=user.entity.code)
                | Q(requester_user_id=user.id)
                | Q(current_assignee_id=user.id)
                | Q(requester_user_id__in=team_user_ids)
                | Q(current_assignee_id__in=team_user_ids)
            )
        return Q(requester_user_id=user.id) | Q(current_assignee_id=user.id)
    if "view_own_requests" in effective_permissions:
        return Q(requester_user_id=user.id) | Q(current_assignee_id=user.id)
    return Q(pk__in=[])


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


def can_create_requests(user):
    if not has_permission(user, "create_request"):
        return False
    role_keys = set(get_user_role_keys(user))
    if "super_admin" in role_keys:
        return True
    if "senior" in role_keys:
        return bool(user.company_id)
    return bool(
        user.company_id
        and user.entity_id
        and user.entity
        and user.entity.entity_type == Entity.EntityType.PROD
    )


def get_default_permissions_for_role(role_key):
    return sorted(DEFAULT_ROLE_PERMISSION_MATRIX.get(role_key, set()))
