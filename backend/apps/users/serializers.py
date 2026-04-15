from rest_framework import serializers

from .models import User


class UserMeSerializer(serializers.ModelSerializer):
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
            "job_title",
            "phone_number",
            "company",
            "company_name",
            "entity",
            "entity_name",
            "is_staff",
        ]
