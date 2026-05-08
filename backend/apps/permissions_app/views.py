import json
import os
import re
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request

from django.conf import settings
from django.db.models import Q
from django.db import transaction
from django.http import HttpResponse
from django.core.cache import cache
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated, SAFE_METHODS
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.entities.models import Entity
from apps.companies.models import Company
from apps.audit_logs.services import log_admin_action
from apps.notifications.models import UserNotification
from apps.notifications.services import create_notification
from apps.permissions_app.models import (
    AppPermission,
    UserPermissionOverride,
    UserRequestPermissionOverride,
    UserScopedAccessOverride,
    UserRole,
)
from apps.roles.models import Role
from apps.users.models import User
from apps.requests_app.models import ServiceRequest
from apps.requests_app.views import get_visible_requests_queryset

from .serializers import (
    ManagedUserCreateSerializer,
    ManagedUserUpdateSerializer,
    ManageableUserListSerializer,
    UserPermissionAdminDetailSerializer,
    UserPermissionOverrideSerializer,
    UserRoleUpdateSerializer,
)
from .import_export import (
    USER_IMPORT_COLUMNS,
    build_users_csv,
    build_users_xlsx,
    parse_csv_file,
    parse_xlsx_file,
)
from .services import (
    ROLE_HIERARCHY,
    can_manage_any_users,
    can_manage_target_user_permissions,
    can_view_any_users,
    can_manage_target_user,
    can_view_target_user,
    has_permission,
    get_delegatable_permission_keys,
    get_effective_permission_keys,
    get_manage_scope,
    get_user_max_role_level,
    get_visible_users_queryset,
    is_super_admin_user,
    REQUEST_PERMISSION_OVERRIDE_KEYS,
    get_allowed_request_override_keys_for_user,
    get_primary_role_key,
)


class BaseManageUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def allows_permission_management_only(self):
        return False

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method in SAFE_METHODS:
            if can_view_any_users(request.user):
                return
            self.permission_denied(
                request,
                message="You do not have permission to view users.",
            )
        if not can_manage_any_users(request.user):
            if self.allows_permission_management_only() and has_permission(
                request.user, "permission_management"
            ):
                return
            self.permission_denied(
                request,
                message="You do not have permission to manage users.",
            )

    def get_target_user(self, user_id):
        target = (
            User.objects.filter(id=user_id)
            .prefetch_related("assigned_roles__role", "permission_overrides__permission")
            .select_related("company", "entity")
            .first()
        )
        if target is None:
            raise NotFound("User not found.")
        return target

    def ensure_manageable(self, request, target):
        if not can_manage_target_user(request.user, target):
            self.permission_denied(
                request,
                message="You cannot modify this user based on your scope or hierarchy.",
            )

    def ensure_viewable(self, request, target):
        if not can_view_target_user(request.user, target):
            self.permission_denied(
                request,
                message="You cannot view this user based on your scope or hierarchy.",
            )


class ManageableUsersPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class GlobalSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def _scoped_entities(self, user):
        if (
            has_permission(user, "view_all_companies")
            or has_permission(user, "manage_companies")
            or has_permission(user, "view_all_entities")
        ):
            return Entity.objects.filter(is_active=True).select_related("company")
        if has_permission(user, "manage_company_entities") and user.company_id:
            return Entity.objects.filter(is_active=True, company_id=user.company_id).select_related("company")
        if has_permission(user, "view_company_entities") and user.company_id:
            return Entity.objects.filter(is_active=True, company_id=user.company_id).select_related("company")
        if user.entity_id:
            return Entity.objects.filter(is_active=True, id=user.entity_id).select_related("company")
        return Entity.objects.none()

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response({"requests": [], "users": [], "entities": []})

        limit_raw = request.query_params.get("limit", "5")
        try:
            limit = int(limit_raw)
        except (TypeError, ValueError):
            limit = 5
        limit = max(1, min(limit, 10))

        requests_qs = (
            get_visible_requests_queryset(request.user)
            .filter(
                Q(request_number__icontains=query)
                | Q(title__icontains=query)
                | Q(description__icontains=query)
                | Q(category__icontains=query)
                | Q(requester_user__username__icontains=query)
            )
            .order_by("-created_at")[:limit]
        )
        request_results = [
            {
                "id": item.id,
                "label": item.title or item.request_number or f"Request #{item.id}",
                "subtitle": item.request_number or "",
                "link": f"/requests/{item.id}",
                "type": "request",
            }
            for item in requests_qs
        ]

        visible_user_ids = list(get_visible_users_queryset(request.user).values_list("id", flat=True))
        if request.user.id not in visible_user_ids:
            visible_user_ids.append(request.user.id)
        users_qs = (
            User.objects.filter(id__in=visible_user_ids, is_active=True)
            .select_related("company", "entity")
            .filter(
                Q(username__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(email__icontains=query)
                | Q(company__name__icontains=query)
                | Q(entity__name__icontains=query)
            )
            .order_by("username")[:limit]
        )
        user_results = []
        for item in users_qs:
            can_open_admin_user = can_view_any_users(request.user)
            link = f"/admin/users/{item.id}" if can_open_admin_user else "/profile"
            user_results.append(
                {
                    "id": item.id,
                    "label": item.get_full_name() or item.username,
                    "subtitle": item.email or item.username,
                    "link": link,
                    "type": "user",
                }
            )

        entities_qs = (
            self._scoped_entities(request.user)
            .filter(Q(name__icontains=query) | Q(code__icontains=query) | Q(company__name__icontains=query))
            .order_by("name")[:limit]
        )
        entity_results = [
            {
                "id": item.id,
                "label": item.name,
                "subtitle": f"{item.code} · {item.company.name}",
                "link": "/admin/entities",
                "type": "entity",
            }
            for item in entities_qs
        ]

        return Response(
            {
                "requests": request_results,
                "users": user_results,
                "entities": entity_results,
            }
        )


class ManageableUserListView(BaseManageUsersView):
    def get(self, request):
        search = (request.query_params.get("search") or "").strip()
        role_filter = (request.query_params.get("role") or "").strip()
        company_filter = request.query_params.get("company") or request.query_params.get("company_id")
        entity_filter = request.query_params.get("entity") or request.query_params.get("entity_id")
        status_filter = (request.query_params.get("status") or "").strip().lower()

        queryset = (
            get_visible_users_queryset(request.user)
            .select_related("company", "entity")
            .prefetch_related("assigned_roles__role")
        )

        if search:
            queryset = queryset.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
        if role_filter:
            queryset = queryset.filter(assigned_roles__role__key=role_filter)
        if company_filter:
            queryset = queryset.filter(company_id=company_filter)
        if entity_filter:
            queryset = queryset.filter(entity_id=entity_filter)
        if status_filter in {"active", "inactive"}:
            queryset = queryset.filter(is_active=(status_filter == "active"))

        queryset = queryset.distinct().order_by("username")
        paginator = ManageableUsersPagination()
        page = paginator.paginate_queryset(queryset, request)
        actor_level = get_user_max_role_level(request.user)
        serialized_rows = ManageableUserListSerializer(
            page if page is not None else queryset,
            many=True,
            context={"actor_level": actor_level, "request": request},
        ).data

        data = {
            "scope": get_manage_scope(request.user),
            "current_entity_name": getattr(request.user.entity, "name", ""),
            "current_user_level": actor_level,
            "current_user_roles": [
                {
                    "key": role_key,
                    "level": ROLE_HIERARCHY.get(role_key, 0),
                }
                for role_key in request.user.assigned_roles.values_list("role__key", flat=True)
            ],
            "effective_permission_keys": get_effective_permission_keys(request.user),
            "results": serialized_rows,
        }
        if page is not None:
            return Response(
                {
                    "count": paginator.page.paginator.count,
                    "next": paginator.get_next_link(),
                    "previous": paginator.get_previous_link(),
                    **data,
                }
            )
        return Response(data)

    def post(self, request):
        serializer = ManagedUserCreateSerializer(
            data=request.data,
            context={
                "request": request,
                "actor_level": get_user_max_role_level(request.user),
            },
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.create()
        log_admin_action(
            actor=request.user,
            module="users",
            action="create",
            target_model="User",
            target_id=user.id,
            target_label=user.username,
        )
        payload = ManageableUserListSerializer(
            user, context={"actor_level": get_user_max_role_level(request.user), "request": request}
        ).data
        return Response(payload, status=status.HTTP_201_CREATED)


class ManageableUserFormOptionsView(BaseManageUsersView):
    def get(self, request):
        actor = request.user

        actor_level = get_user_max_role_level(actor)
        role_options = [
            {"key": key, "name": key.replace("_", " ").title(), "level": level}
            for key, level in ROLE_HIERARCHY.items()
            if level < actor_level or (actor_level == ROLE_HIERARCHY["senior"] and key == "senior")
        ]

        actor_roles = set(actor.assigned_roles.values_list("role__key", flat=True))
        companies_qs = Company.objects.none()
        if "super_admin" in actor_roles:
            companies_qs = Company.objects.filter(is_active=True).order_by("name")
        elif actor.company_id:
            companies_qs = Company.objects.filter(id=actor.company_id, is_active=True)

        companies = [
            {"id": item.id, "name": item.name, "code": item.code}
            for item in companies_qs
        ]

        entities_qs = Entity.objects.none()
        if "super_admin" in actor_roles:
            entities_qs = Entity.objects.filter(is_active=True).select_related("company")
        elif "senior" in actor_roles and actor.company_id:
            entities_qs = Entity.objects.filter(
                company_id=actor.company_id, is_active=True
            ).select_related("company")
        elif actor.entity_id:
            entities_qs = Entity.objects.filter(id=actor.entity_id).select_related("company")

        entities = [
            {
                "id": item.id,
                "name": item.name,
                "entity_type": item.entity_type,
                "company_id": item.company_id,
                "company_name": item.company.name,
                "label": f"{item.name} ({item.get_entity_type_display()})",
            }
            for item in entities_qs.order_by("name")
        ]

        tl_queryset = (
            User.objects.filter(is_active=True, assigned_roles__role__key="team_leader")
            .select_related("company", "entity")
            .distinct()
        )
        if "super_admin" in actor_roles:
            pass
        elif "senior" in actor_roles and actor.company_id:
            tl_queryset = tl_queryset.filter(company_id=actor.company_id)
        elif actor.entity_id:
            tl_queryset = tl_queryset.filter(entity_id=actor.entity_id)
        else:
            tl_queryset = tl_queryset.none()

        team_leaders = [
            {
                "id": item.id,
                "username": item.username,
                "company_id": item.company_id,
                "entity_id": item.entity_id,
                "label": f"{item.username} ({item.entity.name if item.entity else '-'})",
            }
            for item in tl_queryset.order_by("username")
        ]
        payload = {
            "role_options": role_options,
            "company_options": companies,
            "entity_options": entities,
            "team_leader_options": team_leaders,
        }
        return Response(payload)


class ManageableUserCrudView(BaseManageUsersView):
    def patch(self, request, user_id):
        target = self.get_target_user(user_id)
        self.ensure_manageable(request, target)
        serializer = ManagedUserUpdateSerializer(
            data=request.data,
            context={"request": request, "target_user": target},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.update(target)
        log_admin_action(
            actor=request.user,
            module="users",
            action="update",
            target_model="User",
            target_id=user.id,
            target_label=user.username,
        )
        create_notification(
            user=user,
            event_type=UserNotification.EventType.GENERAL,
            title="Your account details were updated",
            message=f"{request.user.username} updated your account details.",
            link="/profile",
            metadata={"updated_by_user_id": request.user.id},
        )
        payload = ManageableUserListSerializer(
            user, context={"actor_level": get_user_max_role_level(request.user), "request": request}
        ).data
        return Response(payload)

    def delete(self, request, user_id):
        target = self.get_target_user(user_id)
        self.ensure_manageable(request, target)
        if UserRole.objects.filter(user=target, role__key="senior").exists():
            actor = request.user
            if not actor.assigned_roles.filter(role__key="super_admin").exists():
                self.permission_denied(
                    request,
                    message="Only Super Admin can delete Senior users.",
                )
        target.delete()
        log_admin_action(
            actor=request.user,
            module="users",
            action="delete",
            target_model="User",
            target_id=user_id,
            target_label=target.username,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ManageableUserExportView(BaseManageUsersView):
    def get(self, request):
        export_format = (
            request.query_params.get("file_format")
            or request.query_params.get("format")
            or "csv"
        ).strip().lower()
        if export_format not in {"csv", "xlsx"}:
            return Response(
                {"detail": "Unsupported export format. Use csv or xlsx."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = (
            get_visible_users_queryset(request.user)
            .select_related("company", "entity", "team_leader")
            .prefetch_related("assigned_roles__role")
        )
        rows = []
        for user in queryset:
            role_key = (
                user.assigned_roles.select_related("role")
                .values_list("role__key", flat=True)
                .first()
                or ""
            )
            rows.append(
                {
                    "username": user.username,
                    "email": user.email or "",
                    "first_name": user.first_name or "",
                    "last_name": user.last_name or "",
                    "role_key": role_key,
                    "company_id": user.company_id or "",
                    "entity_id": user.entity_id or "",
                    "team_leader_id": user.team_leader_id or "",
                    "is_active": "true" if user.is_active else "false",
                    "password": "",
                    "job_title": user.job_title or "",
                    "phone_number": user.phone_number or "",
                }
            )

        if export_format == "csv":
            content = build_users_csv(rows)
            response = HttpResponse(content, content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = 'attachment; filename="users_export.csv"'
            return response

        content = build_users_xlsx(rows)
        response = HttpResponse(
            content,
            content_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
        )
        response["Content-Disposition"] = 'attachment; filename="users_export.xlsx"'
        return response


class ManageableUserImportView(BaseManageUsersView):
    def _resolve_company_reference(self, reference):
        if reference in (None, ""):
            return None
        if isinstance(reference, int):
            company = Company.objects.filter(id=reference, is_active=True).first()
            return company.id if company else None
        text = str(reference).strip()
        if not text:
            return None
        if text.isdigit():
            company = Company.objects.filter(id=int(text), is_active=True).first()
            if company:
                return company.id
        company = Company.objects.filter(is_active=True).filter(code__iexact=text).first()
        if company:
            return company.id
        company = Company.objects.filter(is_active=True).filter(name__iexact=text).first()
        return company.id if company else None

    def _resolve_entity_reference(self, reference, company_id=None):
        if reference in (None, ""):
            return None
        base_qs = Entity.objects.filter(is_active=True)
        if company_id:
            base_qs = base_qs.filter(company_id=company_id)

        if isinstance(reference, int):
            direct = base_qs.filter(id=reference).first()
            if direct:
                return direct.id
            # Fallback: spreadsheet often uses 1..N index inside company.
            if company_id and reference > 0:
                entity_ids = list(base_qs.order_by("id").values_list("id", flat=True))
                idx = reference - 1
                if idx < len(entity_ids):
                    return entity_ids[idx]
            return None

        text = str(reference).strip()
        if not text:
            return None
        by_code = base_qs.filter(code__iexact=text).first()
        if by_code:
            return by_code.id
        by_name = base_qs.filter(name__iexact=text).first()
        if by_name:
            return by_name.id
        return None

    def _resolve_team_leader_reference(self, reference, company_id=None, entity_id=None):
        if reference in (None, ""):
            return None
        base_qs = User.objects.filter(is_active=True)
        if company_id:
            base_qs = base_qs.filter(company_id=company_id)
        if entity_id:
            base_qs = base_qs.filter(entity_id=entity_id)

        if isinstance(reference, int):
            user = base_qs.filter(id=reference).first()
            return user.id if user else None

        text = str(reference).strip()
        if not text:
            return None
        user = base_qs.filter(username__iexact=text).first()
        return user.id if user else None

    def _prepare_payload(self, raw_payload):
        payload = dict(raw_payload)
        company_ref = payload.get("company_id")
        company_id = self._resolve_company_reference(company_ref)
        if company_id is not None:
            payload["company_id"] = company_id

        entity_ref = payload.get("entity_id")
        entity_id = self._resolve_entity_reference(entity_ref, company_id=company_id)
        if entity_id is not None:
            payload["entity_id"] = entity_id

        team_leader_ref = payload.get("team_leader_id")
        team_leader_id = self._resolve_team_leader_reference(
            team_leader_ref, company_id=company_id, entity_id=entity_id
        )
        if team_leader_id is not None:
            payload["team_leader_id"] = team_leader_id
        return payload

    def post(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return Response(
                {"detail": "File is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_name = (upload.name or "").lower()
        try:
            if file_name.endswith(".csv"):
                parsed_rows = parse_csv_file(upload)
            elif file_name.endswith(".xlsx"):
                parsed_rows = parse_xlsx_file(upload)
            else:
                return Response(
                    {"detail": "Unsupported file type. Upload .csv or .xlsx."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        created_count = 0
        created_users = []
        errors = []
        actor_level = get_user_max_role_level(request.user)
        for item in parsed_rows:
            payload = self._prepare_payload(item["payload"])
            serializer = ManagedUserCreateSerializer(
                data=payload,
                context={"request": request, "actor_level": actor_level},
            )
            if not serializer.is_valid():
                errors.append({"line": item["line"], "errors": serializer.errors})
                continue
            user = serializer.create()
            if payload.get("job_title"):
                user.job_title = payload["job_title"]
            if payload.get("phone_number"):
                user.phone_number = payload["phone_number"]
            if payload.get("job_title") or payload.get("phone_number"):
                user.save(update_fields=["job_title", "phone_number"])
            created_count += 1
            created_users.append(
                ManageableUserListSerializer(
                    user, context={"actor_level": actor_level, "request": request}
                ).data
            )

        return Response(
            {
                "columns": USER_IMPORT_COLUMNS,
                "total_rows": len(parsed_rows),
                "created_count": created_count,
                "error_count": len(errors),
                "created_users": created_users,
                "errors": errors,
            },
            status=status.HTTP_200_OK,
        )


class ManageUserDetailView(BaseManageUsersView):
    def allows_permission_management_only(self):
        return True

    def build_payload(self, request, target):
        actor_level = get_user_max_role_level(request.user)
        can_edit = can_manage_target_user(request.user, target)
        can_manage_permissions = can_manage_target_user_permissions(request.user, target)
        delegatable_permission_keys = get_delegatable_permission_keys(request.user)
        available_roles = [
            {
                "key": role_key,
                "name": role_key.replace("_", " ").title(),
                "level": level,
            }
            for role_key, level in ROLE_HIERARCHY.items()
            if level < actor_level or (actor_level == ROLE_HIERARCHY["senior"] and role_key == "senior")
        ]
        payload = UserPermissionAdminDetailSerializer(
            target, context={"editor_user": request.user, "request": request}
        ).data
        payload["available_roles"] = available_roles if can_manage_permissions else []
        payload["can_edit"] = can_edit
        payload["can_manage_permissions"] = can_manage_permissions
        payload["delegatable_permission_keys"] = delegatable_permission_keys
        return payload

    def get(self, request, user_id):
        target = self.get_target_user(user_id)
        self.ensure_viewable(request, target)
        return Response(self.build_payload(request, target))

    def patch(self, request, user_id):
        target = self.get_target_user(user_id)
        self.ensure_viewable(request, target)
        if not can_manage_target_user_permissions(request.user, target):
            self.permission_denied(
                request,
                message="You do not have permission to manage user roles and permissions.",
            )
        serializer = UserRoleUpdateSerializer(
            data=request.data,
            context={
                "request": request,
                "target_user": target,
                "actor_level": get_user_max_role_level(request.user),
            },
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        target.refresh_from_db()
        target = self.get_target_user(user_id)
        log_admin_action(
            actor=request.user,
            module="roles",
            action="assign",
            target_model="User",
            target_id=target.id,
            target_label=target.username,
            metadata={"role_keys": request.data.get("role_keys", [])},
        )
        create_notification(
            user=target,
            event_type=UserNotification.EventType.GENERAL,
            title="Your role was updated",
            message=f"{request.user.username} updated your role.",
            link="/profile",
            metadata={
                "updated_by_user_id": request.user.id,
                "role_keys": request.data.get("role_keys", []),
            },
        )
        return Response(self.build_payload(request, target))


class ManageUserPermissionOverrideView(BaseManageUsersView):
    def allows_permission_management_only(self):
        return True

    @staticmethod
    def enforce_status_permission_dependency(user, reason="Auto-adjusted by status permission policy."):
        effective_keys = set(get_effective_permission_keys(user))
        if "resolve_request" in effective_keys:
            return
        close_permission = AppPermission.objects.filter(key="close_request").first()
        if close_permission is None:
            return
        UserPermissionOverride.objects.update_or_create(
            user=user,
            permission=close_permission,
            defaults={"is_allowed": False, "reason": reason},
        )

    def build_payload(self, request, target):
        actor_level = get_user_max_role_level(request.user)
        can_edit = can_manage_target_user(request.user, target)
        can_manage_permissions = can_manage_target_user_permissions(request.user, target)
        delegatable_permission_keys = get_delegatable_permission_keys(request.user)
        available_roles = [
            {
                "key": role_key,
                "name": role_key.replace("_", " ").title(),
                "level": level,
            }
            for role_key, level in ROLE_HIERARCHY.items()
            if level < actor_level or (actor_level == ROLE_HIERARCHY["senior"] and role_key == "senior")
        ]
        payload = UserPermissionAdminDetailSerializer(
            target, context={"editor_user": request.user, "request": request}
        ).data
        payload["available_roles"] = available_roles if can_manage_permissions else []
        payload["can_edit"] = can_edit
        payload["can_manage_permissions"] = can_manage_permissions
        payload["delegatable_permission_keys"] = delegatable_permission_keys
        return payload

    def post(self, request, user_id):
        target = self.get_target_user(user_id)
        self.ensure_viewable(request, target)
        if not can_manage_target_user_permissions(request.user, target):
            self.permission_denied(
                request,
                message="You do not have permission to manage user roles and permissions.",
            )
        serializer = UserPermissionOverrideSerializer(
            data=request.data,
            context={
                "delegatable_permission_keys": get_delegatable_permission_keys(
                    request.user
                )
            },
        )
        serializer.is_valid(raise_exception=True)
        serializer.apply(target, True)
        self.enforce_status_permission_dependency(target)
        target = self.get_target_user(user_id)
        log_admin_action(
            actor=request.user,
            module="permissions",
            action="allow_override",
            target_model="User",
            target_id=target.id,
            target_label=target.username,
            metadata={"permission_key": serializer.validated_data["permission_key"]},
        )
        permission_key = serializer.validated_data["permission_key"]
        create_notification(
            user=target,
            event_type=UserNotification.EventType.GENERAL,
            title="A permission was added to your account",
            message=f"{request.user.username} granted '{permission_key}' permission to your account.",
            link="/profile",
            metadata={
                "updated_by_user_id": request.user.id,
                "permission_key": permission_key,
                "change_type": "granted",
            },
        )
        return Response(
            self.build_payload(request, target),
            status=status.HTTP_200_OK,
        )

    def delete(self, request, user_id):
        target = self.get_target_user(user_id)
        self.ensure_viewable(request, target)
        if not can_manage_target_user_permissions(request.user, target):
            self.permission_denied(
                request,
                message="You do not have permission to manage user roles and permissions.",
            )

        serializer = UserPermissionOverrideSerializer(
            data=request.data,
            context={
                "delegatable_permission_keys": get_delegatable_permission_keys(
                    request.user
                )
            },
        )
        serializer.is_valid(raise_exception=True)
        serializer.apply(target, False)
        self.enforce_status_permission_dependency(target)
        target = self.get_target_user(user_id)

        permission_key = serializer.validated_data["permission_key"]
        log_admin_action(
            actor=request.user,
            module="permissions",
            action="deny_override",
            target_model="User",
            target_id=target.id,
            target_label=target.username,
            metadata={"permission_key": permission_key},
        )
        create_notification(
            user=target,
            event_type=UserNotification.EventType.GENERAL,
            title="A permission was removed from your account",
            message=f"{request.user.username} removed '{permission_key}' permission from your account.",
            link="/profile",
            metadata={
                "updated_by_user_id": request.user.id,
                "permission_key": permission_key,
                "change_type": "revoked",
            },
        )
        return Response(
            self.build_payload(request, target),
            status=status.HTTP_200_OK,
        )


class AdminRequestPermissionControlView(APIView):
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        role_key = get_primary_role_key(request.user)
        allowed_roles = {"super_admin", "senior", "manager", "team_leader"}
        if role_key not in allowed_roles or not can_manage_any_users(request.user):
            self.permission_denied(
                request,
                message="You do not have access to request permission control.",
            )

    def _serialize_request(self, item):
        return {
            "id": item.id,
            "reference": item.request_number,
            "title": item.title,
            "status": item.status,
            "priority": item.priority,
        }

    def _base_access_map(self, target_user, permission_key, requests_qs):
        if permission_key == "request.view":
            visible_ids = set(
                get_visible_requests_queryset(target_user, include_related=False, include_ordering=False)
                .values_list("id", flat=True)
            )
            return {request_id: (request_id in visible_ids) for request_id in requests_qs.values_list("id", flat=True)}
        from apps.requests_app.views import (
            can_assign_request,
            can_edit_request_deadline,
            can_update_request_status,
            can_validate_completed_result,
        )
        effective_permission_keys = set(get_effective_permission_keys(target_user))
        mapping = {}
        for item in requests_qs:
            if permission_key == "request.assign":
                mapping[item.id] = can_assign_request(target_user, item)
            elif permission_key == "request.approve":
                mapping[item.id] = can_validate_completed_result(target_user, item)
            elif permission_key == "request.update_status":
                mapping[item.id] = can_update_request_status(target_user, item)
            elif permission_key == "request.comment":
                mapping[item.id] = "comment_request" in effective_permission_keys
            elif permission_key == "request.view_discussion":
                mapping[item.id] = "view_request_discussion" in effective_permission_keys
            elif permission_key == "request.edit_deadline":
                mapping[item.id] = can_edit_request_deadline(target_user, item)
            else:
                mapping[item.id] = False
        return mapping

    def _actor_controllable_ids(self, actor_user, permission_key, request_ids):
        ids = {int(item) for item in (request_ids or [])}
        if not ids:
            return set()
        if is_super_admin_user(actor_user):
            return ids
        access_map = self._base_access_map(
            actor_user,
            permission_key,
            ServiceRequest.objects.filter(id__in=ids),
        )
        return {request_id for request_id, allowed in access_map.items() if allowed}

    def _actor_controllable_universe_ids(self, actor_user, permission_key):
        if is_super_admin_user(actor_user):
            return set(ServiceRequest.objects.values_list("id", flat=True))
        if permission_key == "request.view":
            return set(
                get_visible_requests_queryset(
                    actor_user,
                    include_related=False,
                    include_ordering=False,
                ).values_list("id", flat=True)
            )
        visible_ids = list(
            get_visible_requests_queryset(
                actor_user,
                include_related=False,
                include_ordering=False,
            ).values_list("id", flat=True)
        )
        if not visible_ids:
            return set()
        access_map = self._base_access_map(
            actor_user,
            permission_key,
            ServiceRequest.objects.filter(id__in=visible_ids),
        )
        return {request_id for request_id, allowed in access_map.items() if allowed}

    def _build_payload(self, target_user, permission_key, params, actor_user=None):
        allowed_permission_keys = get_allowed_request_override_keys_for_user(target_user)
        if permission_key not in allowed_permission_keys:
            return None

        # For non-view request permissions, operate only on requests the user can
        # effectively see (request.view scope + overrides). This avoids exposing
        # hidden requests in permission-control UI.
        if permission_key == "request.view":
            queryset = ServiceRequest.objects.select_related(
                "requester_user",
                "source_entity",
                "target_entity",
            ).order_by("-created_at")
        else:
            visible_ids = list(
                get_visible_requests_queryset(
                    target_user, include_related=False, include_ordering=False
                ).values_list("id", flat=True)
            )
            queryset = ServiceRequest.objects.filter(id__in=visible_ids).select_related(
                "requester_user",
                "source_entity",
                "target_entity",
            ).order_by("-created_at")

        search = (params.get("search") or "").strip()
        status_filter = (params.get("status") or "").strip().upper()
        priority_filter = (params.get("priority") or "").strip().upper()
        if search:
            queryset = queryset.filter(
                Q(request_number__icontains=search) | Q(title__icontains=search)
            )
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if priority_filter:
            queryset = queryset.filter(priority=priority_filter)

        all_requests = list(queryset)
        all_request_ids = [item.id for item in all_requests]
        if actor_user is not None:
            controllable_ids = self._actor_controllable_ids(actor_user, permission_key, all_request_ids)
            all_requests = [item for item in all_requests if item.id in controllable_ids]
            all_request_ids = [item.id for item in all_requests]

        base_allow_map = self._base_access_map(
            target_user,
            permission_key,
            ServiceRequest.objects.filter(id__in=all_request_ids),
        )
        override_map = {
            row["request_id"]: row["allowed"]
            for row in UserRequestPermissionOverride.objects.filter(
                user=target_user,
                permission_key=permission_key,
                request_id__in=all_request_ids,
            ).values("request_id", "allowed")
        }

        allowed_requests = []
        denied_requests = []
        for item in all_requests:
            effective_allowed = override_map.get(item.id, base_allow_map.get(item.id, False))
            payload_row = self._serialize_request(item)
            if effective_allowed:
                allowed_requests.append(payload_row)
            else:
                denied_requests.append(payload_row)

        return {
            "user": {
                "id": target_user.id,
                "username": target_user.username,
                "email": target_user.email,
            },
            "permission_key": permission_key,
            "available_permissions": allowed_permission_keys,
            "allowed_requests": allowed_requests,
            "denied_requests": denied_requests,
        }

    def get(self, request, user_id):
        target_user = User.objects.filter(id=user_id).first()
        if target_user is None:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if not is_super_admin_user(request.user) and not can_manage_target_user_permissions(request.user, target_user):
            self.permission_denied(
                request,
                message="You cannot manage request permissions for this user.",
            )
        allowed_permission_keys = get_allowed_request_override_keys_for_user(target_user)
        permission_key = request.query_params.get("permission_key") or "request.view"
        if permission_key not in allowed_permission_keys:
            return Response(
                {
                    "detail": "Invalid permission_key.",
                    "available_permissions": allowed_permission_keys,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = self._build_payload(target_user, permission_key, request.query_params, actor_user=request.user)
        return Response(payload)

    def post(self, request, user_id):
        target_user = User.objects.filter(id=user_id).first()
        if target_user is None:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if not is_super_admin_user(request.user) and not can_manage_target_user_permissions(request.user, target_user):
            self.permission_denied(
                request,
                message="You cannot manage request permissions for this user.",
            )
        allowed_permission_keys = get_allowed_request_override_keys_for_user(target_user)

        permission_key = request.data.get("permission_key")
        if permission_key not in allowed_permission_keys:
            return Response(
                {
                    "detail": "Invalid permission_key.",
                    "available_permissions": allowed_permission_keys,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        delta_grant_ids = request.data.get("grant_request_ids")
        delta_revoke_ids = request.data.get("revoke_request_ids")
        use_delta_payload = isinstance(delta_grant_ids, list) or isinstance(delta_revoke_ids, list)

        if use_delta_payload:
            grant_ids = delta_grant_ids if isinstance(delta_grant_ids, list) else []
            revoke_ids = delta_revoke_ids if isinstance(delta_revoke_ids, list) else []
            if not isinstance(grant_ids, list) or not isinstance(revoke_ids, list):
                return Response(
                    {"detail": "grant_request_ids and revoke_request_ids must be arrays."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                grant_ids = {int(item) for item in grant_ids}
                revoke_ids = {int(item) for item in revoke_ids}
            except (TypeError, ValueError):
                return Response(
                    {"detail": "Request IDs must be integers."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            duplicate_ids = sorted(grant_ids & revoke_ids)
            if duplicate_ids:
                return Response(
                    {"detail": "Some requests are present in both grant and revoke lists.", "ids": duplicate_ids},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            touched_ids = grant_ids | revoke_ids
            existing_ids = set(
                ServiceRequest.objects.filter(id__in=touched_ids).values_list("id", flat=True)
            )
            missing_ids = sorted(touched_ids - existing_ids)
            if missing_ids:
                return Response(
                    {"detail": "Some request IDs do not exist.", "missing_request_ids": missing_ids},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            controllable_ids = self._actor_controllable_ids(request.user, permission_key, touched_ids)
            forbidden_ids = sorted(touched_ids - controllable_ids)
            if forbidden_ids:
                return Response(
                    {"detail": "Some requests are outside your controllable scope.", "forbidden_request_ids": forbidden_ids},
                    status=status.HTTP_403_FORBIDDEN,
                )

            with transaction.atomic():
                if touched_ids:
                    rows = []
                    rows.extend(
                        UserRequestPermissionOverride(
                            user=target_user,
                            request_id=request_id,
                            permission_key=permission_key,
                            allowed=True,
                            created_by=request.user,
                        )
                        for request_id in grant_ids
                    )
                    rows.extend(
                        UserRequestPermissionOverride(
                            user=target_user,
                            request_id=request_id,
                            permission_key=permission_key,
                            allowed=False,
                            created_by=request.user,
                        )
                        for request_id in revoke_ids
                    )
                    UserRequestPermissionOverride.objects.bulk_create(
                        rows,
                        update_conflicts=True,
                        update_fields=["allowed", "created_by", "updated_at"],
                        unique_fields=["user", "request", "permission_key"],
                    )
        else:
            allowed_ids = request.data.get("allowed_request_ids", [])
            denied_ids = request.data.get("denied_request_ids", [])
            if not isinstance(allowed_ids, list) or not isinstance(denied_ids, list):
                return Response(
                    {"detail": "allowed_request_ids and denied_request_ids must be arrays."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                allowed_ids = {int(item) for item in allowed_ids}
                denied_ids = {int(item) for item in denied_ids}
            except (TypeError, ValueError):
                return Response(
                    {"detail": "Request IDs must be integers."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            duplicate_ids = sorted(allowed_ids & denied_ids)
            if duplicate_ids:
                return Response(
                    {"detail": "Some requests are present in both allowed and denied lists.", "ids": duplicate_ids},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            submitted_ids = allowed_ids | denied_ids
            existing_ids = set(
                ServiceRequest.objects.filter(id__in=submitted_ids).values_list("id", flat=True)
            )
            missing_ids = sorted(submitted_ids - existing_ids)
            if missing_ids:
                return Response(
                    {"detail": "Some request IDs do not exist.", "missing_request_ids": missing_ids},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            controllable_ids = self._actor_controllable_ids(request.user, permission_key, submitted_ids)
            forbidden_ids = sorted(submitted_ids - controllable_ids)
            if forbidden_ids:
                return Response(
                    {"detail": "Some requests are outside your controllable scope.", "forbidden_request_ids": forbidden_ids},
                    status=status.HTTP_403_FORBIDDEN,
                )
            controllable_universe_ids = self._actor_controllable_universe_ids(request.user, permission_key)

            with transaction.atomic():
                UserRequestPermissionOverride.objects.filter(
                    user=target_user,
                    permission_key=permission_key,
                    request_id__in=controllable_universe_ids,
                ).exclude(request_id__in=submitted_ids).delete()

                rows = []
                rows.extend(
                    UserRequestPermissionOverride(
                        user=target_user,
                        request_id=request_id,
                        permission_key=permission_key,
                        allowed=True,
                        created_by=request.user,
                    )
                    for request_id in allowed_ids
                )
                rows.extend(
                    UserRequestPermissionOverride(
                        user=target_user,
                        request_id=request_id,
                        permission_key=permission_key,
                        allowed=False,
                        created_by=request.user,
                    )
                    for request_id in denied_ids
                )
                if rows:
                    UserRequestPermissionOverride.objects.bulk_create(
                        rows,
                        update_conflicts=True,
                        update_fields=["allowed", "created_by", "updated_at"],
                        unique_fields=["user", "request", "permission_key"],
                    )

        payload = self._build_payload(target_user, permission_key, request.query_params, actor_user=request.user)
        return Response(payload, status=status.HTTP_200_OK)


class AdminUserAccessPermissionControlView(APIView):
    permission_classes = [IsAuthenticated]

    CONTROL_KEYS = [
        UserScopedAccessOverride.ControlKey.VIEW_USERS,
        UserScopedAccessOverride.ControlKey.MANAGE_USERS,
        UserScopedAccessOverride.ControlKey.PERMISSION_MANAGEMENT,
    ]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        role_key = get_primary_role_key(request.user)
        allowed_roles = {"super_admin", "senior", "manager", "team_leader"}
        if role_key not in allowed_roles or not can_manage_any_users(request.user):
            self.permission_denied(
                request,
                message="You do not have access to user permission control.",
            )

    def _serialize_user(self, user):
        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role_key": get_primary_role_key(user) or "user",
            "company_id": user.company_id,
            "entity_id": user.entity_id,
        }

    def _can_target_user_be_managed(self, actor, target):
        return is_super_admin_user(actor) or can_manage_target_user(actor, target)

    def _actor_control_map(self, actor, control_key, candidates):
        mapping = {}
        for candidate in candidates:
            if control_key == UserScopedAccessOverride.ControlKey.VIEW_USERS:
                mapping[candidate.id] = can_view_target_user(actor, candidate)
            elif control_key == UserScopedAccessOverride.ControlKey.MANAGE_USERS:
                mapping[candidate.id] = can_manage_target_user(actor, candidate)
            else:
                mapping[candidate.id] = can_manage_target_user_permissions(actor, candidate)
        return mapping

    def _target_base_map(self, target_user, control_key, candidates):
        mapping = {}
        for candidate in candidates:
            if control_key == UserScopedAccessOverride.ControlKey.VIEW_USERS:
                mapping[candidate.id] = can_view_target_user(target_user, candidate)
            elif control_key == UserScopedAccessOverride.ControlKey.MANAGE_USERS:
                mapping[candidate.id] = can_manage_target_user(target_user, candidate)
            else:
                mapping[candidate.id] = can_manage_target_user_permissions(target_user, candidate)
        return mapping

    def _build_payload(self, actor, target_user, control_key, params):
        if control_key not in self.CONTROL_KEYS:
            return None

        search = (params.get("search") or "").strip().lower()
        role_filter = (params.get("role") or "").strip().lower()
        visible_candidates = list(
            get_visible_users_queryset(actor)
            .exclude(id__in=[actor.id, target_user.id])
            .select_related("company", "entity")
            .prefetch_related("assigned_roles__role")
            .order_by("username")
        )
        if control_key in {
            UserScopedAccessOverride.ControlKey.MANAGE_USERS,
            UserScopedAccessOverride.ControlKey.PERMISSION_MANAGEMENT,
        }:
            target_viewable_ids = set(
                get_visible_users_queryset(target_user).values_list("id", flat=True)
            )
            visible_candidates = [
                user for user in visible_candidates if user.id in target_viewable_ids
            ]
        if search:
            visible_candidates = [
                user for user in visible_candidates
                if search in (user.username or "").lower()
                or search in (user.email or "").lower()
            ]
        if role_filter:
            visible_candidates = [
                user for user in visible_candidates
                if (get_primary_role_key(user) or "user").lower() == role_filter
            ]

        actor_map = self._actor_control_map(actor, control_key, visible_candidates)
        controllable_candidates = [user for user in visible_candidates if actor_map.get(user.id)]

        base_map = self._target_base_map(target_user, control_key, controllable_candidates)
        override_map = {
            row["subject_user_id"]: row["allowed"]
            for row in UserScopedAccessOverride.objects.filter(
                user=target_user,
                control_key=control_key,
                subject_user_id__in=[user.id for user in controllable_candidates],
            ).values("subject_user_id", "allowed")
        }

        allowed_users = []
        denied_users = []
        for user in controllable_candidates:
            effective_allowed = override_map.get(user.id, base_map.get(user.id, False))
            row = self._serialize_user(user)
            if effective_allowed:
                allowed_users.append(row)
            else:
                denied_users.append(row)

        available_controls = [UserScopedAccessOverride.ControlKey.VIEW_USERS, UserScopedAccessOverride.ControlKey.MANAGE_USERS]
        if can_manage_target_user_permissions(actor, target_user):
            available_controls.append(UserScopedAccessOverride.ControlKey.PERMISSION_MANAGEMENT)

        return {
            "user": self._serialize_user(target_user),
            "control_key": control_key,
            "available_controls": available_controls,
            "allowed_users": allowed_users,
            "denied_users": denied_users,
        }

    def get(self, request, user_id):
        target_user = User.objects.filter(id=user_id).first()
        if target_user is None:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if not self._can_target_user_be_managed(request.user, target_user):
            self.permission_denied(
                request,
                message="You cannot manage this user.",
            )
        control_key = request.query_params.get("control_key") or UserScopedAccessOverride.ControlKey.VIEW_USERS
        if control_key not in self.CONTROL_KEYS:
            return Response(
                {"detail": "Invalid control_key.", "available_controls": self.CONTROL_KEYS},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = self._build_payload(request.user, target_user, control_key, request.query_params)
        if control_key == UserScopedAccessOverride.ControlKey.PERMISSION_MANAGEMENT and control_key not in (payload.get("available_controls") or []):
            return Response(
                {"detail": "You cannot manage permission-management overrides for this user.", "available_controls": payload.get("available_controls") or []},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(payload, status=status.HTTP_200_OK)

    def post(self, request, user_id):
        target_user = User.objects.filter(id=user_id).first()
        if target_user is None:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if not self._can_target_user_be_managed(request.user, target_user):
            self.permission_denied(
                request,
                message="You cannot manage this user.",
            )

        control_key = request.data.get("control_key")
        if control_key not in self.CONTROL_KEYS:
            return Response(
                {"detail": "Invalid control_key.", "available_controls": self.CONTROL_KEYS},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if (
            control_key == UserScopedAccessOverride.ControlKey.PERMISSION_MANAGEMENT
            and not can_manage_target_user_permissions(request.user, target_user)
        ):
            return Response(
                {"detail": "You cannot manage permission-management overrides for this user."},
                status=status.HTTP_403_FORBIDDEN,
            )

        grant_user_ids = request.data.get("grant_user_ids")
        revoke_user_ids = request.data.get("revoke_user_ids")
        if not isinstance(grant_user_ids, list) or not isinstance(revoke_user_ids, list):
            return Response(
                {"detail": "grant_user_ids and revoke_user_ids must be arrays."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            grant_user_ids = {int(item) for item in grant_user_ids}
            revoke_user_ids = {int(item) for item in revoke_user_ids}
        except (TypeError, ValueError):
            return Response(
                {"detail": "User IDs must be integers."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        duplicate_ids = sorted(grant_user_ids & revoke_user_ids)
        if duplicate_ids:
            return Response(
                {"detail": "Some users are present in both grant and revoke lists.", "ids": duplicate_ids},
                status=status.HTTP_400_BAD_REQUEST,
            )
        touched_ids = grant_user_ids | revoke_user_ids
        existing_ids = set(User.objects.filter(id__in=touched_ids).values_list("id", flat=True))
        missing_ids = sorted(touched_ids - existing_ids)
        if missing_ids:
            return Response(
                {"detail": "Some user IDs do not exist.", "missing_user_ids": missing_ids},
                status=status.HTTP_400_BAD_REQUEST,
            )

        candidate_users = list(User.objects.filter(id__in=touched_ids))
        if control_key in {
            UserScopedAccessOverride.ControlKey.MANAGE_USERS,
            UserScopedAccessOverride.ControlKey.PERMISSION_MANAGEMENT,
        }:
            target_viewable_ids = set(
                get_visible_users_queryset(target_user).values_list("id", flat=True)
            )
            not_viewable_ids = sorted(
                user.id for user in candidate_users if user.id not in target_viewable_ids
            )
            if not_viewable_ids:
                return Response(
                    {
                        "detail": "Some users are not viewable by the selected user.",
                        "not_viewable_user_ids": not_viewable_ids,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
        controllable_map = self._actor_control_map(request.user, control_key, candidate_users)
        forbidden_ids = sorted(
            user.id for user in candidate_users if not controllable_map.get(user.id, False)
        )
        if forbidden_ids:
            return Response(
                {"detail": "Some users are outside your controllable scope.", "forbidden_user_ids": forbidden_ids},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            rows = []
            rows.extend(
                UserScopedAccessOverride(
                    user=target_user,
                    subject_user_id=user_id_value,
                    control_key=control_key,
                    allowed=True,
                    created_by=request.user,
                )
                for user_id_value in grant_user_ids
            )
            rows.extend(
                UserScopedAccessOverride(
                    user=target_user,
                    subject_user_id=user_id_value,
                    control_key=control_key,
                    allowed=False,
                    created_by=request.user,
                )
                for user_id_value in revoke_user_ids
            )
            if rows:
                UserScopedAccessOverride.objects.bulk_create(
                    rows,
                    update_conflicts=True,
                    update_fields=["allowed", "created_by", "updated_at"],
                    unique_fields=["user", "subject_user", "control_key"],
                )

        payload = self._build_payload(request.user, target_user, control_key, request.query_params)
        return Response(payload, status=status.HTTP_200_OK)


class RequestPermissionAiAssistantView(APIView):
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        role_key = get_primary_role_key(request.user)
        allowed_roles = {"super_admin", "senior", "manager", "team_leader"}
        if role_key not in allowed_roles or not can_manage_any_users(request.user):
            self.permission_denied(
                request,
                message="You do not have access to AI permission assistant.",
            )

    def _read_env_value(self, key):
        candidate_files = [Path(settings.BASE_DIR) / ".env", Path(settings.BASE_DIR) / "env"]
        for env_file in candidate_files:
            if not env_file.exists():
                continue
            try:
                for raw_line in env_file.read_text(encoding="utf-8").splitlines():
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    env_key, value = line.split("=", 1)
                    if env_key.strip() == key:
                        parsed = value.strip().strip('"').strip("'")
                        if parsed:
                            return parsed
            except OSError:
                continue
        return os.getenv(key, "").strip()

    def _openrouter_chat(self, messages, model_name=None, max_tokens=700):
        api_key = self._read_env_value("OPENROUTER_API_KEY")
        if not api_key:
            raise ValueError("OpenRouter API key is missing.")
        configured_model = model_name or self._read_env_value("OPENROUTER_MODEL") or "baidu/qianfan-ocr-fast:free"
        # Fallback chain for transient provider outages or model-specific routing issues.
        candidate_models = [
            configured_model,
            "meta-llama/llama-3.3-70b-instruct:free",
            "poolside/laguna-xs.2:free",
        ]
        endpoint = "https://openrouter.ai/api/v1/chat/completions"
        last_error = "OpenRouter request failed."
        for model in candidate_models:
            for _attempt in range(2):
                payload = {
                    "model": model,
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": 0.1,
                }
                http_request = urllib_request.Request(
                    endpoint,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {api_key}",
                    },
                    method="POST",
                )
                try:
                    with urllib_request.urlopen(http_request, timeout=20) as response:
                        data = json.loads(response.read().decode("utf-8"))
                    choices = data.get("choices") or []
                    if not choices:
                        last_error = f"No choices returned by model '{model}'."
                        continue
                    return (((choices[0] or {}).get("message") or {}).get("content") or "").strip()
                except urllib_error.HTTPError as exc:
                    body = exc.read().decode("utf-8", errors="ignore")
                    try:
                        parsed = json.loads(body)
                        last_error = (
                            parsed.get("error", {}).get("message")
                            or parsed.get("detail")
                            or "Provider returned error"
                        )
                    except (TypeError, ValueError):
                        last_error = "Provider returned error"
                    continue
                except (urllib_error.URLError, TimeoutError):
                    last_error = "OpenRouter is unreachable."
                    continue
        raise RuntimeError(last_error)

    def _extract_json(self, raw_text):
        text = (raw_text or "").strip()
        if not text:
            return {}
        try:
            return json.loads(text)
        except (TypeError, ValueError):
            pass
        match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
        if not match:
            return {}
        try:
            return json.loads(match.group(1))
        except (TypeError, ValueError):
            return {}

    def _build_current_effective_map(self, target_user, permission_key, requests):
        if permission_key == "request.view":
            visible_ids = set(
                get_visible_requests_queryset(
                    target_user, include_related=False, include_ordering=False
                ).values_list("id", flat=True)
            )
            return {item.id: (item.id in visible_ids) for item in requests}

        from apps.requests_app.views import (
            can_assign_request,
            can_edit_request_deadline,
            can_update_request_status,
            can_validate_completed_result,
        )

        effective_permission_keys = set(get_effective_permission_keys(target_user))
        current_map = {}
        for item in requests:
            if permission_key == "request.assign":
                current_map[item.id] = can_assign_request(target_user, item)
            elif permission_key == "request.approve":
                current_map[item.id] = can_validate_completed_result(target_user, item)
            elif permission_key == "request.update_status":
                current_map[item.id] = can_update_request_status(target_user, item)
            elif permission_key == "request.comment":
                current_map[item.id] = "comment_request" in effective_permission_keys
            elif permission_key == "request.view_discussion":
                current_map[item.id] = "view_request_discussion" in effective_permission_keys
            elif permission_key == "request.edit_deadline":
                current_map[item.id] = can_edit_request_deadline(target_user, item)
            else:
                current_map[item.id] = False
        return current_map

    def _extract_named_token(self, command_text, keywords):
        lowered = (command_text or "").lower()
        for keyword in keywords:
            marker = f"{keyword} "
            start = lowered.find(marker)
            if start == -1:
                continue
            value = command_text[start + len(marker):]
            value = value.split(",")[0].strip()
            if not value:
                continue
            # stop at common tail words to keep just code/name token
            value = re.split(r"\b(request|requests|status|priority|for|and)\b", value, maxsplit=1, flags=re.IGNORECASE)[0].strip()
            if value:
                return value
        return ""

    def _infer_from_command(self, command_text):
        text = (command_text or "").strip()
        lowered = text.lower()

        # Action inference
        deny_markers = [
            "deny",
            "block",
            "cannot",
            "can't",
            "cant",
            "remove",
            "without",
            "hide",
            "not see",
            "no access",
        ]
        allow_markers = [
            "allow",
            "add",
            "grant",
            "can see",
            "can comment",
            "can assign",
            "can approve",
            "can update status",
            "can view discussion",
            "can edit deadline",
            "be able to",
            "able to",
            "should be able to",
            "give access",
            "enable",
            "with access",
            "see",
        ]
        action = "deny"
        has_deny = any(marker in lowered for marker in deny_markers)
        has_allow = any(marker in lowered for marker in allow_markers)
        # Prefer explicit allow intent when user asks for ability/access.
        if has_allow and not has_deny:
            action = "allow"
        elif has_deny and not has_allow:
            action = "deny"
        elif has_allow and has_deny:
            if any(phrase in lowered for phrase in ["be able to", "able to", "should be able to", "give access", "enable"]):
                action = "allow"
            else:
                action = "deny"

        # Permission inference
        permission_key = "request.view"
        permission_map = [
            ("request.assign", ["assign", "assignment"]),
            ("request.approve", ["approve", "approval", "validate completed", "validation"]),
            ("request.update_status", ["update status", "change status", "status change"]),
            ("request.comment", ["comment", "reply", "discussion message"]),
            ("request.view_discussion", ["view discussion", "see discussion", "discussion"]),
            ("request.edit_deadline", ["deadline", "edit deadline", "change deadline"]),
            ("request.view", ["view", "see", "open"]),
        ]
        for key, markers in permission_map:
            if any(marker in lowered for marker in markers):
                permission_key = key
                break

        # Status inference
        status_map = {
            "in progress": ServiceRequest.Status.IN_PROGRESS,
            "new": ServiceRequest.Status.NEW,
            "accepted": ServiceRequest.Status.ACCEPTED,
            "rejected": ServiceRequest.Status.REJECTED,
            "completed": ServiceRequest.Status.COMPLETED,
            "closed": ServiceRequest.Status.CLOSED,
        }
        status_value = ""
        for marker, normalized in status_map.items():
            if marker in lowered:
                status_value = normalized
                break

        # Priority inference
        priority_map = {
            "low": ServiceRequest.Priority.LOW,
            "medium": ServiceRequest.Priority.MEDIUM,
            "high": ServiceRequest.Priority.HIGH,
            "critical": ServiceRequest.Priority.CRITICAL,
        }
        priority_value = ""
        for marker, normalized in priority_map.items():
            if marker in lowered:
                priority_value = normalized
                break

        request_references = re.findall(r"REQ-[A-Za-z0-9-]+", text, flags=re.IGNORECASE)
        request_references = [ref.upper() for ref in request_references]

        target_entity = self._extract_named_token(text, ["target team", "target", "for target", "entity"])
        source_entity = self._extract_named_token(text, ["from source", "source"])
        company = self._extract_named_token(text, ["for company", "company"])

        return {
            "permission_key": permission_key,
            "action": action,
            "request_references": request_references,
            "filters": {
                "status": status_value or None,
                "priority": priority_value or None,
                "search_text": None,
                "source_entity": source_entity or None,
                "target_entity": target_entity or None,
                "company": company or None,
            },
        }

    def _build_intent_summary(self, permission_key, action, request_references, filters, raw_command, allowed_permission_keys):
        active_filters = {
            "status": filters.get("status") or None,
            "priority": filters.get("priority") or None,
            "category": filters.get("category") or None,
            "search_text": filters.get("search_text") or None,
            "source_entity": filters.get("source_entity") or None,
            "target_entity": filters.get("target_entity") or None,
            "company": filters.get("company") or None,
        }
        active_filter_count = len([value for value in active_filters.values() if value])
        warnings = []
        confidence = 1.0

        if action not in {"allow", "deny"}:
            warnings.append("Action was unclear; defaulted to deny.")
            confidence -= 0.25
        if permission_key not in allowed_permission_keys:
            warnings.append("Permission was unclear; defaulted to request.view.")
            confidence -= 0.25
        if not request_references and active_filter_count == 0:
            warnings.append("No references or filters were detected. This would target all requests.")
            confidence -= 0.5
        if raw_command and len(raw_command.strip()) < 8:
            warnings.append("Command is very short; interpretation may be ambiguous.")
            confidence -= 0.15

        confidence = max(0.0, min(1.0, confidence))
        needs_confirmation = confidence < 0.6 or ("No references or filters were detected. This would target all requests." in warnings)
        return {
            "permission_key": permission_key,
            "action": action,
            "request_references": request_references,
            "filters": active_filters,
            "warnings": warnings,
            "confidence": round(confidence, 2),
            "needs_confirmation": needs_confirmation,
        }

    def _extract_multi_clause_tasks(self, command_text):
        text = (command_text or "").strip()
        if not text:
            return []
        clauses = [
            part.strip()
            for part in re.split(r"\s+(?:and|;|\n)\s+", text, flags=re.IGNORECASE)
            if part.strip()
        ]
        if len(clauses) <= 1:
            return []

        tasks = []
        for clause in clauses:
            inferred = self._infer_from_command(clause)
            refs = inferred.get("request_references") or []
            if not refs:
                # Multi-action mode is only safe for explicit reference clauses.
                return []
            tasks.append(
                {
                    "raw": clause,
                    "permission_key": inferred.get("permission_key") or "request.view",
                    "action": inferred.get("action") or "deny",
                    "request_references": refs,
                }
            )
        return tasks

    def post(self, request):
        user_id = request.data.get("user_id")
        command = (request.data.get("command") or "").strip()
        apply_changes = bool(request.data.get("apply", False))

        if not user_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not command:
            return Response({"detail": "command is required."}, status=status.HTTP_400_BAD_REQUEST)

        target_user = User.objects.filter(id=user_id).first()
        if target_user is None:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if not is_super_admin_user(request.user) and not can_manage_target_user_permissions(request.user, target_user):
            self.permission_denied(
                request,
                message="You cannot manage request permissions for this user.",
            )
        allowed_permission_keys = get_allowed_request_override_keys_for_user(target_user)

        multi_tasks = self._extract_multi_clause_tasks(command)
        if multi_tasks:
            operation_results = []
            all_change_rows = []
            total_matched = 0
            total_changed = 0

            with transaction.atomic():
                for task in multi_tasks:
                    permission_key = str(task["permission_key"]).strip()
                    action = str(task["action"]).strip().lower()
                    request_references = [str(ref).strip() for ref in task["request_references"] if str(ref).strip()]

                    if permission_key not in allowed_permission_keys:
                        permission_key = "request.view"
                    if action not in {"allow", "deny"}:
                        action = "deny"

                    matched_request_objects = list(
                        ServiceRequest.objects.filter(request_number__in=request_references).order_by("-created_at")
                    )
                    actor_controllable_map = self._build_current_effective_map(
                        request.user,
                        permission_key,
                        matched_request_objects,
                    )
                    matched_request_objects = [
                        item for item in matched_request_objects if actor_controllable_map.get(item.id, False)
                    ]
                    matched_requests = [
                        {
                            "id": item.id,
                            "request_number": item.request_number,
                            "title": item.title,
                            "status": item.status,
                            "priority": item.priority,
                        }
                        for item in matched_request_objects
                    ]
                    matched_by_ref = {item["request_number"]: item for item in matched_requests}
                    unmatched_references = [ref for ref in request_references if ref not in matched_by_ref]

                    current_effective_map = self._build_current_effective_map(
                        target_user,
                        permission_key,
                        matched_request_objects,
                    )
                    target_allowed = action == "allow"
                    change_plan = []
                    will_change_count = 0
                    for item in matched_requests:
                        current_effective = bool(current_effective_map.get(item["id"], False))
                        will_change = current_effective != target_allowed
                        if will_change:
                            will_change_count += 1
                        row = {
                            "id": item["id"],
                            "reference": item["request_number"],
                            "title": item["title"],
                            "status": item["status"],
                            "priority": item["priority"],
                            "permission_key": permission_key,
                            "action": action,
                            "current_effective": current_effective,
                            "target_effective": target_allowed,
                            "will_change": will_change,
                        }
                        change_plan.append(row)
                        all_change_rows.append(row)

                    if apply_changes and matched_requests:
                        rows = [
                            UserRequestPermissionOverride(
                                user=target_user,
                                request_id=item["id"],
                                permission_key=permission_key,
                                allowed=target_allowed,
                                created_by=request.user,
                            )
                            for item in matched_requests
                        ]
                        UserRequestPermissionOverride.objects.bulk_create(
                            rows,
                            update_conflicts=True,
                            update_fields=["allowed", "created_by", "updated_at"],
                            unique_fields=["user", "request", "permission_key"],
                        )

                    total_matched += len(matched_requests)
                    total_changed += will_change_count
                    operation_results.append(
                        {
                            "raw": task["raw"],
                            "permission_key": permission_key,
                            "action": action,
                            "matched_count": len(matched_requests),
                            "will_change_count": will_change_count,
                            "unmatched_references": unmatched_references,
                            "change_plan": change_plan,
                        }
                    )

            return Response(
                {
                    "user": {"id": target_user.id, "username": target_user.username},
                    "apply": apply_changes,
                    "multi": True,
                    "operations": operation_results,
                    "summary": {
                        "matched_count": total_matched,
                        "will_change_count": total_changed,
                        "unchanged_count": max(0, total_matched - total_changed),
                    },
                    "change_plan": all_change_rows,
                    "detail": f"Parsed {len(operation_results)} operations.",
                },
                status=status.HTTP_200_OK,
            )

        system_prompt = (
            "You are an assistant for request permission overrides. "
            "Return JSON only with keys: permission_key, action, request_references, filters. "
            "permission_key must be one of: "
            + ", ".join(allowed_permission_keys)
            + ". action must be allow or deny. "
            "request_references must be an array of request reference strings (REQ-...). "
            "filters must be an object with optional keys: status, priority, search_text, source_entity, target_entity, company. "
            "status one of NEW, ACCEPTED, IN_PROGRESS, REJECTED, COMPLETED, CLOSED. "
            "priority one of LOW, MEDIUM, HIGH, CRITICAL. "
            "source_entity/target_entity/company should be entity/company code or name text."
        )
        user_prompt = (
            f"User command: {command}\n"
            "If no explicit request references are provided, infer filters from intent "
            "(example: 'in progress requests' => status=IN_PROGRESS). "
            "If permission_key is not explicit, default to request.view."
        )
        inferred = self._infer_from_command(command)

        try:
            ai_raw = self._openrouter_chat(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=500,
            )
        except (ValueError, RuntimeError):
            ai_raw = ""

        parsed = self._extract_json(ai_raw)
        if not isinstance(parsed, dict):
            parsed = {}

        permission_key = str(parsed.get("permission_key") or inferred.get("permission_key") or "request.view").strip()
        action = str(parsed.get("action") or inferred.get("action") or "deny").strip().lower()
        request_references = parsed.get("request_references") if isinstance(parsed.get("request_references"), list) else inferred.get("request_references", [])
        request_references = [str(item).strip() for item in request_references if str(item).strip()]
        filters = parsed.get("filters") if isinstance(parsed.get("filters"), dict) else inferred.get("filters", {})
        status_filter = str(filters.get("status") or "").strip().upper()
        priority_filter = str(filters.get("priority") or "").strip().upper()
        search_text_filter = str(filters.get("search_text") or "").strip()
        source_entity_filter = str(filters.get("source_entity") or "").strip()
        target_entity_filter = str(filters.get("target_entity") or "").strip()
        company_filter = str(filters.get("company") or "").strip()

        # Fallback extraction from raw command when model does not structure these.
        if not target_entity_filter:
            target_entity_filter = self._extract_named_token(command, ["target", "target team", "for target"])
        if not source_entity_filter:
            source_entity_filter = self._extract_named_token(command, ["source", "from source"])
        if not company_filter:
            company_filter = self._extract_named_token(command, ["company", "for company"])
        category_filter = str(filters.get("category") or "").strip()
        if not category_filter:
            lowered_command = command.lower()
            if "info type" in lowered_command or "type info" in lowered_command or re.search(r"\binfo\b", lowered_command):
                category_filter = "INFO"
            elif "script type" in lowered_command or "type script" in lowered_command or re.search(r"\bscript\b", lowered_command):
                category_filter = "SCRIPT"

        if permission_key not in allowed_permission_keys:
            permission_key = "request.view"
        if action not in {"allow", "deny"}:
            action = "deny"
        if status_filter not in {
            ServiceRequest.Status.NEW,
            ServiceRequest.Status.ACCEPTED,
            ServiceRequest.Status.IN_PROGRESS,
            ServiceRequest.Status.REJECTED,
            ServiceRequest.Status.COMPLETED,
            ServiceRequest.Status.CLOSED,
        }:
            status_filter = ""
        if priority_filter not in {
            ServiceRequest.Priority.LOW,
            ServiceRequest.Priority.MEDIUM,
            ServiceRequest.Priority.HIGH,
            ServiceRequest.Priority.CRITICAL,
        }:
            priority_filter = ""

        intent_summary = self._build_intent_summary(
            permission_key=permission_key,
            action=action,
            request_references=request_references,
            filters={
                "status": status_filter,
                "priority": priority_filter,
                "category": category_filter,
                "search_text": search_text_filter,
                "source_entity": source_entity_filter,
                "target_entity": target_entity_filter,
                "company": company_filter,
            },
            raw_command=command,
            allowed_permission_keys=allowed_permission_keys,
        )
        if apply_changes and intent_summary["needs_confirmation"]:
            return Response(
                {
                    "detail": "Intent is ambiguous. Please run Preview AI and refine command before apply.",
                    "intent": intent_summary,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        matched_request_objects = []
        if request_references:
            matched_request_objects = list(
                ServiceRequest.objects.filter(request_number__in=request_references).order_by("-created_at")
            )
        else:
            filtered_qs = ServiceRequest.objects.select_related("source_entity", "target_entity", "company").all().order_by("-created_at")
            if status_filter:
                filtered_qs = filtered_qs.filter(status=status_filter)
            if priority_filter:
                filtered_qs = filtered_qs.filter(priority=priority_filter)
            if category_filter:
                filtered_qs = filtered_qs.filter(category__iexact=category_filter)
            if source_entity_filter:
                filtered_qs = filtered_qs.filter(
                    Q(source_entity__code__iexact=source_entity_filter)
                    | Q(source_entity__name__icontains=source_entity_filter)
                )
            if target_entity_filter:
                filtered_qs = filtered_qs.filter(
                    Q(target_entity__code__iexact=target_entity_filter)
                    | Q(target_entity__name__icontains=target_entity_filter)
                )
            if company_filter:
                filtered_qs = filtered_qs.filter(
                    Q(company__code__iexact=company_filter)
                    | Q(company__name__icontains=company_filter)
                )
            if search_text_filter:
                filtered_qs = filtered_qs.filter(
                    Q(request_number__icontains=search_text_filter)
                    | Q(title__icontains=search_text_filter)
                    | Q(description__icontains=search_text_filter)
                )
            matched_request_objects = list(filtered_qs[:5000])

        actor_controllable_map = self._build_current_effective_map(
            request.user,
            permission_key,
            matched_request_objects,
        )
        matched_request_objects = [
            item for item in matched_request_objects if actor_controllable_map.get(item.id, False)
        ]

        if not matched_request_objects:
            return Response(
                {
                    "detail": "AI could not resolve any matching requests from command.",
                    "intent": intent_summary,
                    "ai_output": parsed,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        matched_requests = [
            {
                "id": item.id,
                "request_number": item.request_number,
                "title": item.title,
                "status": item.status,
                "priority": item.priority,
            }
            for item in matched_request_objects
        ]
        matched_by_ref = {item["request_number"]: item for item in matched_requests}
        unmatched_references = [ref for ref in request_references if ref not in matched_by_ref] if request_references else []
        matched_ids = [item["id"] for item in matched_requests]

        current_effective_map = self._build_current_effective_map(
            target_user,
            permission_key,
            matched_request_objects,
        )
        target_allowed = action == "allow"
        change_plan = []
        will_change_count = 0
        for item in matched_requests:
            current_effective = bool(current_effective_map.get(item["id"], False))
            will_change = current_effective != target_allowed
            if will_change:
                will_change_count += 1
            change_plan.append(
                {
                    "id": item["id"],
                    "reference": item["request_number"],
                    "title": item["title"],
                    "status": item["status"],
                    "priority": item["priority"],
                    "current_effective": current_effective,
                    "target_effective": target_allowed,
                    "will_change": will_change,
                }
            )

        if apply_changes and matched_ids:
            with transaction.atomic():
                for request_id in matched_ids:
                    UserRequestPermissionOverride.objects.update_or_create(
                        user=target_user,
                        request_id=request_id,
                        permission_key=permission_key,
                        defaults={
                            "allowed": action == "allow",
                            "created_by": request.user,
                        },
                    )

        return Response(
            {
                "user": {"id": target_user.id, "username": target_user.username},
                "permission_key": permission_key,
                "action": action,
                "intent": intent_summary,
                "apply": apply_changes,
                "selection_mode": "references" if request_references else "filters",
                "resolved_filters": {
                    "status": status_filter or None,
                    "priority": priority_filter or None,
                    "category": category_filter or None,
                    "search_text": search_text_filter or None,
                    "source_entity": source_entity_filter or None,
                    "target_entity": target_entity_filter or None,
                    "company": company_filter or None,
                },
                "matched_requests": [
                    {
                        "id": item["id"],
                        "reference": item["request_number"],
                        "title": item["title"],
                        "status": item["status"],
                        "priority": item["priority"],
                    }
                    for item in matched_requests
                ],
                "change_plan": change_plan,
                "summary": {
                    "matched_count": len(matched_requests),
                    "will_change_count": will_change_count,
                    "unchanged_count": len(matched_requests) - will_change_count,
                },
                "unmatched_references": unmatched_references,
                "ai_output": parsed,
            },
            status=status.HTTP_200_OK,
        )
