from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User

from .serializers import (
    ManageableUserListSerializer,
    UserPermissionAdminDetailSerializer,
    UserPermissionOverrideSerializer,
    UserRoleUpdateSerializer,
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
        return Response(
            self.build_payload(request, target),
            status=status.HTTP_200_OK,
        )
