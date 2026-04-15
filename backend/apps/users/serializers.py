from rest_framework import serializers

from apps.permissions_app.services import get_effective_permission_keys, get_user_role_keys

from .models import User


class UserMeSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    entity_name = serializers.CharField(source="entity.name", read_only=True)
    entity_type = serializers.CharField(source="entity.entity_type", read_only=True)
    entity_label = serializers.SerializerMethodField()
    role_keys = serializers.SerializerMethodField()
    effective_permission_keys = serializers.SerializerMethodField()

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
        ]

    def get_role_keys(self, obj):
        return get_user_role_keys(obj)

    def get_effective_permission_keys(self, obj):
        return get_effective_permission_keys(obj)

    def get_entity_label(self, obj):
        if not obj.entity:
            return ""
        return f"{obj.entity.name} ({obj.entity.get_entity_type_display()})"
