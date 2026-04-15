from rest_framework import serializers

from apps.permissions_app.models import AppPermission, UserPermissionOverride, UserRole
from apps.roles.models import Role
from apps.users.models import User

from .services import ROLE_HIERARCHY, get_effective_permission_keys, get_permission_matrix_for_user


class RoleSummarySerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    level = serializers.IntegerField()


class ManageableUserListSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    max_role_level = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True)
    entity_name = serializers.CharField(source="entity.name", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "company_name",
            "entity_name",
            "roles",
            "max_role_level",
        ]

    def get_roles(self, obj):
        return [
            {
                "key": assignment.role.key,
                "name": assignment.role.name,
                "level": ROLE_HIERARCHY.get(assignment.role.key, 0),
            }
            for assignment in obj.assigned_roles.select_related("role").all()
        ]

    def get_max_role_level(self, obj):
        roles = [ROLE_HIERARCHY.get(item["key"], 0) for item in self.get_roles(obj)]
        return max(roles, default=0)


class UserPermissionAdminDetailSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    effective_permission_keys = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True)
    entity_name = serializers.CharField(source="entity.name", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "company",
            "company_name",
            "entity",
            "entity_name",
            "roles",
            "effective_permission_keys",
            "permissions",
        ]

    def get_roles(self, obj):
        return [
            {
                "key": assignment.role.key,
                "name": assignment.role.name,
                "level": ROLE_HIERARCHY.get(assignment.role.key, 0),
            }
            for assignment in obj.assigned_roles.select_related("role").all()
        ]

    def get_effective_permission_keys(self, obj):
        return get_effective_permission_keys(obj)

    def get_permissions(self, obj):
        return get_permission_matrix_for_user(obj)


class UserRoleUpdateSerializer(serializers.Serializer):
    role_keys = serializers.ListField(
        child=serializers.CharField(), allow_empty=True, required=True
    )

    def validate_role_keys(self, value):
        unique_keys = list(dict.fromkeys(value))
        roles = list(Role.objects.filter(key__in=unique_keys, is_active=True))
        if len(roles) != len(unique_keys):
            raise serializers.ValidationError("One or more role keys are invalid.")

        actor = self.context["request"].user
        actor_level = self.context["actor_level"]
        invalid_roles = [
            role.key
            for role in roles
            if ROLE_HIERARCHY.get(role.key, 0) >= actor_level
        ]
        if invalid_roles:
            raise serializers.ValidationError(
                f"You cannot assign roles at your level or higher: {', '.join(invalid_roles)}."
            )
        return unique_keys

    def save(self, **kwargs):
        user = self.context["target_user"]
        role_keys = self.validated_data["role_keys"]
        roles = list(Role.objects.filter(key__in=role_keys))

        UserRole.objects.filter(user=user).exclude(role__key__in=role_keys).delete()
        existing = set(
            UserRole.objects.filter(user=user).values_list("role__key", flat=True)
        )
        for role in roles:
            if role.key not in existing:
                UserRole.objects.create(user=user, role=role)
        return user


class UserPermissionOverrideSerializer(serializers.Serializer):
    permission_key = serializers.CharField()
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate_permission_key(self, value):
        if not AppPermission.objects.filter(key=value).exists():
            raise serializers.ValidationError("Invalid permission key.")
        return value

    def apply(self, user, is_allowed):
        permission = AppPermission.objects.get(key=self.validated_data["permission_key"])
        override, _ = UserPermissionOverride.objects.update_or_create(
            user=user,
            permission=permission,
            defaults={
                "is_allowed": is_allowed,
                "reason": self.validated_data.get("reason", ""),
            },
        )
        return override
