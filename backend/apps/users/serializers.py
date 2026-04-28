from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password

from apps.entities.models import Entity
from apps.permissions_app.services import (
    can_create_requests,
    get_effective_permission_keys,
    get_user_role_keys,
)

from .models import User


class UserMeSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    entity_name = serializers.CharField(source="entity.name", read_only=True)
    entity_type = serializers.CharField(source="entity.entity_type", read_only=True)
    entity_label = serializers.SerializerMethodField()
    role_keys = serializers.SerializerMethodField()
    effective_permission_keys = serializers.SerializerMethodField()
    source_entity = serializers.SerializerMethodField()
    available_target_teams = serializers.SerializerMethodField()
    request_creation_allowed = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "job_title",
            "phone_number",
            "theme_preference",
            "company",
            "company_name",
            "entity",
            "entity_name",
            "entity_type",
            "entity_label",
            "is_staff",
            "role_keys",
            "effective_permission_keys",
            "source_entity",
            "available_target_teams",
            "request_creation_allowed",
        ]

    def get_role_keys(self, obj):
        return get_user_role_keys(obj)

    def get_effective_permission_keys(self, obj):
        return get_effective_permission_keys(obj)

    def get_entity_label(self, obj):
        if not obj.entity:
            return ""
        return f"{obj.entity.name} ({obj.entity.get_entity_type_display()})"

    def get_source_entity(self, obj):
        if not obj.entity:
            return None
        return {
            "id": obj.entity.id,
            "name": obj.entity.name,
            "code": obj.entity.code,
            "entity_type": obj.entity.entity_type,
            "label": f"{obj.entity.name} ({obj.entity.get_entity_type_display()})",
        }

    def get_available_target_teams(self, obj):
        if not obj.company_id:
            return []
        return [
            {
                "id": entity.id,
                "name": entity.name,
                "code": entity.code,
                "entity_type": entity.entity_type,
                "label": f"{entity.name} ({entity.get_entity_type_display()})",
            }
            for entity in Entity.objects.filter(company_id=obj.company_id, is_active=True)
            .exclude(entity_type=Entity.EntityType.PROD)
            .order_by("name")
        ]

    def get_request_creation_allowed(self, obj):
        return can_create_requests(obj)


class UserThemePreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["theme_preference"]


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField()
    confirm_password = serializers.CharField()

    def validate(self, attrs):
        user = self.context["request"].user
        current_password = attrs.get("current_password", "")
        new_password = attrs.get("new_password", "")
        confirm_password = attrs.get("confirm_password", "")

        if not user.check_password(current_password):
            raise serializers.ValidationError({"current_password": "Current password is incorrect."})
        if new_password != confirm_password:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        if current_password == new_password:
            raise serializers.ValidationError({"new_password": "New password must be different from current password."})

        validate_password(new_password, user=user)
        return attrs
