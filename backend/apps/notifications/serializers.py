from rest_framework import serializers

from .models import UserNotification


class UserNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserNotification
        fields = [
            "id",
            "event_type",
            "title",
            "message",
            "link",
            "metadata",
            "is_read",
            "read_at",
            "created_at",
        ]
