from django.utils import timezone

from django.db.models import Q, Case, When, Value, IntegerField, Max

from apps.entities.models import Entity
from apps.permissions_app.models import (
    AppPermission,
    PermissionDelegation,
    RolePermission,
    UserRequestPermissionOverride,
    UserAccessDelegation,
    UserPermissionOverride,
    UserScopedAccessOverride,
)
from .constants import (
    DEFAULT_ROLE_PERMISSION_MATRIX,
    ROLE_HIERARCHY,
)

MANAGE_PERMISSION_SCOPE_ORDER = [
    "manage_users_global",
    "manage_users_company",
    "manage_users_entity",
    "manage_assigned_users",
]

REPORT_PERMISSION_KEYS = {
    "view_global_reports",
    "view_company_reports",
    "view_entity_reports",
}
ROLE_LOCKED_PERMISSION_KEYS = {
    "manage_assigned_users": {"team_leader"},
}

ROLE_PERMISSION_HIERARCHY_ERROR = "You can only manage users below your role."
ROLE_PERMISSION_OWNERSHIP_ERROR = "You can only assign permissions you already have."
REQUEST_PERMISSION_OVERRIDE_KEYS = [
    "request.view",
    "request.assign",
    "request.update_status",
    "request.comment",
    "request.view_discussion",
    "request.edit_deadline",
    "request.invite_members",
]
PROD_REQUEST_PERMISSION_OVERRIDE_KEYS = [
    "request.view",
    "request.approve",
    "request.comment",
    "request.view_discussion",
    "request.invite_members",
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
    effective = allowed - denied
    primary_role_key = get_primary_role_key(user)
    for permission_key, allowed_roles in ROLE_LOCKED_PERMISSION_KEYS.items():
        if permission_key in effective and primary_role_key not in allowed_roles:
            effective.discard(permission_key)
    return sorted(effective)


def get_explicit_user_permission_keys(user):
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
    allowed = delegated | {key for key, value in overrides.items() if value}
    denied = {key for key, value in overrides.items() if not value}
    effective = allowed - denied
    primary_role_key = get_primary_role_key(user)
    for permission_key, allowed_roles in ROLE_LOCKED_PERMISSION_KEYS.items():
        if permission_key in effective and primary_role_key not in allowed_roles:
            effective.discard(permission_key)
    return effective


def has_permission(user, permission_key):
    return permission_key in set(get_effective_permission_keys(user))


def has_any_permission(user, permission_keys):
    effective = set(get_effective_permission_keys(user))
    return bool(set(permission_keys) & effective)


def has_all_permissions(user, permission_keys):
    effective = set(get_effective_permission_keys(user))
    return set(permission_keys).issubset(effective)


def can_access_reports_page(user):
    role_key = get_primary_role_key(user)
    if role_key not in {"super_admin", "senior", "manager"}:
        return False
    return has_any_permission(user, REPORT_PERMISSION_KEYS)


def get_effective_analytics_scope(user):
    effective_permissions = set(get_effective_permission_keys(user))
    role_key = get_primary_role_key(user)
    report_permissions = effective_permissions
    if role_key in {"team_leader", "user"}:
        report_permissions = set(get_explicit_user_permission_keys(user)) & REPORT_PERMISSION_KEYS

    if "view_global_reports" in report_permissions and role_key == "super_admin":
        return "global"
    if "view_global_reports" in report_permissions and user.company_id:
        return "company"
    if "view_company_reports" in report_permissions and user.company_id:
        return "company"
    if "view_entity_reports" in report_permissions and user.entity_id:
        return "entity"

    if role_key == "team_leader":
        return "team"
    if role_key == "user":
        return "own"

    if "view_all_requests" in effective_permissions:
        return "global"
    if "view_company_requests" in effective_permissions and user.company_id:
        return "company"
    if "view_entity_requests" in effective_permissions and user.entity_id:
        return "entity"
    if "view_team_requests" in effective_permissions:
        return "team"
    if "view_own_requests" in effective_permissions:
        return "own"
    if role_key == "super_admin":
        return "global"
    if role_key == "senior" and user.company_id:
        return "company"
    if role_key == "manager" and user.entity_id:
        return "entity"
    return "none"


def get_dashboard_profile(user):
    role_key = get_primary_role_key(user)
    entity_type = user.entity.entity_type if user.entity_id and user.entity else ""

    if role_key == "user":
        return "requester" if entity_type == Entity.EntityType.PROD else "resolver"
    if role_key == "team_leader":
        return "team_requester" if entity_type == Entity.EntityType.PROD else "team_resolver"
    if role_key == "manager":
        return "entity_requester" if entity_type == Entity.EntityType.PROD else "entity_resolver"
    if role_key == "senior":
        return "company_analytics"
    if role_key == "super_admin":
        return "global_analytics"
    return "requester"


def get_analytics_request_scope_filter(user):
    scope = get_effective_analytics_scope(user)

    if scope == "global":
        return Q()
    if scope == "company" and user.company_id:
        company_scope = (
            Q(company_id=user.company_id)
            | Q(company__isnull=True, requester_user__company_id=user.company_id)
        )
        same_company_entities = (
            Q(source_entity__isnull=True) | Q(source_entity__company_id=user.company_id)
        ) & (
            Q(target_entity__isnull=True) | Q(target_entity__company_id=user.company_id)
        )
        return company_scope & same_company_entities
    if scope == "entity" and user.entity_id:
        entity_scope = (
            Q(source_entity_id=user.entity_id)
            | Q(target_entity_id=user.entity_id)
            | Q(requester_user__entity_id=user.entity_id)
        )
        same_company_entities = (
            Q(source_entity__isnull=True) | Q(source_entity__company_id=user.company_id)
        ) & (
            Q(target_entity__isnull=True) | Q(target_entity__company_id=user.company_id)
        )
        return entity_scope & same_company_entities
    if scope == "team":
        team_user_ids = list(
            user.__class__.objects.filter(team_leader_id=user.id).values_list("id", flat=True)
        )
        return (
            Q(requester_user_id=user.id)
            | Q(current_assignee_id=user.id)
            | Q(requester_user_id__in=team_user_ids)
            | Q(current_assignee_id__in=team_user_ids)
        )
    if scope == "own":
        return Q(requester_user_id=user.id) | Q(current_assignee_id=user.id)
    return Q(pk__in=[])


def get_delegatable_permission_keys(editor_user):
    if get_primary_role_key(editor_user) == "super_admin":
        return sorted(
            AppPermission.objects.values_list("key", flat=True).distinct()
        )
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
    if "manage_assigned_users" in effective_permissions:
        return Q(team_leader_id=user.id)
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
    has_assigned = "manage_assigned_users" in effective_permissions

    if has_global:
        return "view_users_global"
    if has_company:
        return "view_users_company"
    if has_entity:
        return "view_users_entity"
    if has_assigned:
        return "view_users_assigned"
    return None


def get_view_scope_filter(user):
    scope = get_view_scope(user)
    if scope == "view_users_global":
        return Q()
    if scope == "view_users_company" and user.company_id:
        return Q(company_id=user.company_id)
    if scope == "view_users_entity" and user.entity_id:
        return Q(entity_id=user.entity_id)
    if scope == "view_users_assigned":
        return Q(team_leader_id=user.id)
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
    if scope == "manage_assigned_users":
        return True
    return False


def can_view_any_users(user):
    return get_view_scope_filter(user) is not None


def get_visible_users_queryset(user):
    scope_filter = get_view_scope_filter(user)
    base_queryset = user.__class__.objects.none()
    if scope_filter is not None:
        actor_level = get_role_visibility_floor(user)
        role_level_case = Case(
            *[
                When(assigned_roles__role__key=role_key, then=Value(level))
                for role_key, level in ROLE_HIERARCHY.items()
            ],
            default=Value(0),
            output_field=IntegerField(),
        )
        base_queryset = (
            user.__class__.objects.exclude(id=user.id)
            .filter(scope_filter)
            .annotate(max_role_level=Max(role_level_case))
            .filter(max_role_level__lte=actor_level)
        )

    allow_ids = set(
        UserScopedAccessOverride.objects.filter(
            user=user,
            control_key=UserScopedAccessOverride.ControlKey.VIEW_USERS,
            allowed=True,
        ).values_list("subject_user_id", flat=True)
    )
    deny_ids = set(
        UserScopedAccessOverride.objects.filter(
            user=user,
            control_key=UserScopedAccessOverride.ControlKey.VIEW_USERS,
            allowed=False,
        ).values_list("subject_user_id", flat=True)
    )

    extra_queryset = user.__class__.objects.filter(id__in=allow_ids)
    queryset = (base_queryset | extra_queryset).exclude(id=user.id).exclude(id__in=deny_ids)
    return queryset.distinct().order_by("username")


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
    override_value = (
        UserScopedAccessOverride.objects.filter(
            user=actor,
            subject_user=target,
            control_key=UserScopedAccessOverride.ControlKey.VIEW_USERS,
        )
        .values_list("allowed", flat=True)
        .first()
    )
    if override_value is not None:
        return bool(override_value)
    return get_visible_users_queryset(actor).filter(id=target.id).exists()


def can_manage_target_user(actor, target):
    if actor.id == target.id:
        return False
    override_value = (
        UserScopedAccessOverride.objects.filter(
            user=actor,
            subject_user=target,
            control_key=UserScopedAccessOverride.ControlKey.MANAGE_USERS,
        )
        .values_list("allowed", flat=True)
        .first()
    )
    if override_value is not None:
        return bool(override_value)
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
    if actor_scope == "manage_assigned_users":
        if target.team_leader_id != actor.id:
            return False
    return get_user_max_role_level(target) < get_user_max_role_level(actor)


def can_manage_target_user_permissions(actor, target):
    if actor.id == target.id:
        return False
    override_value = (
        UserScopedAccessOverride.objects.filter(
            user=actor,
            subject_user=target,
            control_key=UserScopedAccessOverride.ControlKey.PERMISSION_MANAGEMENT,
        )
        .values_list("allowed", flat=True)
        .first()
    )
    if override_value is not None:
        return bool(override_value)
    if not has_permission(actor, "permission_management"):
        return False
    if not can_view_target_user(actor, target):
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
    
    # Get delegatable permissions if editor is provided
    delegatable_keys = set()
    if editor_user is not None:
        delegatable_keys = set(get_delegatable_permission_keys(editor_user))
    
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
                "delegatable": permission.key in delegatable_keys if editor_user else None,
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


def is_super_admin_user(user):
    return get_primary_role_key(user) == "super_admin"


def is_valid_request_permission_key(permission_key):
    return permission_key in set(REQUEST_PERMISSION_OVERRIDE_KEYS)


def get_allowed_request_override_keys_for_user(user):
    entity = getattr(user, "entity", None)
    entity_type = getattr(entity, "entity_type", "")
    if entity_type == Entity.EntityType.PROD:
        return list(PROD_REQUEST_PERMISSION_OVERRIDE_KEYS)
    return list(REQUEST_PERMISSION_OVERRIDE_KEYS)


def get_request_permission_override_value(user, service_request, permission_key):
    if not is_valid_request_permission_key(permission_key):
        return None
    return (
        UserRequestPermissionOverride.objects.filter(
            user=user,
            request_id=service_request.id,
            permission_key=permission_key,
        )
        .values_list("allowed", flat=True)
        .first()
    )


def apply_request_permission_override(user, service_request, permission_key, fallback_allowed):
    override_value = get_request_permission_override_value(user, service_request, permission_key)
    if override_value is None:
        return bool(fallback_allowed)
    return bool(override_value)
