from django.db.models import Q
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
from apps.permissions_app.models import AppPermission, UserPermissionOverride, UserRole
from apps.roles.models import Role
from apps.users.models import User
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
    can_view_any_users,
    can_manage_target_user,
    can_view_target_user,
    has_permission,
    get_delegatable_permission_keys,
    get_effective_permission_keys,
    get_manage_scope,
    get_user_max_role_level,
    get_visible_users_queryset,
)


class BaseManageUsersView(APIView):
    permission_classes = [IsAuthenticated]

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
            context={"actor_level": actor_level},
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
            user, context={"actor_level": get_user_max_role_level(request.user)}
        ).data
        return Response(payload, status=status.HTTP_201_CREATED)


class ManageableUserFormOptionsView(BaseManageUsersView):
    def get(self, request):
        actor = request.user
        cache_key = (
            f"users:manageable:options:{actor.id}:"
            f"{actor.company_id}:{actor.entity_id}:{','.join(sorted(actor.assigned_roles.values_list('role__key', flat=True)))}"
        )
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

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
        cache.set(cache_key, payload, timeout=600)
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
            user, context={"actor_level": get_user_max_role_level(request.user)}
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
                    user, context={"actor_level": actor_level}
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
    def build_payload(self, request, target):
        actor_level = get_user_max_role_level(request.user)
        can_edit = can_manage_target_user(request.user, target)
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
            target, context={"editor_user": request.user}
        ).data
        payload["available_roles"] = available_roles if can_edit else []
        payload["can_edit"] = can_edit
        payload["delegatable_permission_keys"] = delegatable_permission_keys
        return payload

    def get(self, request, user_id):
        target = self.get_target_user(user_id)
        self.ensure_viewable(request, target)
        return Response(self.build_payload(request, target))

    def patch(self, request, user_id):
        target = self.get_target_user(user_id)
        self.ensure_manageable(request, target)
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
            target, context={"editor_user": request.user}
        ).data
        payload["available_roles"] = available_roles if can_edit else []
        payload["can_edit"] = can_edit
        payload["delegatable_permission_keys"] = delegatable_permission_keys
        return payload

    def post(self, request, user_id):
        target = self.get_target_user(user_id)
        self.ensure_manageable(request, target)
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
        return Response(
            self.build_payload(request, target),
            status=status.HTTP_200_OK,
        )

    def delete(self, request, user_id):
        target = self.get_target_user(user_id)
        self.ensure_manageable(request, target)
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
        log_admin_action(
            actor=request.user,
            module="permissions",
            action="deny_override",
            target_model="User",
            target_id=target.id,
            target_label=target.username,
            metadata={"permission_key": serializer.validated_data["permission_key"]},
        )
        return Response(
            self.build_payload(request, target),
            status=status.HTTP_200_OK,
        )
