from rest_framework import serializers

from apps.permissions_app.models import AppPermission, UserPermissionOverride, UserRole
from apps.roles.models import Role
from apps.users.models import User

from .services import (
    ROLE_HIERARCHY,
    get_effective_permission_keys,
    get_primary_role_key,
    get_permission_matrix_for_user,
)


class RoleSummarySerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    level = serializers.IntegerField()


class ManageableUserListSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    max_role_level = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True)
    entity_name = serializers.CharField(source="entity.name", read_only=True)
    entity_type = serializers.CharField(source="entity.entity_type", read_only=True)
    entity_label = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "company_name",
            "entity_name",
            "entity_type",
            "entity_label",
            "roles",
            "max_role_level",
            "can_edit",
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

    def get_can_edit(self, obj):
        actor_level = self.context.get("actor_level", 0)
        return self.get_max_role_level(obj) < actor_level

    def get_entity_label(self, obj):
        if not obj.entity:
            return ""
        return f"{obj.entity.name} ({obj.entity.get_entity_type_display()})"


class UserPermissionAdminDetailSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    effective_permission_keys = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True)
    entity_name = serializers.CharField(source="entity.name", read_only=True)
    entity_type = serializers.CharField(source="entity.entity_type", read_only=True)
    entity_label = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "company",
            "company_name",
            "entity",
            "entity_name",
            "entity_type",
            "entity_label",
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
        editor_user = self.context.get("editor_user")
        return get_permission_matrix_for_user(obj, editor_user=editor_user)

    def get_entity_label(self, obj):
        if not obj.entity:
            return ""
        return f"{obj.entity.name} ({obj.entity.get_entity_type_display()})"


class UserRoleUpdateSerializer(serializers.Serializer):
    role_keys = serializers.ListField(
        child=serializers.CharField(), allow_empty=True, required=True
    )

    def validate_role_keys(self, value):
        unique_keys = list(dict.fromkeys(value))
        if len(unique_keys) != 1:
            raise serializers.ValidationError("Exactly one role must be assigned.")

        roles = list(Role.objects.filter(key__in=unique_keys, is_active=True))
        if len(roles) != len(unique_keys):
            raise serializers.ValidationError("One or more role keys are invalid.")
        if any(role.key not in ROLE_HIERARCHY for role in roles):
            raise serializers.ValidationError("One or more role keys are not assignable.")

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

        target_user = self.context["target_user"]
        actor = self.context["request"].user
        actor_role_key = get_primary_role_key(actor)
        role_key = unique_keys[0]

        # Role scope validations:
        # - super_admin: global, no company/entity requirement
        # - senior: must be attached to exactly one company (entity optional)
        # - manager/team_leader/user: must be attached to one company + one entity
        if role_key == "senior" and not target_user.company_id:
            raise serializers.ValidationError(
                "Senior must belong to a single company."
            )

        if role_key in {"manager", "team_leader", "user"}:
            if not target_user.company_id:
                raise serializers.ValidationError(
                    f"{role_key.replace('_', ' ').title()} must belong to a company."
                )
            if not target_user.entity_id:
                raise serializers.ValidationError(
                    f"{role_key.replace('_', ' ').title()} must belong to a single entity."
                )

        if target_user.company_id and target_user.entity_id:
            if target_user.entity.company_id != target_user.company_id:
                raise serializers.ValidationError(
                    "User company and entity must match."
                )

        if role_key == "user" and target_user.team_leader_id:
            if target_user.team_leader.company_id != target_user.company_id:
                raise serializers.ValidationError(
                    "User and Team Leader must belong to the same company."
                )
            if target_user.team_leader.entity_id != target_user.entity_id:
                raise serializers.ValidationError(
                    "User and Team Leader must belong to the same entity."
                )
            if not UserRole.objects.filter(
                user_id=target_user.team_leader_id, role__key="team_leader"
            ).exists():
                raise serializers.ValidationError(
                    "Assigned Team Leader must have Team Leader role."
                )
        if role_key == "user" and not target_user.team_leader_id and actor_role_key != "team_leader":
            raise serializers.ValidationError(
                "User must be assigned to a Team Leader from the same company and entity."
            )

        if unique_keys[0] == "senior" and target_user.company_id:
            senior_role = Role.objects.filter(key="senior").first()
            if senior_role is not None:
                senior_exists = UserRole.objects.filter(
                    role=senior_role,
                    user__company_id=target_user.company_id,
                ).exclude(user_id=target_user.id).exists()
                if senior_exists:
                    raise serializers.ValidationError(
                        "Each company can have exactly one Senior."
                    )
        return unique_keys

    def save(self, **kwargs):
        user = self.context["target_user"]
        actor = self.context["request"].user
        actor_role_key = get_primary_role_key(actor)
        role_keys = self.validated_data["role_keys"]
        role = Role.objects.get(key=role_keys[0])

        if role.key == "user" and actor_role_key == "team_leader" and user.team_leader_id is None:
            user.team_leader = actor
            user.save(update_fields=["team_leader"])

        if role.key != "user" and user.team_leader_id is not None:
            user.team_leader = None
            user.save(update_fields=["team_leader"])

        UserRole.objects.filter(user=user).delete()
        UserRole.objects.create(user=user, role=role)
        return user


class UserPermissionOverrideSerializer(serializers.Serializer):
    permission_key = serializers.CharField()
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate_permission_key(self, value):
        if not AppPermission.objects.filter(key=value).exists():
            raise serializers.ValidationError("Invalid permission key.")
        delegatable_permission_keys = set(
            self.context.get("delegatable_permission_keys", [])
        )
        if value not in delegatable_permission_keys:
            raise serializers.ValidationError(
                "You cannot delegate this permission."
            )
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
