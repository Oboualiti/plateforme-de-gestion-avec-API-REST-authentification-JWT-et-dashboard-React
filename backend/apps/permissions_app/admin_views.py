from datetime import timedelta
import hashlib
import json
import logging
import time

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.db.models.deletion import ProtectedError
from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit_logs.models import AdminAuditLog
from apps.audit_logs.services import log_admin_action
from apps.companies.models import Company
from apps.entities.models import Entity
from apps.notifications.models import NotificationPreference, UserNotification
from apps.notifications.services import create_notification
from apps.permissions_app.models import AppPermission, RoleDefaultPermission, RolePermission, UserPermissionOverride, UserRole
from apps.permissions_app.services import (
    ROLE_HIERARCHY,
    ROLE_PERMISSION_HIERARCHY_ERROR,
    ROLE_PERMISSION_OWNERSHIP_ERROR,
    can_access_reports_page,
    can_manage_role_permissions,
    can_view_target_user,
    get_analytics_request_scope_filter,
    get_effective_analytics_scope,
    get_dashboard_profile,
    get_delegatable_permission_keys,
    get_effective_permission_keys,
    get_manageable_permission_keys_for_actor,
    has_any_permission,
    has_permission,
    get_primary_role_key,
    get_visible_users_queryset,
)
from apps.requests_app.models import OperationalUnit, RequestAssignmentHistory, RequestStatusHistory, ServiceRequest
from apps.requests_app.views import get_visible_requests_queryset, load_request
from apps.roles.models import Role
from apps.users.models import User
from apps.permissions_app.management.commands.seed_roles_permissions import PERMISSION_MATRIX

from .admin_serializers import (
    AssignmentHistorySerializer,
    AuditLogSerializer,
    CompanyAdminSerializer,
    CompanyWriteSerializer,
    EffectivePermissionUserSerializer,
    EntityAdminSerializer,
    EntityWriteSerializer,
    HierarchyAssignmentSerializer,
    NotificationPreferenceSerializer,
    PermissionCatalogSerializer,
    RequestAdminSummarySerializer,
    RequestAdminUpdateSerializer,
    RoleAdminSerializer,
    RolePermissionMappingSerializer,
    RoleScopeSerializer,
    StatusTrackingSerializer,
)
from .serializers import ManageableUserListSerializer


ADMIN_MODULE_PERMISSIONS = {
    "dashboard": set(),
    "companies": {"manage_companies", "view_all_companies"},
    "entities": {"manage_entities", "view_company_entities"},
    "hierarchy": {"view_company_entities", "manage_users_entity", "manage_users_company"},
    "users": {"manage_users_global", "manage_users_company", "manage_users_entity"},
    "roles": {"manage_users_global", "manage_users_company", "manage_users_entity", "permission_management"},
    "permissions": {"manage_users_global", "manage_users_company", "manage_users_entity", "permission_management"},
    "requests": {"view_all_requests", "view_company_requests", "view_entity_requests", "view_team_requests"},
    "assignments": {"assign_request"},
    "status_tracking": {"view_all_requests", "view_company_requests", "view_entity_requests", "view_team_requests"},
    "audit_logs": {"view_audit_logs", "view_user_audit_logs", "view_access_audit_logs", "view_org_audit_logs"},
    "notifications": {"view_company_requests", "view_entity_requests", "view_team_requests", "view_own_requests"},
    "reports": {"view_global_reports", "view_company_reports", "view_entity_reports"},
}

AUDIT_LOG_MODULES_BY_PERMISSION = {
    "view_user_audit_logs": {"users"},
    "view_access_audit_logs": {"permissions", "roles"},
    "view_org_audit_logs": {"companies", "entities", "hierarchy"},
}

ROLE_PERMISSION_IMPLICATIONS = {
    "manage_company_entities": {"view_company_entities"},
    "manage_users_global": {"view_users_global", "manage_users_company", "manage_users_entity"},
    "manage_users_company": {"view_users_company", "manage_users_entity"},
    "manage_users_entity": {"view_users_entity"},
    "view_users_global": {"view_users_company", "view_users_entity"},
    "view_users_company": {"view_users_entity"},
    "comment_request": {"view_request_discussion"},
}

ROLE_DEFAULT_PERMISSION_KEYS = {
    role_key: {permission_key for permission_key, allowed_roles in PERMISSION_MATRIX.items() if role_key in allowed_roles}
    for role_key in ROLE_HIERARCHY.keys()
}

LOG_SCOPE_GLOBAL_KEY = "view_logs_scope_global"
LOG_SCOPE_COMPANY_KEY = "view_logs_scope_company"
LOG_SCOPE_ENTITY_KEY = "view_logs_scope_entity"
LOG_SCOPE_TEAM_KEY = "view_logs_scope_team"
logger = logging.getLogger(__name__)


def has_permission_management_access(user):
    return has_permission(user, "permission_management")


def normalize_log_scope_permission_keys(role_key, permission_keys):
    keys = set(permission_keys or [])

    if LOG_SCOPE_GLOBAL_KEY in keys:
        keys.update({LOG_SCOPE_COMPANY_KEY, LOG_SCOPE_ENTITY_KEY, LOG_SCOPE_TEAM_KEY})
    elif LOG_SCOPE_COMPANY_KEY in keys:
        keys.update({LOG_SCOPE_ENTITY_KEY, LOG_SCOPE_TEAM_KEY})
    elif LOG_SCOPE_ENTITY_KEY in keys:
        keys.add(LOG_SCOPE_TEAM_KEY)

    # Role-specific guardrails for realistic delegation scope.
    if role_key == "senior" and (LOG_SCOPE_ENTITY_KEY in keys or LOG_SCOPE_TEAM_KEY in keys):
        keys.add(LOG_SCOPE_COMPANY_KEY)
    if role_key == "manager" and LOG_SCOPE_TEAM_KEY in keys:
        keys.add(LOG_SCOPE_ENTITY_KEY)

    return sorted(keys)


def normalize_request_status_permission_keys(permission_keys):
    keys = set(permission_keys or [])
    if "resolve_request" not in keys:
        keys.discard("close_request")
    return sorted(keys)


HIDDEN_ROLE_PERMISSION_KEYS = {"view_audit_logs"}
ROLE_LOCKED_PERMISSION_KEYS = {
    "manage_assigned_users": {"team_leader"},
}


def strip_role_locked_permission_keys(role_key, permission_keys):
    keys = set(permission_keys or [])
    for permission_key, allowed_roles in ROLE_LOCKED_PERMISSION_KEYS.items():
        if role_key not in allowed_roles:
            keys.discard(permission_key)
    return sorted(keys)


def validate_role_locked_permission_keys(role_key, permission_keys):
    for permission_key, allowed_roles in ROLE_LOCKED_PERMISSION_KEYS.items():
        if permission_key in set(permission_keys) and role_key not in allowed_roles:
            return (
                False,
                f"{permission_key} can only be enabled for: {', '.join(sorted(allowed_roles))}.",
            )
    return True, ""


def get_saved_default_permission_keys(role):
    custom_keys = set(
        RoleDefaultPermission.objects.filter(role=role).values_list("permission__key", flat=True)
    )
    if custom_keys:
        return set(strip_role_locked_permission_keys(role.key, custom_keys))

    role_keys = set(
        RolePermission.objects.filter(role=role).values_list("permission__key", flat=True)
    )
    if role_keys:
        return set(strip_role_locked_permission_keys(role.key, role_keys))

    return set(
        strip_role_locked_permission_keys(
            role.key,
            normalize_request_status_permission_keys(ROLE_DEFAULT_PERMISSION_KEYS.get(role.key, set())),
        )
    )


class AdminBaseView(APIView):
    permission_classes = [IsAuthenticated]
    module_key = ""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        allowed_permissions = ADMIN_MODULE_PERMISSIONS.get(self.module_key, set())
        if allowed_permissions and not has_any_permission(request.user, allowed_permissions):
            self.permission_denied(request, message="You do not have access to this admin section.")
        if self.module_key == "reports" and not can_access_reports_page(request.user):
            self.permission_denied(request, message="You do not have access to this admin section.")

    def role_key(self, user):
        return get_primary_role_key(user)

    def scoped_companies(self, user):
        if has_any_permission(user, {"manage_companies", "view_all_companies", "view_all_entities"}):
            return Company.objects.all()
        if (
            has_permission(user, "view_company_entities")
            or has_permission(user, "manage_company_entities")
        ) and user.company_id:
            return Company.objects.filter(id=user.company_id)
        if user.company_id:
            return Company.objects.filter(id=user.company_id)
        return Company.objects.none()

    def scoped_entities(self, user):
        if has_permission(user, "manage_entities") or has_permission(user, "view_all_entities"):
            return Entity.objects.select_related("company").all()
        if has_permission(user, "manage_company_entities") and user.company_id:
            return Entity.objects.select_related("company").filter(company_id=user.company_id)
        if has_permission(user, "view_company_entities") and user.company_id:
            return Entity.objects.select_related("company").filter(company_id=user.company_id)
        if user.entity_id:
            return Entity.objects.select_related("company").filter(id=user.entity_id)
        return Entity.objects.none()

    def scoped_users(self, user):
        visible_ids = list(get_visible_users_queryset(user).values_list("id", flat=True))
        return User.objects.select_related("company", "entity", "team_leader").filter(
            Q(id__in=visible_ids) | Q(id=user.id)
        )

    def scoped_users_count_fast(self, user):
        if has_any_permission(user, {"manage_users_global", "view_users_global"}):
            return User.objects.filter(is_active=True).count()
        if has_any_permission(user, {"manage_users_company", "view_users_company"}) and user.company_id:
            return User.objects.filter(is_active=True, company_id=user.company_id).count()
        if has_any_permission(user, {"manage_users_entity", "view_users_entity"}) and user.entity_id:
            return User.objects.filter(is_active=True, entity_id=user.entity_id).count()
        return 1 if user.is_active else 0

    def scoped_requests(self, user, include_related=True, include_ordering=True):
        return get_visible_requests_queryset(
            user,
            include_related=include_related,
            include_ordering=include_ordering,
        )

    def scoped_report_requests(self, user):
        return self.scoped_analytics_requests(user)

    def scoped_analytics_requests(self, user):
        return ServiceRequest.objects.all().filter(get_analytics_request_scope_filter(user))

    def build_stats_cache_key(self, *, area, user, extra=None):
        payload = {
            "area": area,
            "user_id": user.id,
            "company_id": user.company_id,
            "entity_id": user.entity_id,
            "role": get_primary_role_key(user),
            "analytics_scope": get_effective_analytics_scope(user),
            "permissions": sorted(get_effective_permission_keys(user)),
            "version": 2,
            "extra": extra or {},
        }
        digest = hashlib.md5(
            json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest()
        return f"admin_stats:{area}:{user.id}:{digest}"

    def maybe_profile_meta(self, *, request, started_at):
        if not settings.DEBUG:
            return None
        if str(request.query_params.get("profile", "")).lower() not in {"1", "true", "yes"}:
            return None
        duration_ms = (time.perf_counter() - started_at) * 1000
        query_count = len(getattr(connection, "queries", []))
        return {"duration_ms": round(duration_ms, 2), "query_count": query_count}

    def scoped_audit_logs(self, user):
        queryset = AdminAuditLog.objects.select_related("actor", "actor__company", "actor__entity").order_by("-created_at")

        effective = set(get_effective_permission_keys(user))

        allowed_modules = set()
        if "view_audit_logs" in effective:
            for modules in AUDIT_LOG_MODULES_BY_PERMISSION.values():
                allowed_modules.update(modules)
        else:
            if "view_user_audit_logs" in effective:
                allowed_modules.update(AUDIT_LOG_MODULES_BY_PERMISSION["view_user_audit_logs"])
            if "view_access_audit_logs" in effective:
                allowed_modules.update(AUDIT_LOG_MODULES_BY_PERMISSION["view_access_audit_logs"])
            if "view_org_audit_logs" in effective:
                allowed_modules.update(AUDIT_LOG_MODULES_BY_PERMISSION["view_org_audit_logs"])

        if not allowed_modules:
            return queryset.none()

        scoped_queryset = queryset.filter(module__in=allowed_modules)

        # Scope is permission-driven, not role-driven.
        if "view_logs_scope_global" in effective:
            return scoped_queryset

        if "view_logs_scope_company" in effective and user.company_id:
            company_user_ids = list(User.objects.filter(company_id=user.company_id).values_list("id", flat=True))
            company_user_ids_str = [str(item) for item in company_user_ids]
            company_entity_ids = list(Entity.objects.filter(company_id=user.company_id).values_list("id", flat=True))
            company_entity_ids_str = [str(item) for item in company_entity_ids]
            return scoped_queryset.filter(
                Q(target_model="User", target_id__in=company_user_ids_str)
                | Q(target_model="Company", target_id=str(user.company_id))
                | Q(target_model="Entity", target_id__in=company_entity_ids_str)
                | Q(module="roles", metadata__company_id=user.company_id)
                | Q(module="roles", metadata__entity_id__in=company_entity_ids)
                | Q(module="roles", metadata__team_leader_id__in=company_user_ids)
            )

        if "view_logs_scope_entity" in effective and user.entity_id:
            entity_user_ids = list(User.objects.filter(entity_id=user.entity_id).values_list("id", flat=True))
            entity_user_ids_str = [str(item) for item in entity_user_ids]
            entity_team_leader_ids = list(
                User.objects.filter(entity_id=user.entity_id, assigned_roles__role__key="team_leader")
                .values_list("id", flat=True)
                .distinct()
            )
            return scoped_queryset.filter(
                Q(target_model="User", target_id__in=entity_user_ids_str)
                | Q(target_model="Entity", target_id=str(user.entity_id))
                | Q(module="roles", metadata__entity_id=user.entity_id)
                | Q(module="roles", metadata__team_leader_id__in=entity_team_leader_ids)
            )

        if "view_logs_scope_team" in effective:
            if user.team_leader_id:
                team_user_ids = list(User.objects.filter(Q(team_leader_id=user.team_leader_id) | Q(id=user.team_leader_id) | Q(id=user.id)).values_list("id", flat=True))
            elif get_primary_role_key(user) == "team_leader":
                team_user_ids = list(User.objects.filter(Q(team_leader_id=user.id) | Q(id=user.id)).values_list("id", flat=True))
            else:
                team_user_ids = [user.id]
            team_user_ids_str = [str(item) for item in team_user_ids]
            filters = Q(target_model="User", target_id__in=team_user_ids_str) | Q(actor_id__in=team_user_ids)
            if user.entity_id:
                filters |= Q(target_model="Entity", target_id=str(user.entity_id))
                filters |= Q(module="roles", metadata__entity_id=user.entity_id)
                filters |= Q(module="roles", metadata__team_leader_id__in=team_user_ids)
            return scoped_queryset.filter(filters)

        # No explicit log-scope permission -> no logs.
        return queryset.none()


class AdminDashboardView(AdminBaseView):
    module_key = "dashboard"

    def get(self, request):
        started_at = time.perf_counter()
        cache_extra = {
            "date_from": request.query_params.get("date_from"),
            "date_to": request.query_params.get("date_to"),
        }
        cache_key = self.build_stats_cache_key(
            area="dashboard",
            user=request.user,
            extra=cache_extra,
        )
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        request_qs = self.scoped_analytics_requests(request.user)
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from:
            request_qs = request_qs.filter(created_at__date__gte=date_from)
        if date_to:
            request_qs = request_qs.filter(created_at__date__lte=date_to)
        open_statuses = [ServiceRequest.Status.NEW, ServiceRequest.Status.ACCEPTED, ServiceRequest.Status.IN_PROGRESS]
        stale_cutoff = timezone.now() - timedelta(days=7)
        recent_logs = self.scoped_audit_logs(request.user)
        queue_counts = request_qs.aggregate(
            pending=Count("id", filter=Q(status=ServiceRequest.Status.NEW)),
            open=Count("id", filter=Q(status__in=open_statuses)),
            stuck=Count(
                "id",
                filter=Q(status__in=open_statuses, created_at__lt=stale_cutoff),
            ),
            unassigned=Count(
                "id",
                filter=Q(status__in=open_statuses, current_assignee__isnull=True),
            ),
        )
        workload_qs = request_qs.filter(status__in=open_statuses)
        if get_primary_role_key(request.user) == "user":
            if request.user.team_leader_id:
                same_team_user_ids = User.objects.filter(
                    Q(team_leader_id=request.user.team_leader_id)
                    | Q(id=request.user.team_leader_id)
                ).values_list("id", flat=True)
            else:
                same_team_user_ids = [request.user.id]
            workload_qs = workload_qs.filter(current_assignee_id__in=same_team_user_ids)
        analytics_scope = get_effective_analytics_scope(request.user)
        dashboard_profile = get_dashboard_profile(request.user)
        entity_group_field = (
            "company__name"
            if analytics_scope == "global"
            else "requester_user__entity__name"
            if analytics_scope == "team" and dashboard_profile == "team_requester"
            else
            "current_assignee__entity__name"
            if analytics_scope == "team"
            else "target_entity__name"
        )

        payload = {
            "totals": {
                "users": self.scoped_users_count_fast(request.user),
                "requests": request_qs.count(),
                "companies": self.scoped_companies(request.user).count(),
                "entities": self.scoped_entities(request.user).count(),
            },
            "requests_by_status": list(request_qs.values("status").annotate(total=Count("id")).order_by("status")),
            "requests_by_company": list(
                request_qs.values("company__name").annotate(total=Count("id")).order_by("-total", "company__name")[:50]
            ),
            "requests_by_entity": list(
                request_qs.exclude(**{f"{entity_group_field}__isnull": True})
                .values(entity_group_field)
                .annotate(total=Count("id"))
                .order_by("-total", entity_group_field)[:20]
            ),
            "queue": queue_counts,
            "team_workload": list(
                workload_qs
                .values("current_assignee__username")
                .annotate(total=Count("id"))
                .order_by("-total")[:20]
            ),
            "recent_activity": AuditLogSerializer(recent_logs[:8], many=True).data,
        }
        profile_meta = self.maybe_profile_meta(request=request, started_at=started_at)
        if profile_meta:
            payload["_profile"] = profile_meta
            logger.debug("AdminDashboard profile: %s", profile_meta)
        cache.set(cache_key, payload, timeout=60)
        return Response(payload)


class AdminCompaniesView(AdminBaseView):
    module_key = "companies"

    def get_queryset(self, user):
        return self.scoped_companies(user).annotate(
            entity_count=Count("entities", filter=Q(entities__is_active=True), distinct=True),
            user_count=Count("users", filter=Q(users__is_active=True), distinct=True),
        ).order_by("name")

    def get(self, request):
        rows = []
        for company in self.get_queryset(request.user):
            senior = User.objects.filter(
                company_id=company.id,
                assigned_roles__role__key="senior",
                is_active=True,
            ).first()
            company.senior_name = senior.get_full_name() or senior.username if senior else ""
            rows.append(company)
        senior_options = list(
            self.scoped_users(request.user)
            .filter(assigned_roles__role__key="senior", is_active=True)
            .values("id", "username", "company_id")
            .distinct()
            .order_by("username")
        )
        return Response(
            {
                "companies": CompanyAdminSerializer(rows, many=True).data,
                "senior_options": senior_options,
            }
        )

    def post(self, request):
        if not has_permission(request.user, "manage_companies"):
            return Response({"detail": "You do not have permission to manage companies."}, status=status.HTTP_403_FORBIDDEN)
        serializer = CompanyWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        company = serializer.save()
        log_admin_action(actor=request.user, module="companies", action="create", target_model="Company", target_id=company.id, target_label=company.name)
        return Response(CompanyAdminSerializer(company).data, status=status.HTTP_201_CREATED)


class AdminCompanyDetailView(AdminBaseView):
    module_key = "companies"

    def patch(self, request, company_id):
        if not has_permission(request.user, "manage_companies"):
            return Response({"detail": "You do not have permission to manage companies."}, status=status.HTTP_403_FORBIDDEN)
        company = self.scoped_companies(request.user).filter(id=company_id).first()
        if company is None:
            return Response({"detail": "Company not found."}, status=status.HTTP_404_NOT_FOUND)
        
        is_active = request.data.get('is_active')
        
        serializer = CompanyWriteSerializer(company, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        if is_active is not None:
            Entity.objects.filter(company_id=company_id).update(is_active=is_active)
            User.objects.filter(company_id=company_id).update(is_active=is_active)
        
        company.refresh_from_db()
        log_admin_action(actor=request.user, module="companies", action="update", target_model="Company", target_id=company.id, target_label=company.name)
        return Response(CompanyAdminSerializer(company).data)

    def delete(self, request, company_id):
        if not has_permission(request.user, "manage_companies"):
            return Response({"detail": "You do not have permission to manage companies."}, status=status.HTTP_403_FORBIDDEN)
        company = self.scoped_companies(request.user).filter(id=company_id).first()
        if company is None:
            return Response({"detail": "Company not found."}, status=status.HTTP_404_NOT_FOUND)
        company_name = company.name
        try:
            company.delete()
        except ProtectedError:
            return Response(
                {"detail": "Cannot remove company because it is linked to existing requests or protected records."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        log_admin_action(
            actor=request.user,
            module="companies",
            action="delete",
            target_model="Company",
            target_id=company_id,
            target_label=company_name,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminEntitiesView(AdminBaseView):
    module_key = "entities"

    def get_queryset(self, user):
        return self.scoped_entities(user).annotate(
            user_count=Count("users", filter=Q(users__is_active=True))
        ).order_by("company__name", "name")

    def get(self, request):
        queryset = self.get_queryset(request.user)
        company_id = request.query_params.get("company_id")
        if company_id:
            queryset = queryset.filter(company_id=company_id)
            
        rows = []
        for entity in queryset:
            manager = User.objects.filter(
                entity_id=entity.id,
                assigned_roles__role__key="manager",
                is_active=True,
            ).first()
            entity.manager_name = manager.username if manager else ""
            rows.append(entity)
        scoped_companies = self.scoped_companies(request.user)
        if company_id:
            scoped_companies = scoped_companies.filter(id=company_id)

        scoped_managers = self.scoped_users(request.user).filter(
            assigned_roles__role__key="manager",
            is_active=True,
        )
        if company_id:
            scoped_managers = scoped_managers.filter(company_id=company_id)

        return Response(
            {
                "entities": EntityAdminSerializer(rows, many=True).data,
                "companies": list(
                    scoped_companies.values("id", "name", "code", "is_active").order_by("name")
                ),
                "manager_options": list(
                    scoped_managers.values("id", "username", "company_id", "entity_id")
                    .distinct()
                    .order_by("username")
                ),
            }
        )

    def post(self, request):
        can_manage_global_entities = has_permission(request.user, "manage_entities")
        can_manage_company_entities = has_permission(request.user, "manage_company_entities")
        if not (can_manage_global_entities or can_manage_company_entities):
            return Response({"detail": "You do not have permission to manage entities."}, status=status.HTTP_403_FORBIDDEN)
        serializer = EntityWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if can_manage_company_entities and not can_manage_global_entities:
            if not request.user.company_id:
                return Response(
                    {"detail": "You must belong to a company to manage company entities."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            company = serializer.validated_data.get("company")
            if not company or company.id != request.user.company_id:
                return Response(
                    {"detail": "You can only manage entities in your own company."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        entity = serializer.save()
        log_admin_action(actor=request.user, module="entities", action="create", target_model="Entity", target_id=entity.id, target_label=entity.name)
        return Response(EntityAdminSerializer(entity).data, status=status.HTTP_201_CREATED)


class AdminEntityDetailView(AdminBaseView):
    module_key = "entities"

    def patch(self, request, entity_id):
        can_manage_global_entities = has_permission(request.user, "manage_entities")
        can_manage_company_entities = has_permission(request.user, "manage_company_entities")
        if not (can_manage_global_entities or can_manage_company_entities):
            return Response({"detail": "You do not have permission to manage entities."}, status=status.HTTP_403_FORBIDDEN)
        entity = self.scoped_entities(request.user).filter(id=entity_id).first()
        if entity is None:
            return Response({"detail": "Entity not found."}, status=status.HTTP_404_NOT_FOUND)
        
        is_active = request.data.get('is_active')
        
        serializer = EntityWriteSerializer(entity, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if can_manage_company_entities and not can_manage_global_entities:
            if not request.user.company_id:
                return Response(
                    {"detail": "You must belong to a company to manage company entities."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            company = serializer.validated_data.get("company")
            if company and company.id != request.user.company_id:
                return Response(
                    {"detail": "You can only manage entities in your own company."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        serializer.save()
        
        if is_active is not None:
            User.objects.filter(entity_id=entity_id).update(is_active=is_active)
        
        entity.refresh_from_db()
        log_admin_action(actor=request.user, module="entities", action="update", target_model="Entity", target_id=entity.id, target_label=entity.name)
        return Response(EntityAdminSerializer(entity).data)

    def delete(self, request, entity_id):
        can_manage_global_entities = has_permission(request.user, "manage_entities")
        can_manage_company_entities = has_permission(request.user, "manage_company_entities")
        if not (can_manage_global_entities or can_manage_company_entities):
            return Response({"detail": "You do not have permission to manage entities."}, status=status.HTTP_403_FORBIDDEN)
        entity = self.scoped_entities(request.user).filter(id=entity_id).first()
        if entity is None:
            return Response({"detail": "Entity not found."}, status=status.HTTP_404_NOT_FOUND)
        if can_manage_company_entities and not can_manage_global_entities:
            if not request.user.company_id or entity.company_id != request.user.company_id:
                return Response(
                    {"detail": "You can only manage entities in your own company."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        entity_name = entity.name
        try:
            entity.delete()
        except ProtectedError:
            return Response(
                {"detail": "Cannot remove entity because it is linked to existing requests or protected records."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        log_admin_action(
            actor=request.user,
            module="entities",
            action="delete",
            target_model="Entity",
            target_id=entity_id,
            target_label=entity_name,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminHierarchyView(AdminBaseView):
    module_key = "hierarchy"

    def get(self, request):
        def avatar_url_for(user):
            if not user or not user.avatar:
                return ""
            return request.build_absolute_uri(user.avatar.url)

        companies = []
        entities = []
        scoped_users = self.scoped_users(request.user)
        for company in self.scoped_companies(request.user).order_by("name"):
            senior = User.objects.filter(
                company_id=company.id,
                assigned_roles__role__key="senior",
                is_active=True,
            ).first()
            companies.append(
                {
                    "id": company.id,
                    "name": company.name,
                    "code": company.code,
                    "senior": senior.username if senior else "",
                    "senior_user_id": senior.id if senior else None,
                    "senior_avatar_url": avatar_url_for(senior),
                    "manager_count": User.objects.filter(
                        company_id=company.id,
                        assigned_roles__role__key="manager",
                        is_active=True,
                    ).count(),
                }
            )
        for entity in self.scoped_entities(request.user).order_by("company__name", "name"):
            manager = User.objects.filter(
                entity_id=entity.id,
                assigned_roles__role__key="manager",
                is_active=True,
            ).first()
            team_leaders = User.objects.filter(
                entity_id=entity.id,
                assigned_roles__role__key="team_leader",
                is_active=True,
            ).order_by("username")
            entities.append(
                {
                    "id": entity.id,
                    "name": entity.name,
                    "code": entity.code,
                    "company_name": entity.company.name,
                    "entity_type": entity.entity_type,
                    "manager": manager.username if manager else "",
                    "manager_user_id": manager.id if manager else None,
                    "manager_avatar_url": avatar_url_for(manager),
                    "team_leaders": [
                        {
                            "id": team_leader.id,
                            "username": team_leader.username,
                            "avatar_url": avatar_url_for(team_leader),
                            "users": [
                                {
                                    "id": member.id,
                                    "username": member.username,
                                    "avatar_url": avatar_url_for(member),
                                }
                                for member in team_leader.team_members.order_by("username")
                            ],
                        }
                        for team_leader in team_leaders
                    ],
                }
            )
        return Response(
            {
                "companies": companies,
                "entities": entities,
                "senior_options": list(
                    {
                        "id": senior.id,
                        "username": senior.username,
                        "company_id": senior.company_id,
                        "avatar_url": avatar_url_for(senior),
                    }
                    for senior in scoped_users.filter(
                        assigned_roles__role__key="senior",
                        is_active=True,
                    ).order_by("username")
                ),
                "manager_options": list(
                    {
                        "id": manager_user.id,
                        "username": manager_user.username,
                        "company_id": manager_user.company_id,
                        "entity_id": manager_user.entity_id,
                        "avatar_url": avatar_url_for(manager_user),
                    }
                    for manager_user in scoped_users.filter(
                        assigned_roles__role__key="manager",
                        is_active=True,
                    ).order_by("username")
                ),
            }
        )


class AdminHierarchyCompanyAssignView(AdminBaseView):
    module_key = "hierarchy"

    def patch(self, request, company_id):
        if not has_any_permission(request.user, {"manage_users_global", "manage_users_company"}):
            return Response({"detail": "You do not have permission to update company hierarchy."}, status=status.HTTP_403_FORBIDDEN)
        company = self.scoped_companies(request.user).filter(id=company_id).first()
        if company is None:
            return Response({"detail": "Company not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = HierarchyAssignmentSerializer(data=request.data, context={"company": company})
        serializer.is_valid(raise_exception=True)
        senior_user_id = serializer.validated_data.get("senior_user_id")
        if "senior_user_id" in serializer.validated_data:
            senior_role = Role.objects.get(key="senior")
            UserRole.objects.filter(role=senior_role, user__company_id=company.id).exclude(user_id=senior_user_id).delete()
            if senior_user_id:
                senior = User.objects.get(id=senior_user_id)
                senior.company = company
                senior.save(update_fields=["company"])
                UserRole.objects.update_or_create(user=senior, defaults={"role": senior_role})
                create_notification(
                    user=senior,
                    event_type=UserNotification.EventType.GENERAL,
                    title="You were assigned as Senior",
                    message=f"{request.user.username} assigned you as Senior for {company.name}.",
                    link="/profile",
                    metadata={"assigned_by_user_id": request.user.id, "company_id": company.id},
                )
            log_admin_action(actor=request.user, module="hierarchy", action="assign_senior", target_model="Company", target_id=company.id, target_label=company.name, metadata={"senior_user_id": senior_user_id})
        return Response({"detail": "Hierarchy updated."})


class AdminHierarchyEntityAssignView(AdminBaseView):
    module_key = "hierarchy"

    def patch(self, request, entity_id):
        if not has_any_permission(request.user, {"manage_users_global", "manage_users_company", "manage_users_entity"}):
            return Response({"detail": "You do not have permission to update entity hierarchy."}, status=status.HTTP_403_FORBIDDEN)
        entity = self.scoped_entities(request.user).filter(id=entity_id).first()
        if entity is None:
            return Response({"detail": "Entity not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = HierarchyAssignmentSerializer(data=request.data, context={"company": entity.company, "entity": entity})
        serializer.is_valid(raise_exception=True)
        manager_user_id = serializer.validated_data.get("manager_user_id")
        if "manager_user_id" in serializer.validated_data:
            manager_role = Role.objects.get(key="manager")
            UserRole.objects.filter(role=manager_role, user__entity_id=entity.id).exclude(user_id=manager_user_id).delete()
            if manager_user_id:
                manager = User.objects.get(id=manager_user_id)
                manager.company = entity.company
                manager.entity = entity
                manager.save(update_fields=["company", "entity"])
                UserRole.objects.update_or_create(user=manager, defaults={"role": manager_role})
                create_notification(
                    user=manager,
                    event_type=UserNotification.EventType.GENERAL,
                    title="You were assigned as Manager",
                    message=f"{request.user.username} assigned you as Manager for {entity.name}.",
                    link="/profile",
                    metadata={"assigned_by_user_id": request.user.id, "entity_id": entity.id},
                )
            unit = OperationalUnit.objects.filter(code=entity.code).first()
            if unit:
                unit.manager_id = manager_user_id
                unit.save(update_fields=["manager"])
            log_admin_action(actor=request.user, module="hierarchy", action="assign_manager", target_model="Entity", target_id=entity.id, target_label=entity.name, metadata={"manager_user_id": manager_user_id})
        return Response({"detail": "Hierarchy updated."})


class AdminRolesView(AdminBaseView):
    module_key = "roles"

    def get(self, request):
        if not has_permission_management_access(request.user):
            return Response({"detail": "You do not have permission to manage roles and permissions."}, status=status.HTTP_403_FORBIDDEN)
        actor_role = self.role_key(request.user)
        company_id_param = request.query_params.get("company_id")
        entity_id_param = request.query_params.get("entity_id")
        entity_type_param = request.query_params.get("entity_type")
        company_id = None
        entity_id = None
        entity_type = None

        if entity_type_param:
            allowed_entity_types = {Entity.EntityType.PROD, Entity.EntityType.SUPPORT, Entity.EntityType.TDEV}
            if entity_type_param not in allowed_entity_types:
                return Response({"detail": "Invalid entity type filter."}, status=status.HTTP_400_BAD_REQUEST)
            entity_type = entity_type_param

        if actor_role == "super_admin":
            if company_id_param:
                selected_company = Company.objects.filter(id=company_id_param, is_active=True).first()
                if selected_company is None:
                    return Response({"detail": "Selected company not found."}, status=status.HTTP_400_BAD_REQUEST)
                company_id = selected_company.id
            if entity_id_param:
                selected_entity = Entity.objects.filter(id=entity_id_param, is_active=True).first()
                if selected_entity is None:
                    return Response({"detail": "Selected entity not found."}, status=status.HTTP_400_BAD_REQUEST)
                entity_id = selected_entity.id
                if company_id and selected_entity.company_id != company_id:
                    return Response({"detail": "Selected entity does not belong to selected company."}, status=status.HTTP_400_BAD_REQUEST)
                if not company_id:
                    company_id = selected_entity.company_id
                if entity_type and selected_entity.entity_type != entity_type:
                    return Response({"detail": "Selected entity type does not match selected entity."}, status=status.HTTP_400_BAD_REQUEST)

        if actor_role == "senior" and request.user.company_id:
            company_id = request.user.company_id
            if company_id_param:
                try:
                    requested_company_id = int(company_id_param)
                except (TypeError, ValueError):
                    return Response({"detail": "Invalid company filter."}, status=status.HTTP_400_BAD_REQUEST)
                if requested_company_id != company_id:
                    return Response({"detail": "Senior can only filter within their company."}, status=status.HTTP_400_BAD_REQUEST)
            if entity_id_param:
                selected_entity = Entity.objects.filter(id=entity_id_param, company_id=company_id, is_active=True).first()
                if selected_entity is None:
                    return Response({"detail": "Selected entity not found in your company."}, status=status.HTTP_400_BAD_REQUEST)
                entity_id = selected_entity.id
                if entity_type and selected_entity.entity_type != entity_type:
                    return Response({"detail": "Selected entity type does not match selected entity."}, status=status.HTTP_400_BAD_REQUEST)

        if actor_role == "super_admin" and (company_id or entity_id or entity_type):
            user_filter = Q()
            if company_id:
                user_filter &= Q(user_assignments__user__company_id=company_id)
            if entity_id:
                user_filter &= Q(user_assignments__user__entity_id=entity_id)
            if entity_type:
                user_filter &= Q(user_assignments__user__entity__entity_type=entity_type)
            queryset = Role.objects.annotate(
                user_count=Count("user_assignments", filter=user_filter, distinct=True)
            ).order_by("name")
        elif actor_role == "senior" and request.user.company_id:
            senior_filter = Q(user_assignments__user__company_id=company_id)
            if entity_id:
                senior_filter &= Q(user_assignments__user__entity_id=entity_id)
            if entity_type:
                senior_filter &= Q(user_assignments__user__entity__entity_type=entity_type)
            queryset = Role.objects.exclude(key="super_admin").annotate(
                user_count=Count("user_assignments", filter=senior_filter, distinct=True)
            ).order_by("name")
        elif actor_role == "manager" and request.user.entity_id:
            queryset = Role.objects.filter(key__in={"manager", "team_leader", "user"}).annotate(
                user_count=Count(
                    "user_assignments",
                    filter=Q(user_assignments__user__entity_id=request.user.entity_id),
                    distinct=True,
                )
            ).order_by("name")
        elif actor_role == "team_leader":
            queryset = Role.objects.filter(key__in={"team_leader", "user"}).annotate(
                user_count=Count(
                    "user_assignments",
                    filter=Q(user_assignments__user__team_leader_id=request.user.id),
                    distinct=True,
                )
            ).order_by("name")
        elif actor_role in {"user", "handler"}:
            queryset = Role.objects.filter(key=actor_role).annotate(
                user_count=Count("user_assignments", filter=Q(user_assignments__user_id=request.user.id), distinct=True)
            ).order_by("name")
        else:
            queryset = Role.objects.annotate(user_count=Count("user_assignments")).order_by("name")

        roles_payload = RoleAdminSerializer(queryset, many=True).data
        role_id_to_saved_defaults = {}
        custom_defaults = RoleDefaultPermission.objects.filter(role_id__in=queryset.values_list("id", flat=True)).values_list(
            "role_id", "permission__key"
        )
        for role_id, permission_key in custom_defaults:
            role_id_to_saved_defaults.setdefault(role_id, set()).add(permission_key)

        for role_row in roles_payload:
            saved_keys = role_id_to_saved_defaults.get(role_row.get("id"))
            role_key = role_row.get("key")
            role_defaults = role_row.get("default_permissions", [])
            role_row["default_permissions"] = strip_role_locked_permission_keys(role_key, role_defaults)
            if saved_keys is not None:
                role_row["custom_default_permissions"] = strip_role_locked_permission_keys(role_key, saved_keys)
            else:
                role_row["custom_default_permissions"] = list(role_row.get("default_permissions", []))

        company_options = []
        entity_options = []
        if actor_role == "super_admin":
            company_options = list(
                Company.objects.filter(is_active=True).order_by("name").values("id", "name", "code")
            )
            entity_qs = Entity.objects.filter(is_active=True).select_related("company")
            if company_id:
                entity_qs = entity_qs.filter(company_id=company_id)
            if entity_type:
                entity_qs = entity_qs.filter(entity_type=entity_type)
            entity_options = [
                {
                    "id": item.id,
                    "name": item.name,
                    "entity_type": item.entity_type,
                    "company_id": item.company_id,
                    "company_name": item.company.name,
                    "label": f"{item.name} ({item.company.name})",
                }
                for item in entity_qs.order_by("name")
            ]
        elif actor_role == "senior" and request.user.company_id:
            company_options = [
                {
                    "id": request.user.company_id,
                    "name": request.user.company.name if request.user.company else "Company",
                    "code": request.user.company.code if request.user.company else "",
                }
            ]
            senior_entity_qs = Entity.objects.filter(company_id=request.user.company_id, is_active=True).select_related("company")
            if entity_type:
                senior_entity_qs = senior_entity_qs.filter(entity_type=entity_type)
            entity_options = [
                {
                    "id": item.id,
                    "name": item.name,
                    "entity_type": item.entity_type,
                    "company_id": item.company_id,
                    "company_name": item.company.name,
                    "label": f"{item.name} ({item.get_entity_type_display()})",
                }
                for item in senior_entity_qs.order_by("name")
            ]

        return Response(
            {
                "roles": roles_payload,
                "all_permission_keys": list(AppPermission.objects.exclude(key__in=HIDDEN_ROLE_PERMISSION_KEYS).values_list("key", flat=True).order_by("key")),
                "company_options": company_options,
                "entity_options": entity_options,
                "applied_scope": {"company_id": company_id, "entity_id": entity_id, "entity_type": entity_type},
                "entity_type_options": [
                    {"key": Entity.EntityType.PROD, "label": "Prod"},
                    {"key": Entity.EntityType.SUPPORT, "label": "Support"},
                    {"key": Entity.EntityType.TDEV, "label": "Dev"},
                ],
            }
        )


class AdminRoleDetailView(AdminBaseView):
    module_key = "roles"

    @staticmethod
    def _expand_permission_keys(permission_keys):
        expanded = set(permission_keys)
        changed = True
        while changed:
            changed = False
            for parent, children in ROLE_PERMISSION_IMPLICATIONS.items():
                if parent not in expanded:
                    continue
                missing = set(children) - expanded
                if missing:
                    expanded.update(missing)
                    changed = True
        return sorted(expanded)

    def patch(self, request, role_id):
        if not has_permission_management_access(request.user):
            return Response({"detail": "You do not have permission to manage roles and permissions."}, status=status.HTTP_403_FORBIDDEN)
        role = Role.objects.filter(id=role_id).first()
        if role is None:
            return Response({"detail": "Role not found."}, status=status.HTTP_404_NOT_FOUND)
        actor_role = self.role_key(request.user)
        can_manage_target_role, hierarchy_error = can_manage_role_permissions(request.user, role.key)
        if not can_manage_target_role:
            return Response({"detail": hierarchy_error or ROLE_PERMISSION_HIERARCHY_ERROR}, status=status.HTTP_403_FORBIDDEN)
        serializer = RolePermissionMappingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        permission_keys = self._expand_permission_keys(serializer.validated_data["permission_keys"])
        permission_keys = normalize_log_scope_permission_keys(role.key, permission_keys)
        permission_keys = normalize_request_status_permission_keys(permission_keys)
        permission_keys = strip_role_locked_permission_keys(role.key, permission_keys)
        is_valid_role_lock, role_lock_error = validate_role_locked_permission_keys(role.key, permission_keys)
        if not is_valid_role_lock:
            return Response({"detail": role_lock_error}, status=status.HTTP_400_BAD_REQUEST)
        company_id = serializer.validated_data.get("company_id")
        entity_id = serializer.validated_data.get("entity_id")
        entity_type = serializer.validated_data.get("entity_type")
        known_permission_keys = set(AppPermission.objects.values_list("key", flat=True))
        allowed_permission_keys = get_manageable_permission_keys_for_actor(request.user)
        unknown_permission_keys = sorted(set(permission_keys) - known_permission_keys)
        if unknown_permission_keys:
            return Response(
                {"detail": f"Unknown permission keys: {', '.join(unknown_permission_keys)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        disallowed_permission_keys = sorted(set(permission_keys) - allowed_permission_keys)
        if disallowed_permission_keys:
            return Response(
                {
                    "detail": f"{ROLE_PERMISSION_OWNERSHIP_ERROR} Disallowed: {', '.join(disallowed_permission_keys)}"
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if entity_id:
            selected_entity = Entity.objects.filter(id=entity_id, is_active=True).first()
            if selected_entity is None:
                return Response({"detail": "Selected entity not found."}, status=status.HTTP_400_BAD_REQUEST)
            if company_id and selected_entity.company_id != company_id:
                return Response({"detail": "Selected entity does not belong to selected company."}, status=status.HTTP_400_BAD_REQUEST)
            if not company_id:
                company_id = selected_entity.company_id
            if entity_type and selected_entity.entity_type != entity_type:
                return Response({"detail": "Selected entity type does not match selected entity."}, status=status.HTTP_400_BAD_REQUEST)

        if company_id:
            selected_company = Company.objects.filter(id=company_id, is_active=True).first()
            if selected_company is None:
                return Response({"detail": "Selected company not found."}, status=status.HTTP_400_BAD_REQUEST)

        # Super Admin updates global role defaults unless a scope filter is selected.
        if actor_role == "super_admin":
            if company_id or entity_id or entity_type:
                scoped_users = User.objects.filter(assigned_roles__role=role, is_active=True)
                if company_id:
                    scoped_users = scoped_users.filter(company_id=company_id)
                if entity_id:
                    scoped_users = scoped_users.filter(entity_id=entity_id)
                if entity_type:
                    scoped_users = scoped_users.filter(entity__entity_type=entity_type)
                scoped_users = scoped_users.distinct().order_by("id")
                if not scoped_users.exists():
                    return Response(
                        {"detail": "No active users with this role in selected scope."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                desired_keys = set(permission_keys)
                all_permissions = list(AppPermission.objects.order_by("key"))
                reason = f"Scoped role policy update by {request.user.username}"
                for scoped_user in scoped_users:
                    for permission in all_permissions:
                        UserPermissionOverride.objects.update_or_create(
                            user=scoped_user,
                            permission=permission,
                            defaults={
                                "is_allowed": permission.key in desired_keys,
                                "reason": reason,
                            },
                        )

                log_admin_action(
                    actor=request.user,
                    module="roles",
                    action="update_permissions",
                    target_model="Role",
                    target_id=role.id,
                    target_label=role.name,
                    metadata={
                        "permission_keys": permission_keys,
                        "scope": "scoped",
                        "company_id": company_id,
                        "entity_id": entity_id,
                        "entity_type": entity_type,
                    },
                )
                return Response({"detail": "Role policy updated for selected scope users."})

            permissions = list(AppPermission.objects.filter(key__in=permission_keys))
            RolePermission.objects.filter(role=role).exclude(permission__in=permissions).delete()
            existing_ids = set(RolePermission.objects.filter(role=role).values_list("permission_id", flat=True))
            for permission in permissions:
                if permission.id not in existing_ids:
                    RolePermission.objects.create(role=role, permission=permission)
            # Keep role matrix and user detail matrix in sync by removing stale
            # user-level overrides for users assigned to this role. Otherwise a
            # previous deny override can mask newly enabled role permissions.
            UserPermissionOverride.objects.filter(
                user__assigned_roles__role=role,
                permission__key__in=known_permission_keys,
            ).delete()
            log_admin_action(
                actor=request.user,
                module="roles",
                action="update_permissions",
                target_model="Role",
                target_id=role.id,
                target_label=role.name,
                metadata={"permission_keys": permission_keys, "scope": "global"},
            )
            role.refresh_from_db()
            return Response(RoleAdminSerializer(role).data)

        # Senior updates company-scoped role policy by applying user-level overrides
        # to users in the senior's own company only.
        if actor_role == "senior":
            if company_id and company_id != request.user.company_id:
                return Response({"detail": "Senior can only manage roles in their own company."}, status=status.HTTP_400_BAD_REQUEST)
            if entity_id:
                entity = Entity.objects.filter(id=entity_id, company_id=request.user.company_id, is_active=True).first()
                if entity is None:
                    return Response({"detail": "Selected entity not found in your company."}, status=status.HTTP_400_BAD_REQUEST)
                if entity_type and entity.entity_type != entity_type:
                    return Response({"detail": "Selected entity type does not match selected entity."}, status=status.HTTP_400_BAD_REQUEST)
            scoped_users = User.objects.filter(
                company_id=request.user.company_id,
                assigned_roles__role=role,
                is_active=True,
            )
            if entity_id:
                scoped_users = scoped_users.filter(entity_id=entity_id)
            if entity_type:
                scoped_users = scoped_users.filter(entity__entity_type=entity_type)
            scoped_users = scoped_users.distinct().order_by("id")
            if not scoped_users.exists():
                return Response(
                    {"detail": "No active users with this role in your company."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            desired_keys = set(permission_keys)
            all_permissions = list(AppPermission.objects.filter(key__in=allowed_permission_keys).order_by("key"))
            reason = f"Company role policy update by {request.user.username}"
            for scoped_user in scoped_users:
                for permission in all_permissions:
                    UserPermissionOverride.objects.update_or_create(
                        user=scoped_user,
                        permission=permission,
                        defaults={
                            "is_allowed": permission.key in desired_keys,
                            "reason": reason,
                        },
                    )

            log_admin_action(
                actor=request.user,
                module="roles",
                action="update_permissions",
                target_model="Role",
                target_id=role.id,
                target_label=role.name,
                metadata={
                    "permission_keys": permission_keys,
                    "scope": "entity" if entity_id else "company",
                    "company_id": request.user.company_id,
                    "entity_id": entity_id,
                    "entity_type": entity_type,
                },
            )
            return Response({"detail": "Role policy updated for your scoped users."})

        # Manager updates entity-scoped role policy by applying user-level overrides
        # to users in the manager's own entity only.
        if actor_role == "manager":
            scoped_users = (
                User.objects.filter(
                    entity_id=request.user.entity_id,
                    assigned_roles__role=role,
                    is_active=True,
                )
                .distinct()
                .order_by("id")
            )
            if not scoped_users.exists():
                return Response(
                    {"detail": "No active users with this role in your entity."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            desired_keys = set(permission_keys)
            all_permissions = list(AppPermission.objects.filter(key__in=allowed_permission_keys).order_by("key"))
            reason = f"Entity role policy update by {request.user.username}"
            for scoped_user in scoped_users:
                for permission in all_permissions:
                    UserPermissionOverride.objects.update_or_create(
                        user=scoped_user,
                        permission=permission,
                        defaults={
                            "is_allowed": permission.key in desired_keys,
                            "reason": reason,
                        },
                    )

            log_admin_action(
                actor=request.user,
                module="roles",
                action="update_permissions",
                target_model="Role",
                target_id=role.id,
                target_label=role.name,
                metadata={
                    "permission_keys": permission_keys,
                    "scope": "entity",
                    "company_id": request.user.company_id,
                    "entity_id": request.user.entity_id,
                },
            )
            return Response({"detail": "Role policy updated for your entity users."})

        # Team Leader updates team-scoped user policy by applying user-level overrides
        # to users assigned to this team leader only.
        if actor_role == "team_leader":
            scoped_users = (
                User.objects.filter(
                    team_leader_id=request.user.id,
                    assigned_roles__role=role,
                    is_active=True,
                )
                .distinct()
                .order_by("id")
            )
            if not scoped_users.exists():
                return Response(
                    {"detail": "No active users assigned to your team."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            desired_keys = set(permission_keys)
            all_permissions = list(AppPermission.objects.filter(key__in=allowed_permission_keys).order_by("key"))
            reason = f"Team role policy update by {request.user.username}"
            for scoped_user in scoped_users:
                for permission in all_permissions:
                    UserPermissionOverride.objects.update_or_create(
                        user=scoped_user,
                        permission=permission,
                        defaults={
                            "is_allowed": permission.key in desired_keys,
                            "reason": reason,
                        },
                    )

            log_admin_action(
                actor=request.user,
                module="roles",
                action="update_permissions",
                target_model="Role",
                target_id=role.id,
                target_label=role.name,
                metadata={
                    "permission_keys": permission_keys,
                    "scope": "team",
                    "company_id": request.user.company_id,
                    "entity_id": request.user.entity_id,
                    "team_leader_id": request.user.id,
                },
            )
            return Response({"detail": "Role policy updated for your team users."})

        return Response({"detail": "You do not have permission to update roles."}, status=status.HTTP_403_FORBIDDEN)

    def post(self, request, role_id):
        if not has_permission_management_access(request.user):
            return Response({"detail": "You do not have permission to manage roles and permissions."}, status=status.HTTP_403_FORBIDDEN)
        role = Role.objects.filter(id=role_id).first()
        if role is None:
            return Response({"detail": "Role not found."}, status=status.HTTP_404_NOT_FOUND)

        scope_serializer = RoleScopeSerializer(data=request.data)
        scope_serializer.is_valid(raise_exception=True)
        company_id = scope_serializer.validated_data.get("company_id")
        entity_id = scope_serializer.validated_data.get("entity_id")
        entity_type = scope_serializer.validated_data.get("entity_type")
        actor_role = self.role_key(request.user)
        known_permission_keys = set(AppPermission.objects.values_list("key", flat=True))
        allowed_permission_keys = get_manageable_permission_keys_for_actor(request.user)
        can_manage_target_role, hierarchy_error = can_manage_role_permissions(request.user, role.key)
        if not can_manage_target_role:
            return Response({"detail": hierarchy_error or ROLE_PERMISSION_HIERARCHY_ERROR}, status=status.HTTP_403_FORBIDDEN)
        # Restore must use saved custom defaults (if provided) as the baseline.
        default_permission_keys = set(normalize_request_status_permission_keys(get_saved_default_permission_keys(role)))

        # Super Admin restores global role defaults.
        if actor_role == "super_admin":
            if entity_id:
                selected_entity = Entity.objects.filter(id=entity_id, is_active=True).first()
                if selected_entity is None:
                    return Response({"detail": "Selected entity not found."}, status=status.HTTP_400_BAD_REQUEST)
                if company_id and selected_entity.company_id != company_id:
                    return Response({"detail": "Selected entity does not belong to selected company."}, status=status.HTTP_400_BAD_REQUEST)
                if not company_id:
                    company_id = selected_entity.company_id
                if entity_type and selected_entity.entity_type != entity_type:
                    return Response({"detail": "Selected entity type does not match selected entity."}, status=status.HTTP_400_BAD_REQUEST)
            if company_id:
                selected_company = Company.objects.filter(id=company_id, is_active=True).first()
                if selected_company is None:
                    return Response({"detail": "Selected company not found."}, status=status.HTTP_400_BAD_REQUEST)

            if company_id or entity_id or entity_type:
                scoped_users = User.objects.filter(assigned_roles__role=role, is_active=True)
                if company_id:
                    scoped_users = scoped_users.filter(company_id=company_id)
                if entity_id:
                    scoped_users = scoped_users.filter(entity_id=entity_id)
                if entity_type:
                    scoped_users = scoped_users.filter(entity__entity_type=entity_type)
                scoped_users = scoped_users.distinct().order_by("id")
                if not scoped_users.exists():
                    return Response(
                        {"detail": "No active users with this role in selected scope."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                all_permissions = list(AppPermission.objects.order_by("key"))
                reason = f"Scoped role defaults restored by {request.user.username}"
                for scoped_user in scoped_users:
                    for permission in all_permissions:
                        UserPermissionOverride.objects.update_or_create(
                            user=scoped_user,
                            permission=permission,
                            defaults={
                                "is_allowed": permission.key in default_permission_keys,
                                "reason": reason,
                            },
                        )
                log_admin_action(
                    actor=request.user,
                    module="roles",
                    action="restore_default_permissions",
                    target_model="Role",
                    target_id=role.id,
                    target_label=role.name,
                    metadata={
                        "scope": "scoped",
                        "company_id": company_id,
                        "entity_id": entity_id,
                        "entity_type": entity_type,
                        "permission_keys": sorted(default_permission_keys),
                    },
                )
                return Response({"detail": "Default role policy restored for selected scope users."})

            permissions = list(AppPermission.objects.filter(key__in=default_permission_keys))
            RolePermission.objects.filter(role=role).exclude(permission__in=permissions).delete()
            existing_ids = set(RolePermission.objects.filter(role=role).values_list("permission_id", flat=True))
            for permission in permissions:
                if permission.id not in existing_ids:
                    RolePermission.objects.create(role=role, permission=permission)
            # Restore defaults must remove user-level overrides for this role
            # so users effectively inherit the role baseline again.
            UserPermissionOverride.objects.filter(
                user__assigned_roles__role=role,
                permission__key__in=known_permission_keys,
            ).delete()
            log_admin_action(
                actor=request.user,
                module="roles",
                action="restore_default_permissions",
                target_model="Role",
                target_id=role.id,
                target_label=role.name,
                metadata={"scope": "global", "permission_keys": sorted(default_permission_keys)},
            )
            return Response({"detail": "Global role defaults restored."})

        # Senior restores company-scoped defaults via overrides.
        if actor_role == "senior":
            if company_id and company_id != request.user.company_id:
                return Response({"detail": "Senior can only restore roles in their own company."}, status=status.HTTP_400_BAD_REQUEST)
            if entity_id:
                entity = Entity.objects.filter(id=entity_id, company_id=request.user.company_id, is_active=True).first()
                if entity is None:
                    return Response({"detail": "Selected entity not found in your company."}, status=status.HTTP_400_BAD_REQUEST)
                if entity_type and entity.entity_type != entity_type:
                    return Response({"detail": "Selected entity type does not match selected entity."}, status=status.HTTP_400_BAD_REQUEST)
            scoped_users = User.objects.filter(
                company_id=request.user.company_id,
                assigned_roles__role=role,
                is_active=True,
            )
            if entity_id:
                scoped_users = scoped_users.filter(entity_id=entity_id)
            if entity_type:
                scoped_users = scoped_users.filter(entity__entity_type=entity_type)
            scoped_users = scoped_users.distinct().order_by("id")
            if not scoped_users.exists():
                return Response(
                    {"detail": "No active users with this role in your company."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            allowed_default_keys = default_permission_keys.intersection(allowed_permission_keys)
            all_permissions = list(AppPermission.objects.filter(key__in=allowed_permission_keys).order_by("key"))
            reason = f"Company role defaults restored by {request.user.username}"
            for scoped_user in scoped_users:
                for permission in all_permissions:
                    UserPermissionOverride.objects.update_or_create(
                        user=scoped_user,
                        permission=permission,
                        defaults={
                            "is_allowed": permission.key in allowed_default_keys,
                            "reason": reason,
                        },
                    )
            log_admin_action(
                actor=request.user,
                module="roles",
                action="restore_default_permissions",
                target_model="Role",
                target_id=role.id,
                target_label=role.name,
                metadata={
                    "scope": "entity" if entity_id else "company",
                    "company_id": request.user.company_id,
                    "entity_id": entity_id,
                    "entity_type": entity_type,
                    "permission_keys": sorted(allowed_default_keys),
                },
            )
            return Response({"detail": "Default role policy restored for your scoped users."})

        # Manager restores entity-scoped defaults via overrides.
        if actor_role == "manager":
            scoped_users = (
                User.objects.filter(
                    entity_id=request.user.entity_id,
                    assigned_roles__role=role,
                    is_active=True,
                )
                .distinct()
                .order_by("id")
            )
            if not scoped_users.exists():
                return Response(
                    {"detail": "No active users with this role in your entity."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            allowed_default_keys = default_permission_keys.intersection(allowed_permission_keys)
            all_permissions = list(AppPermission.objects.filter(key__in=allowed_permission_keys).order_by("key"))
            reason = f"Entity role defaults restored by {request.user.username}"
            for scoped_user in scoped_users:
                for permission in all_permissions:
                    UserPermissionOverride.objects.update_or_create(
                        user=scoped_user,
                        permission=permission,
                        defaults={
                            "is_allowed": permission.key in allowed_default_keys,
                            "reason": reason,
                        },
                    )
            log_admin_action(
                actor=request.user,
                module="roles",
                action="restore_default_permissions",
                target_model="Role",
                target_id=role.id,
                target_label=role.name,
                metadata={
                    "scope": "entity",
                    "company_id": request.user.company_id,
                    "entity_id": request.user.entity_id,
                    "permission_keys": sorted(allowed_default_keys),
                },
            )
            return Response({"detail": "Default role policy restored for your entity users."})

        # Team Leader restores team-scoped defaults via overrides.
        if actor_role == "team_leader":
            scoped_users = (
                User.objects.filter(
                    team_leader_id=request.user.id,
                    assigned_roles__role=role,
                    is_active=True,
                )
                .distinct()
                .order_by("id")
            )
            if not scoped_users.exists():
                return Response(
                    {"detail": "No active users assigned to your team."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            allowed_default_keys = default_permission_keys.intersection(allowed_permission_keys)
            all_permissions = list(AppPermission.objects.filter(key__in=allowed_permission_keys).order_by("key"))
            reason = f"Team role defaults restored by {request.user.username}"
            for scoped_user in scoped_users:
                for permission in all_permissions:
                    UserPermissionOverride.objects.update_or_create(
                        user=scoped_user,
                        permission=permission,
                        defaults={
                            "is_allowed": permission.key in allowed_default_keys,
                            "reason": reason,
                        },
                    )
            log_admin_action(
                actor=request.user,
                module="roles",
                action="restore_default_permissions",
                target_model="Role",
                target_id=role.id,
                target_label=role.name,
                metadata={
                    "scope": "team",
                    "team_leader_id": request.user.id,
                    "entity_id": request.user.entity_id,
                    "company_id": request.user.company_id,
                    "permission_keys": sorted(allowed_default_keys),
                },
            )
            return Response({"detail": "Default role policy restored for your team users."})

        return Response({"detail": "You do not have permission to restore role defaults."}, status=status.HTTP_403_FORBIDDEN)


class AdminRoleDefaultDetailView(AdminBaseView):
    module_key = "roles"

    def patch(self, request, role_id):
        if not has_permission_management_access(request.user):
            return Response({"detail": "You do not have permission to manage roles and permissions."}, status=status.HTTP_403_FORBIDDEN)
        role = Role.objects.filter(id=role_id).first()
        if role is None:
            return Response({"detail": "Role not found."}, status=status.HTTP_404_NOT_FOUND)

        can_manage_target_role, hierarchy_error = can_manage_role_permissions(request.user, role.key)
        if not can_manage_target_role:
            return Response({"detail": hierarchy_error or ROLE_PERMISSION_HIERARCHY_ERROR}, status=status.HTTP_403_FORBIDDEN)

        serializer = RolePermissionMappingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        permission_keys = normalize_log_scope_permission_keys(role.key, serializer.validated_data["permission_keys"])
        permission_keys = normalize_request_status_permission_keys(permission_keys)
        permission_keys = strip_role_locked_permission_keys(role.key, permission_keys)
        is_valid_role_lock, role_lock_error = validate_role_locked_permission_keys(role.key, permission_keys)
        if not is_valid_role_lock:
            return Response({"detail": role_lock_error}, status=status.HTTP_400_BAD_REQUEST)

        known_permission_keys = set(AppPermission.objects.values_list("key", flat=True))
        unknown_permission_keys = sorted(set(permission_keys) - known_permission_keys)
        if unknown_permission_keys:
            return Response(
                {"detail": f"Unknown permission keys: {', '.join(unknown_permission_keys)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_permission_keys = get_manageable_permission_keys_for_actor(request.user)
        disallowed_permission_keys = sorted(set(permission_keys) - allowed_permission_keys)
        if disallowed_permission_keys:
            return Response(
                {
                    "detail": f"{ROLE_PERMISSION_OWNERSHIP_ERROR} Disallowed: {', '.join(disallowed_permission_keys)}"
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        requested_keys = list(dict.fromkeys(permission_keys))
        permissions = list(AppPermission.objects.filter(key__in=requested_keys))
        RoleDefaultPermission.objects.filter(role=role).exclude(permission__in=permissions).delete()
        existing_ids = set(RoleDefaultPermission.objects.filter(role=role).values_list("permission_id", flat=True))
        for permission in permissions:
            if permission.id not in existing_ids:
                RoleDefaultPermission.objects.create(role=role, permission=permission)

        log_admin_action(
            actor=request.user,
            module="roles",
            action="update_saved_default_permissions",
            target_model="Role",
            target_id=role.id,
            target_label=role.name,
            metadata={"permission_keys": sorted(requested_keys)},
        )
        return Response(
            {
                "detail": "Saved default permissions updated.",
                "custom_default_permissions": sorted(requested_keys),
            }
        )

class AdminPermissionsView(AdminBaseView):
    module_key = "permissions"

    def get(self, request):
        if not has_permission_management_access(request.user):
            return Response({"detail": "You do not have permission to manage roles and permissions."}, status=status.HTTP_403_FORBIDDEN)
        payload = {
            "catalog": PermissionCatalogSerializer(AppPermission.objects.order_by("category", "key"), many=True).data,
            "delegatable_permission_keys": get_delegatable_permission_keys(request.user),
            "users": ManageableUserListSerializer(
                self.scoped_users(request.user),
                many=True,
                context={"actor_level": ROLE_HIERARCHY.get(self.role_key(request.user), 0)},
            ).data,
        }
        user_id = request.query_params.get("user_id")
        if user_id:
            target = self.scoped_users(request.user).filter(id=user_id).first()
            if target and can_view_target_user(request.user, target):
                payload["selected_user"] = EffectivePermissionUserSerializer(target, context={"editor_user": request.user}).data
        return Response(payload)


class AdminRequestsView(AdminBaseView):
    module_key = "requests"

    def get(self, request):
        queryset = self.scoped_requests(request.user)
        params = request.query_params
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("company_id"):
            queryset = queryset.filter(company_id=params["company_id"])
        if params.get("entity_id"):
            queryset = queryset.filter(target_entity_id=params["entity_id"])
        if params.get("source_entity_id"):
            queryset = queryset.filter(source_entity_id=params["source_entity_id"])
        if params.get("type"):
            queryset = queryset.filter(category=params["type"])
        return Response(RequestAdminSummarySerializer(queryset[:200], many=True).data)


class AdminRequestDetailView(AdminBaseView):
    module_key = "requests"

    def patch(self, request, request_id):
        service_request = load_request(request_id)
        if service_request is None:
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        if self.role_key(request.user) != "super_admin" and not self.scoped_requests(request.user).filter(id=request_id).exists():
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = RequestAdminUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        changes = []
        if "target_entity_id" in serializer.validated_data:
            new_target_id = serializer.validated_data["target_entity_id"]
            target_entity = self.scoped_entities(request.user).filter(id=new_target_id).first()
            if target_entity is None:
                return Response({"detail": "Target entity not found."}, status=status.HTTP_400_BAD_REQUEST)
            
            # Assignment Rule 1: Same company
            request_company_id = (
                service_request.company_id or service_request.requester_user.company_id
            )
            if target_entity.company_id != request_company_id:
                return Response(
                    {"detail": "Target entity must belong to the same company as the request."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
                
            # Assignment Rule 2: Support/Dev only (No Prod)
            if target_entity.entity_type == Entity.EntityType.PROD:
                return Response(
                    {"detail": "Cannot assign to a production entity. Must be Support or Dev."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            service_request.target_entity = target_entity
            unit = OperationalUnit.objects.filter(code=target_entity.code).first()
            if unit:
                service_request.target_unit = unit
            changes.append("target_entity")
        if "current_assignee_id" in serializer.validated_data:
            assignee = None
            assignee_id = serializer.validated_data["current_assignee_id"]
            if assignee_id:
                assignee = self.scoped_users(request.user).filter(id=assignee_id).first()
                if assignee is None:
                    return Response({"detail": "Assignee not found."}, status=status.HTTP_400_BAD_REQUEST)
            service_request.current_assignee = assignee
            changes.append("current_assignee")
            if assignee:
                RequestAssignmentHistory.objects.create(
                    request=service_request,
                    assigned_by=request.user,
                    assignee=assignee,
                    note=serializer.validated_data.get("note", "Manual admin assignment"),
                )
                create_notification(
                    user=assignee,
                    event_type=UserNotification.EventType.REQUEST_MESSAGE,
                    title="Request assigned to you",
                    message=f"{request.user.username} assigned request {service_request.request_number} to you.",
                    link=f"/requests/{service_request.id}",
                    metadata={"request_id": service_request.id, "assigned_by_user_id": request.user.id},
                )
        if "status" in serializer.validated_data:
            old_status = service_request.status
            service_request.status = serializer.validated_data["status"]
            changes.append("status")
            RequestStatusHistory.objects.create(
                request=service_request,
                old_status=old_status,
                new_status=service_request.status,
                changed_by=request.user,
                note=serializer.validated_data.get("note", "Admin status update"),
            )
        if changes:
            service_request.save()
            log_admin_action(
                actor=request.user,
                module="requests",
                action="update",
                target_model="ServiceRequest",
                target_id=service_request.id,
                target_label=service_request.request_number,
                metadata={"changes": changes},
            )
        return Response(RequestAdminSummarySerializer(service_request).data)


class AdminAssignmentsView(AdminBaseView):
    module_key = "assignments"

    def get(self, request):
        request_qs = self.scoped_requests(request.user)
        history = RequestAssignmentHistory.objects.filter(request__in=request_qs).select_related("request", "assigned_by", "assignee").order_by("-created_at")[:100]
        return Response(
            {
                "current_assignments": RequestAdminSummarySerializer(request_qs.filter(current_assignee__isnull=False)[:100], many=True).data,
                "unassigned_requests": RequestAdminSummarySerializer(request_qs.filter(current_assignee__isnull=True)[:100], many=True).data,
                "history": AssignmentHistorySerializer(history, many=True).data,
            }
        )


class AdminStatusTrackingView(AdminBaseView):
    module_key = "status_tracking"

    def get(self, request):
        request_qs = self.scoped_requests(request.user)
        now = timezone.now()
        
        # Aging summary based on creation
        aging_summary = {
            "under_24h": request_qs.filter(created_at__gte=now - timedelta(hours=24)).count(),
            "24h_48h": request_qs.filter(
                created_at__lt=now - timedelta(hours=24), created_at__gte=now - timedelta(hours=48)
            ).count(),
            "over_48h": request_qs.filter(created_at__lt=now - timedelta(hours=48)).count(),
        }

        # Status distribution groups
        status_groups = {
            "new": request_qs.filter(status=ServiceRequest.Status.NEW).count(),
            "active": request_qs.filter(
                status__in=[ServiceRequest.Status.ACCEPTED, ServiceRequest.Status.IN_PROGRESS]
            ).count(),
            "resolved": request_qs.filter(
                status__in=[ServiceRequest.Status.COMPLETED, ServiceRequest.Status.CLOSED]
            ).count(),
            "rejected": request_qs.filter(status=ServiceRequest.Status.REJECTED).count(),
        }

        stale_cutoff = now - timedelta(days=7)
        history = RequestStatusHistory.objects.filter(request__in=request_qs).select_related("request", "changed_by").order_by("-changed_at")[:100]
        stuck = request_qs.filter(
            status__in=[ServiceRequest.Status.NEW, ServiceRequest.Status.ACCEPTED, ServiceRequest.Status.IN_PROGRESS],
            created_at__lt=stale_cutoff,
        )
        return Response(
            {
                "aging_summary": aging_summary,
                "status_groups": status_groups,
                "history": StatusTrackingSerializer(history, many=True).data,
                "stuck_requests": RequestAdminSummarySerializer(stuck, many=True).data,
            }
        )


class AdminAuditLogsView(AdminBaseView):
    module_key = "audit_logs"

    def get(self, request):
        queryset = self.scoped_audit_logs(request.user)
        module = request.query_params.get("module")
        modules_param = request.query_params.get("modules")

        modules = []
        if modules_param:
            modules = [item.strip() for item in modules_param.split(",") if item.strip()]
        elif module:
            modules = [module.strip()]

        if modules:
            queryset = queryset.filter(module__in=modules)

        return Response(AuditLogSerializer(queryset[:200], many=True).data)


class AdminNotificationsView(AdminBaseView):
    module_key = "notifications"

    def get(self, request):
        defaults = [
            ("request_created", "Request created"),
            ("request_assigned", "Request assigned"),
            ("status_changed", "Status changed"),
            ("permission_changed", "Permission changed"),
            ("role_changed", "Role changed"),
        ]
        for event_key, label in defaults:
            NotificationPreference.objects.get_or_create(event_key=event_key, defaults={"label": label})
        queryset = NotificationPreference.objects.order_by("label")
        return Response(
            {
                "settings": NotificationPreferenceSerializer(queryset, many=True).data,
                "telegram_ready": True,
                "telegram_note": "Telegram integration is scaffolded and ready for a bot connector later.",
            }
        )

    def patch(self, request, preference_id):
        preference = NotificationPreference.objects.filter(id=preference_id).first()
        if preference is None:
            return Response({"detail": "Notification setting not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = NotificationPreferenceSerializer(preference, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_admin_action(actor=request.user, module="notifications", action="update", target_model="NotificationPreference", target_id=preference.id, target_label=preference.label)
        return Response(serializer.data)


class AdminReportsView(AdminBaseView):
    module_key = "reports"

    def get(self, request):
        started_at = time.perf_counter()
        cache_extra = {
            "date_from": request.query_params.get("date_from"),
            "date_to": request.query_params.get("date_to"),
        }
        cache_key = self.build_stats_cache_key(
            area="reports",
            user=request.user,
            extra=cache_extra,
        )
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        queryset = self.scoped_report_requests(request.user)
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        open_vs_resolved = queryset.aggregate(
            open=Count(
                "id",
                filter=Q(
                    status__in=[
                        ServiceRequest.Status.NEW,
                        ServiceRequest.Status.ACCEPTED,
                        ServiceRequest.Status.IN_PROGRESS,
                    ]
                ),
            ),
            resolved=Count(
                "id",
                filter=Q(
                    status__in=[
                        ServiceRequest.Status.COMPLETED,
                        ServiceRequest.Status.CLOSED,
                    ]
                ),
            ),
        )
        open_statuses = [
            ServiceRequest.Status.NEW,
            ServiceRequest.Status.ACCEPTED,
            ServiceRequest.Status.IN_PROGRESS,
        ]
        queue_counts = queryset.aggregate(
            unassigned=Count("id", filter=Q(status__in=open_statuses, current_assignee__isnull=True)),
        )
        analytics_scope = get_effective_analytics_scope(request.user)
        team_workload_qs = queryset.filter(status__in=open_statuses)
        if analytics_scope == "company" and request.user.company_id:
            team_workload_qs = team_workload_qs.filter(current_assignee__company_id=request.user.company_id)
        elif analytics_scope == "entity" and request.user.entity_id:
            team_workload_qs = team_workload_qs.filter(current_assignee__entity_id=request.user.entity_id)
        resolved_timing = (
            queryset.filter(
                status__in=[ServiceRequest.Status.COMPLETED, ServiceRequest.Status.CLOSED],
                completed_at__isnull=False,
                completed_at__gt=F("created_at"),
            )
            .annotate(
                resolution_duration=ExpressionWrapper(
                    F("completed_at") - F("created_at"),
                    output_field=DurationField(),
                )
            )
            .aggregate(avg_resolution=Avg("resolution_duration"))
        )
        avg_resolution = resolved_timing.get("avg_resolution")
        avg_resolution_days = (
            avg_resolution.total_seconds() / 86400 if avg_resolution else 0
        )
        volume_by_company = (
            queryset.annotate(
                company_name=Coalesce("company__name", "requester_user__company__name", Value("No company"))
            )
            .values("company_name")
            .annotate(total=Count("id"))
            .order_by("-total", "company_name")[:100]
        )
        payload = {
            "request_volume_by_company": list(volume_by_company),
            "request_volume_by_entity": list(
                queryset.values("target_entity__name").annotate(total=Count("id")).order_by("-total")[:100]
            ),
            "requests_by_type": list(queryset.values("category").annotate(total=Count("id")).order_by("-total")),
            "requests_by_status": list(queryset.values("status").annotate(total=Count("id")).order_by("-total")),
            "open_vs_resolved": open_vs_resolved,
            "queue": queue_counts,
            "avg_resolution_days": avg_resolution_days,
            "team_workload": list(
                team_workload_qs
                .values("current_assignee__username")
                .annotate(total=Count("id"))
                .order_by("-total")[:100]
            ),
            "trend_summaries": list(
                queryset.annotate(day=TruncDate("created_at")).values("day").annotate(total=Count("id")).order_by("-day")[:31]
            ),
        }
        profile_meta = self.maybe_profile_meta(request=request, started_at=started_at)
        if profile_meta:
            payload["_profile"] = profile_meta
            logger.debug("AdminReports profile: %s", profile_meta)
        cache.set(cache_key, payload, timeout=90)
        return Response(payload)
