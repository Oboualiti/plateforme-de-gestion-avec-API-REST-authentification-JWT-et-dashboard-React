from rest_framework import serializers

from apps.entities.models import Entity
from apps.permissions_app.services import get_effective_permission_keys, get_user_role_keys

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
        return bool(
            obj.company_id
            and obj.entity_id
            and obj.entity.entity_type == Entity.EntityType.PROD
        )
