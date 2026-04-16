from datetime import timedelta

from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit_logs.models import AdminAuditLog
from apps.audit_logs.services import log_admin_action
from apps.companies.models import Company
from apps.entities.models import Entity
from apps.notifications.models import NotificationPreference
from apps.permissions_app.models import AppPermission, PermissionDelegation, RolePermission, UserRole
from apps.permissions_app.services import (
    ROLE_HIERARCHY,
    can_manage_any_users,
    can_view_target_user,
    get_delegatable_permission_keys,
    get_primary_role_key,
    get_visible_users_queryset,
)
from apps.requests_app.models import OperationalUnit, RequestAssignmentHistory, RequestStatusHistory, ServiceRequest
from apps.requests_app.views import get_visible_requests_queryset, load_request
from apps.roles.models import Role
from apps.users.models import User

from .admin_serializers import (
    AssignmentHistorySerializer,
    AuditLogSerializer,
    CompanyAdminSerializer,
    CompanyWriteSerializer,
    DelegationRuleWriteSerializer,
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
    StatusTrackingSerializer,
)
from .serializers import ManageableUserListSerializer


ADMIN_MODULE_PERMISSIONS = {
    "dashboard": set(),
    "companies": {"super_admin"},
    "entities": {"super_admin", "senior"},
    "hierarchy": {"super_admin", "senior", "manager", "team_leader"},
    "users": {"super_admin", "senior", "manager", "team_leader"},
    "roles": {"super_admin"},
    "permissions": {"super_admin", "senior", "manager", "team_leader"},
    "delegation_rules": {"super_admin"},
    "requests": {"super_admin", "senior", "manager", "team_leader"},
    "assignments": {"super_admin", "senior", "manager", "team_leader"},
    "status_tracking": {"super_admin", "senior", "manager", "team_leader"},
    "audit_logs": {"super_admin", "senior"},
    "notifications": {"super_admin", "senior"},
    "reports": {"super_admin", "senior", "manager"},
}


class AdminBaseView(APIView):
    permission_classes = [IsAuthenticated]
    module_key = ""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not can_manage_any_users(request.user):
            self.permission_denied(request, message="You do not have access to the custom admin.")
        allowed_roles = ADMIN_MODULE_PERMISSIONS.get(self.module_key, set())
        if allowed_roles and get_primary_role_key(request.user) not in allowed_roles:
            self.permission_denied(request, message="You do not have access to this admin section.")

    def role_key(self, user):
        return get_primary_role_key(user)

    def scoped_companies(self, user):
        if self.role_key(user) == "super_admin":
            return Company.objects.all()
        if user.company_id:
            return Company.objects.filter(id=user.company_id)
        return Company.objects.none()

    def scoped_entities(self, user):
        role_key = self.role_key(user)
        if role_key == "super_admin":
            return Entity.objects.select_related("company").all()
        if role_key == "senior" and user.company_id:
            return Entity.objects.select_related("company").filter(company_id=user.company_id)
        if user.entity_id:
            return Entity.objects.select_related("company").filter(id=user.entity_id)
        return Entity.objects.none()

    def scoped_users(self, user):
        visible_ids = list(get_visible_users_queryset(user).values_list("id", flat=True))
        return User.objects.select_related("company", "entity", "team_leader").filter(
            Q(id__in=visible_ids) | Q(id=user.id)
        )

    def scoped_requests(self, user):
        if self.role_key(user) == "super_admin":
            return ServiceRequest.objects.select_related(
                "company", "source_entity", "target_entity", "requester_user", "current_assignee"
            ).order_by("-created_at")
        return get_visible_requests_queryset(user)


class AdminDashboardView(AdminBaseView):
    module_key = "dashboard"

    def get(self, request):
        request_qs = self.scoped_requests(request.user)
        user_qs = self.scoped_users(request.user)
        open_statuses = [ServiceRequest.Status.NEW, ServiceRequest.Status.ACCEPTED, ServiceRequest.Status.IN_PROGRESS]
        stale_cutoff = timezone.now() - timedelta(days=7)
        recent_logs = AdminAuditLog.objects.select_related("actor").order_by("-created_at")
        if self.role_key(request.user) != "super_admin":
            recent_logs = recent_logs.filter(Q(actor=request.user) | Q(actor__company_id=request.user.company_id))

        return Response(
            {
                "totals": {
                    "users": user_qs.count(),
                    "requests": request_qs.count(),
                    "companies": self.scoped_companies(request.user).count(),
                    "entities": self.scoped_entities(request.user).count(),
                },
                "requests_by_status": list(request_qs.values("status").annotate(total=Count("id")).order_by("status")),
                "requests_by_company": list(request_qs.values("company__name").annotate(total=Count("id")).order_by("-total", "company__name")),
                "requests_by_entity": list(request_qs.values("target_entity__name").annotate(total=Count("id")).order_by("-total", "target_entity__name")[:10]),
                "queue": {
                    "pending": request_qs.filter(status=ServiceRequest.Status.NEW).count(),
                    "open": request_qs.filter(status__in=open_statuses).count(),
                    "stuck": request_qs.filter(status__in=open_statuses, created_at__lt=stale_cutoff).count(),
                    "unassigned": request_qs.filter(status__in=open_statuses, current_assignee__isnull=True).count(),
                },
                "recent_activity": AuditLogSerializer(recent_logs[:8], many=True).data,
            }
        )


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
        return Response(CompanyAdminSerializer(rows, many=True).data)

    def post(self, request):
        serializer = CompanyWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        company = serializer.save()
        log_admin_action(actor=request.user, module="companies", action="create", target_model="Company", target_id=company.id, target_label=company.name)
        return Response(CompanyAdminSerializer(company).data, status=status.HTTP_201_CREATED)


class AdminCompanyDetailView(AdminBaseView):
    module_key = "companies"

    def patch(self, request, company_id):
        company = self.scoped_companies(request.user).filter(id=company_id).first()
        if company is None:
            return Response({"detail": "Company not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CompanyWriteSerializer(company, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        company.refresh_from_db()
        log_admin_action(actor=request.user, module="companies", action="update", target_model="Company", target_id=company.id, target_label=company.name)
        return Response(CompanyAdminSerializer(company).data)


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
        return Response(EntityAdminSerializer(rows, many=True).data)

    def post(self, request):
        serializer = EntityWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entity = serializer.save()
        log_admin_action(actor=request.user, module="entities", action="create", target_model="Entity", target_id=entity.id, target_label=entity.name)
        return Response(EntityAdminSerializer(entity).data, status=status.HTTP_201_CREATED)


class AdminEntityDetailView(AdminBaseView):
    module_key = "entities"

    def patch(self, request, entity_id):
        entity = self.scoped_entities(request.user).filter(id=entity_id).first()
        if entity is None:
            return Response({"detail": "Entity not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = EntityWriteSerializer(entity, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        entity.refresh_from_db()
        log_admin_action(actor=request.user, module="entities", action="update", target_model="Entity", target_id=entity.id, target_label=entity.name)
        return Response(EntityAdminSerializer(entity).data)


class AdminHierarchyView(AdminBaseView):
    module_key = "hierarchy"

    def get(self, request):
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
                    "company_name": entity.company.name,
                    "entity_type": entity.entity_type,
                    "manager": manager.username if manager else "",
                    "team_leaders": [
                        {
                            "id": team_leader.id,
                            "username": team_leader.username,
                            "users": list(team_leader.team_members.values("id", "username").order_by("username")),
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
                    scoped_users.filter(assigned_roles__role__key="senior", is_active=True)
                    .values("id", "username", "company_id")
                    .order_by("username")
                ),
                "manager_options": list(
                    scoped_users.filter(assigned_roles__role__key="manager", is_active=True)
                    .values("id", "username", "company_id", "entity_id")
                    .order_by("username")
                ),
            }
        )


class AdminHierarchyCompanyAssignView(AdminBaseView):
    module_key = "hierarchy"

    def patch(self, request, company_id):
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
            log_admin_action(actor=request.user, module="hierarchy", action="assign_senior", target_model="Company", target_id=company.id, target_label=company.name, metadata={"senior_user_id": senior_user_id})
        return Response({"detail": "Hierarchy updated."})


class AdminHierarchyEntityAssignView(AdminBaseView):
    module_key = "hierarchy"

    def patch(self, request, entity_id):
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
            unit = OperationalUnit.objects.filter(code=entity.code).first()
            if unit:
                unit.manager_id = manager_user_id
                unit.save(update_fields=["manager"])
            log_admin_action(actor=request.user, module="hierarchy", action="assign_manager", target_model="Entity", target_id=entity.id, target_label=entity.name, metadata={"manager_user_id": manager_user_id})
        return Response({"detail": "Hierarchy updated."})


class AdminRolesView(AdminBaseView):
    module_key = "roles"

    def get(self, request):
        queryset = Role.objects.annotate(user_count=Count("user_assignments")).order_by("name")
        return Response(
            {
                "roles": RoleAdminSerializer(queryset, many=True).data,
                "all_permission_keys": list(AppPermission.objects.values_list("key", flat=True).order_by("key")),
            }
        )


class AdminRoleDetailView(AdminBaseView):
    module_key = "roles"

    def patch(self, request, role_id):
        role = Role.objects.filter(id=role_id).first()
        if role is None:
            return Response({"detail": "Role not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RolePermissionMappingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        permissions = list(AppPermission.objects.filter(key__in=serializer.validated_data["permission_keys"]))
        RolePermission.objects.filter(role=role).exclude(permission__in=permissions).delete()
        existing_ids = set(RolePermission.objects.filter(role=role).values_list("permission_id", flat=True))
        for permission in permissions:
            if permission.id not in existing_ids:
                RolePermission.objects.create(role=role, permission=permission)
        log_admin_action(actor=request.user, module="roles", action="update_permissions", target_model="Role", target_id=role.id, target_label=role.name, metadata={"permission_keys": serializer.validated_data["permission_keys"]})
        role.refresh_from_db()
        return Response(RoleAdminSerializer(role).data)


class AdminPermissionsView(AdminBaseView):
    module_key = "permissions"

    def get(self, request):
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
                payload["selected_user"] = EffectivePermissionUserSerializer(target).data
        return Response(payload)


class AdminDelegationRulesView(AdminBaseView):
    module_key = "delegation_rules"

    def get(self, request):
        payload = {}
        for role in Role.objects.filter(key__in=ROLE_HIERARCHY.keys()).order_by("name"):
            payload[role.key] = {
                "role_id": role.id,
                "role_name": role.name,
                "permissions": sorted(PermissionDelegation.objects.filter(role=role).values_list("permission__key", flat=True)),
                "manageable_target_roles": [key for key, level in ROLE_HIERARCHY.items() if level < ROLE_HIERARCHY.get(role.key, 0)],
            }
        return Response(
            {
                "rules": payload,
                "all_permission_keys": list(AppPermission.objects.values_list("key", flat=True).order_by("key")),
            }
        )

    def patch(self, request, role_id):
        role = Role.objects.filter(id=role_id).first()
        if role is None:
            return Response({"detail": "Role not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = DelegationRuleWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        permissions = list(AppPermission.objects.filter(key__in=serializer.validated_data["permission_keys"]))
        PermissionDelegation.objects.filter(role=role).exclude(permission__in=permissions).delete()
        existing_ids = set(PermissionDelegation.objects.filter(role=role).values_list("permission_id", flat=True))
        for permission in permissions:
            if permission.id not in existing_ids:
                PermissionDelegation.objects.create(role=role, permission=permission)
        log_admin_action(actor=request.user, module="delegation_rules", action="update", target_model="Role", target_id=role.id, target_label=role.name, metadata={"permission_keys": serializer.validated_data["permission_keys"]})
        return self.get(request)


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
        queryset = AdminAuditLog.objects.select_related("actor").order_by("-created_at")
        module = request.query_params.get("module")
        if module:
            queryset = queryset.filter(module=module)
        if self.role_key(request.user) != "super_admin":
            queryset = queryset.filter(Q(actor=request.user) | Q(actor__company_id=request.user.company_id))
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
        queryset = self.scoped_requests(request.user)
        return Response(
            {
                "request_volume_by_company": list(queryset.values("company__name").annotate(total=Count("id")).order_by("-total")),
                "request_volume_by_entity": list(queryset.values("target_entity__name").annotate(total=Count("id")).order_by("-total")),
                "requests_by_type": list(queryset.values("category").annotate(total=Count("id")).order_by("-total")),
                "requests_by_status": list(queryset.values("status").annotate(total=Count("id")).order_by("-total")),
                "open_vs_resolved": {
                    "open": queryset.filter(status__in=[ServiceRequest.Status.NEW, ServiceRequest.Status.ACCEPTED, ServiceRequest.Status.IN_PROGRESS]).count(),
                    "resolved": queryset.filter(status__in=[ServiceRequest.Status.COMPLETED, ServiceRequest.Status.CLOSED]).count(),
                },
                "team_workload": list(queryset.values("current_assignee__username").annotate(total=Count("id")).order_by("-total")),
                "trend_summaries": list(queryset.annotate(day=TruncDate("created_at")).values("day").annotate(total=Count("id")).order_by("-day")[:14]),
            }
        )
