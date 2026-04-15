from rest_framework import serializers

from apps.permissions_app.services import get_user_role_keys

from .models import (
    MainBranch,
    OperationalUnit,
    RequestMessage,
    RequestStatusHistory,
    ServiceRequest,
    UnitMembership,
)


class MainBranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = MainBranch
        fields = "__all__"


class OperationalUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = OperationalUnit
        fields = "__all__"


class UnitMembershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitMembership
        fields = "__all__"


class ServiceRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceRequest
        fields = "__all__"


class RequestStatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = RequestStatusHistory
        fields = "__all__"


class RequestMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequestMessage
        fields = "__all__"


class RequestSummarySerializer(serializers.ModelSerializer):
    type = serializers.CharField(source="category", read_only=True)
    target_team_name = serializers.CharField(source="target_unit.name", read_only=True)

    class Meta:
        model = ServiceRequest
        fields = [
            "id",
            "request_number",
            "title",
            "type",
            "status",
            "priority",
            "created_at",
            "target_unit",
            "target_team_name",
        ]


class RequestCommentSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.username", read_only=True)

    class Meta:
        model = RequestMessage
        fields = ["id", "sender", "sender_name", "message", "created_at"]


class RequestHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.username", read_only=True)

    class Meta:
        model = RequestStatusHistory
        fields = [
            "id",
            "old_status",
            "new_status",
            "note",
            "changed_at",
            "changed_by",
            "changed_by_name",
        ]


class RequestDetailSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source="category", read_only=True)
    target_team_name = serializers.CharField(source="target_unit.name", read_only=True)
    requester_name = serializers.CharField(source="requester_user.username", read_only=True)
    current_assignee_name = serializers.CharField(
        source="current_assignee.username", read_only=True
    )
    comments = RequestCommentSerializer(source="messages", many=True, read_only=True)
    status_history = RequestHistorySerializer(many=True, read_only=True)
    role_keys = serializers.SerializerMethodField()

    class Meta:
        model = ServiceRequest
        fields = [
            "id",
            "request_number",
            "title",
            "description",
            "type",
            "status",
            "priority",
            "created_at",
            "accepted_at",
            "completed_at",
            "closed_at",
            "target_unit",
            "target_team_name",
            "requester_user",
            "requester_name",
            "current_assignee",
            "current_assignee_name",
            "comments",
            "status_history",
            "role_keys",
        ]

    def get_role_keys(self, obj):
        request = self.context.get("request")
        if not request:
            return []
        return get_user_role_keys(request.user)


class RequestCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    description = serializers.CharField()
    type = serializers.CharField(max_length=100)
    target_team = serializers.IntegerField()
    priority = serializers.ChoiceField(choices=ServiceRequest.Priority.choices)


class RequestCommentCreateSerializer(serializers.Serializer):
    message = serializers.CharField()


class RequestStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ServiceRequest.Status.choices)
    note = serializers.CharField(required=False, allow_blank=True)
