from rest_framework import serializers

from apps.audit_logs.models import AdminAuditLog
from apps.companies.models import Company
from apps.entities.models import Entity
from apps.notifications.models import NotificationPreference
from apps.permissions_app.models import AppPermission
from apps.permissions_app.services import (
    ROLE_HIERARCHY,
    get_effective_permission_keys,
    get_permission_matrix_for_user,
    get_primary_role_key,
)
from apps.requests_app.models import RequestAssignmentHistory, RequestStatusHistory, ServiceRequest
from apps.roles.models import Role
from apps.users.models import User


class CompanyAdminSerializer(serializers.ModelSerializer):
    entity_count = serializers.IntegerField(read_only=True)
    user_count = serializers.IntegerField(read_only=True)
    senior_name = serializers.CharField(read_only=True)

    class Meta:
        model = Company
        fields = ["id", "name", "code", "is_active", "entity_count", "user_count", "senior_name", "created_at"]


class CompanyWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ["name", "code", "is_active"]


class EntityAdminSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    user_count = serializers.IntegerField(read_only=True)
    manager_name = serializers.CharField(read_only=True)

    class Meta:
        model = Entity
        fields = [
            "id",
            "name",
            "code",
            "entity_type",
            "is_active",
            "company",
            "company_name",
            "user_count",
            "manager_name",
            "created_at",
        ]


class EntityWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Entity
        fields = ["name", "code", "entity_type", "company", "is_active"]


class RoleAdminSerializer(serializers.ModelSerializer):
    level = serializers.SerializerMethodField()
    default_permissions = serializers.SerializerMethodField()
    user_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Role
        fields = ["id", "key", "name", "description", "is_active", "level", "default_permissions", "user_count"]

    def get_level(self, obj):
        return ROLE_HIERARCHY.get(obj.key, 0)

    def get_default_permissions(self, obj):
        return sorted(obj.role_permissions.values_list("permission__key", flat=True))


class RolePermissionMappingSerializer(serializers.Serializer):
    permission_keys = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    company_id = serializers.IntegerField(required=False, allow_null=True)
    entity_id = serializers.IntegerField(required=False, allow_null=True)
    entity_type = serializers.ChoiceField(
        required=False,
        allow_null=True,
        choices=[Entity.EntityType.PROD, Entity.EntityType.SUPPORT, Entity.EntityType.TDEV],
    )


class RoleScopeSerializer(serializers.Serializer):
    company_id = serializers.IntegerField(required=False, allow_null=True)
    entity_id = serializers.IntegerField(required=False, allow_null=True)
    entity_type = serializers.ChoiceField(
        required=False,
        allow_null=True,
        choices=[Entity.EntityType.PROD, Entity.EntityType.SUPPORT, Entity.EntityType.TDEV],
    )


class DelegationRuleWriteSerializer(serializers.Serializer):
    permission_keys = serializers.ListField(child=serializers.CharField(), allow_empty=True)

    def validate_permission_keys(self, value):
        found = set(AppPermission.objects.filter(key__in=value).values_list("key", flat=True))
        missing = sorted(set(value) - found)
        if missing:
            raise serializers.ValidationError(f"Unknown permission keys: {', '.join(missing)}")
        return list(dict.fromkeys(value))


class HierarchyAssignmentSerializer(serializers.Serializer):
    senior_user_id = serializers.IntegerField(required=False, allow_null=True)
    manager_user_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        company = self.context.get("company")
        entity = self.context.get("entity")
        senior_user_id = attrs.get("senior_user_id", serializers.empty)
        manager_user_id = attrs.get("manager_user_id", serializers.empty)

        if senior_user_id is not serializers.empty and senior_user_id is not None:
            senior = User.objects.filter(id=senior_user_id, company_id=company.id).first()
            if senior is None or get_primary_role_key(senior) != "senior":
                raise serializers.ValidationError({"senior_user_id": "Selected user must be a Senior in this company."})

        if entity and manager_user_id is not serializers.empty and manager_user_id is not None:
            manager = User.objects.filter(id=manager_user_id, company_id=entity.company_id).first()
            if manager is None or get_primary_role_key(manager) != "manager":
                raise serializers.ValidationError({"manager_user_id": "Selected user must be a Manager in this company."})
        return attrs


class PermissionCatalogSerializer(serializers.ModelSerializer):
    inherited_by_roles = serializers.SerializerMethodField()
    overridden_users = serializers.SerializerMethodField()

    class Meta:
        model = AppPermission
        fields = ["id", "key", "name", "description", "category", "inherited_by_roles", "overridden_users"]

    def get_inherited_by_roles(self, obj):
        return sorted(obj.permission_roles.values_list("role__key", flat=True))

    def get_overridden_users(self, obj):
        return list(
            obj.user_overrides.select_related("user")
            .values("user_id", "user__username", "is_allowed")
            .order_by("user__username")
        )


class EffectivePermissionUserSerializer(serializers.ModelSerializer):
    role_key = serializers.SerializerMethodField()
    effective_permission_keys = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "role_key", "effective_permission_keys", "permissions"]

    def get_role_key(self, obj):
        return get_primary_role_key(obj)

    def get_effective_permission_keys(self, obj):
        return get_effective_permission_keys(obj)

    def get_permissions(self, obj):
        return get_permission_matrix_for_user(obj)


class RequestAdminSummarySerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    source_entity_name = serializers.CharField(source="source_entity.name", read_only=True)
    target_entity_name = serializers.CharField(source="target_entity.name", read_only=True)
    requester_name = serializers.CharField(source="requester_user.username", read_only=True)
    assignee_name = serializers.CharField(source="current_assignee.username", read_only=True)

    class Meta:
        model = ServiceRequest
        fields = [
            "id",
            "request_number",
            "title",
            "category",
            "status",
            "priority",
            "company_id",
            "company_name",
            "source_entity_name",
            "target_entity_name",
            "requester_name",
            "assignee_name",
            "created_at",
            "accepted_at",
            "completed_at",
            "closed_at",
        ]


class RequestAdminUpdateSerializer(serializers.Serializer):
    target_entity_id = serializers.IntegerField(required=False)
    status = serializers.ChoiceField(required=False, choices=ServiceRequest.Status.choices)
    current_assignee_id = serializers.IntegerField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True)


class AssignmentHistorySerializer(serializers.ModelSerializer):
    request_number = serializers.CharField(source="request.request_number", read_only=True)
    request_title = serializers.CharField(source="request.title", read_only=True)
    assigned_by_name = serializers.CharField(source="assigned_by.username", read_only=True)
    assignee_name = serializers.CharField(source="assignee.username", read_only=True)

    class Meta:
        model = RequestAssignmentHistory
        fields = ["id", "request_number", "request_title", "assigned_by_name", "assignee_name", "note", "created_at"]


class StatusTrackingSerializer(serializers.ModelSerializer):
    request_number = serializers.CharField(source="request.request_number", read_only=True)
    request_title = serializers.CharField(source="request.title", read_only=True)
    changed_by_name = serializers.CharField(source="changed_by.username", read_only=True)

    class Meta:
        model = RequestStatusHistory
        fields = ["id", "request_number", "request_title", "old_status", "new_status", "note", "changed_by_name", "changed_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = AdminAuditLog
        fields = ["id", "module", "action", "target_model", "target_id", "target_label", "metadata", "actor_name", "created_at"]


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = ["id", "event_key", "label", "email_enabled", "in_app_enabled", "telegram_enabled", "is_active", "notes"]
