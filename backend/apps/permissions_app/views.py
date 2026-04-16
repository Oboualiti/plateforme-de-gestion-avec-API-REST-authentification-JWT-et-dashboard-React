from django.http import HttpResponse
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.entities.models import Entity
from apps.companies.models import Company
from apps.audit_logs.services import log_admin_action
from apps.permissions_app.models import UserRole
from apps.roles.models import Role
from apps.users.models import User

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
    can_manage_target_user,
    can_view_target_user,
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


class ManageableUserListView(BaseManageUsersView):
    def get(self, request):
        queryset = (
            get_visible_users_queryset(request.user)
            .select_related("company", "entity")
            .prefetch_related("assigned_roles__role")
        )
        data = {
            "scope": get_manage_scope(request.user),
            "current_entity_name": getattr(request.user.entity, "name", ""),
            "current_user_level": get_user_max_role_level(request.user),
            "current_user_roles": [
                {
                    "key": role_key,
                    "level": ROLE_HIERARCHY.get(role_key, 0),
                }
                for role_key in request.user.assigned_roles.values_list("role__key", flat=True)
            ],
            "effective_permission_keys": get_effective_permission_keys(request.user),
            "results": ManageableUserListSerializer(
                queryset,
                many=True,
                context={"actor_level": get_user_max_role_level(request.user)},
            ).data,
        }
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
        actor_level = get_user_max_role_level(actor)
        role_options = [
            {"key": key, "name": key.replace("_", " ").title(), "level": level}
            for key, level in ROLE_HIERARCHY.items()
            if level < actor_level
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
        return Response(
            {
                "role_options": role_options,
                "company_options": companies,
                "entity_options": entities,
                "team_leader_options": team_leaders,
            }
        )


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
            payload = item["payload"]
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
            if level < actor_level
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
        return Response(self.build_payload(request, target))


class ManageUserPermissionOverrideView(BaseManageUsersView):
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
            if level < actor_level
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
