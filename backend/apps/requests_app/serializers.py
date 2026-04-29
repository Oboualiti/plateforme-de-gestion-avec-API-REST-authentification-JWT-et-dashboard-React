from rest_framework import serializers
from apps.permissions_app.services import get_user_role_keys, get_primary_role_key

from .models import (
    MainBranch,
    OperationalUnit,
    RequestAssignmentHistory,
    RequestMessage,
    RequestStatusHistory,
    RequestTeamReassignmentHistory,
    ServiceRequest,
    UnitMembership,
)

REQUEST_TYPE_CHOICES = [
    ("INFO", "Info"),
    ("SCRIPT", "Script"),
    ("TOOL", "Tool"),
    ("APP_PROJECT", "App/Project"),
    ("OTHER", "Other"),
]

REQUEST_CREATE_PRIORITY_CHOICES = [
    (ServiceRequest.Priority.HIGH, "High"),
    (ServiceRequest.Priority.MEDIUM, "Medium"),
    (ServiceRequest.Priority.LOW, "Low"),
]


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


class RequestAssignmentHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = RequestAssignmentHistory
        fields = "__all__"


class RequestMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequestMessage
        fields = "__all__"


class RequestSummarySerializer(serializers.ModelSerializer):
    reference_code = serializers.CharField(source="request_number", read_only=True)
    type = serializers.CharField(source="category", read_only=True)
    target_entity_name = serializers.SerializerMethodField()
    source_entity_name = serializers.SerializerMethodField()
    creator_name = serializers.CharField(source="requester_user.username", read_only=True)
    assignee_name = serializers.CharField(
        source="current_assignee.username", read_only=True
    )
    company_name = serializers.SerializerMethodField()
    is_stuck = serializers.SerializerMethodField()
    assignee_role = serializers.SerializerMethodField()
    is_submitted_to_target = serializers.BooleanField(read_only=True)
    is_pending_approval = serializers.SerializerMethodField()
    priority_label = serializers.SerializerMethodField()

    class Meta:
        model = ServiceRequest
        fields = [
            "id",
            "request_number",
            "reference_code",
            "title",
            "type",
            "priority",
            "priority_label",
            "status",
            "created_at",
            "deadline_date",
            "completed_at",
            "closed_at",
            "company_name",
            "source_entity_name",
            "target_entity_name",
            "creator_name",
            "assignee_name",
            "assignee_role",
            "target_unit",
            "is_stuck",
            "is_submitted_to_target",
            "is_pending_approval",
        ]

    def get_source_entity_name(self, obj):
        return obj.source_entity.name if obj.source_entity_id else obj.requester_unit.name

    def get_target_entity_name(self, obj):
        return obj.target_entity.name if obj.target_entity_id else obj.target_unit.name

    def get_assignee_role(self, obj):
        if not obj.current_assignee_id:
            return ""
        return get_primary_role_key(obj.current_assignee)

    def get_company_name(self, obj):
        if obj.company_id:
            return obj.company.name
        if obj.requester_user.company_id:
            return obj.requester_user.company.name
        return ""

    def get_is_stuck(self, obj):
        return bool(getattr(obj, "is_stuck", False))

    def get_is_pending_approval(self, obj):
        return (not obj.is_submitted_to_target) and obj.status == ServiceRequest.Status.NEW

    def get_priority_label(self, obj):
        return obj.get_priority_display()


class RequestCommentSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.username", read_only=True)
    sender_username = serializers.CharField(source="sender.username", read_only=True)
    sender_role_keys = serializers.SerializerMethodField()
    sender_entity_name = serializers.CharField(source="sender.entity.name", read_only=True)
    sender_entity_type = serializers.CharField(
        source="sender.entity.entity_type", read_only=True
    )
    attachment = serializers.FileField(read_only=True)
    attachment_url = serializers.SerializerMethodField()
    sender_avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = RequestMessage
        fields = [
            "id",
            "sender",
            "sender_name",
            "sender_username",
            "sender_role_keys",
            "sender_entity_name",
            "sender_entity_type",
            "sender_avatar_url",
            "message",
            "attachment",
            "attachment_url",
            "created_at",
        ]

    def get_sender_role_keys(self, obj):
        return get_user_role_keys(obj.sender)

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.attachment.url)
        return obj.attachment.url

    def get_sender_avatar_url(self, obj):
        if not obj.sender.avatar:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.sender.avatar.url)
        return obj.sender.avatar.url


class RequestHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.username", read_only=True)
    changed_by_role_keys = serializers.SerializerMethodField()
    changed_by_entity_name = serializers.CharField(
        source="changed_by.entity.name", read_only=True
    )

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
            "changed_by_role_keys",
            "changed_by_entity_name",
        ]

    def get_changed_by_role_keys(self, obj):
        return get_user_role_keys(obj.changed_by)


class RequestAssignmentEventSerializer(serializers.ModelSerializer):
    assigned_by_name = serializers.CharField(source="assigned_by.username", read_only=True)
    assigned_by_entity_name = serializers.CharField(
        source="assigned_by.entity.name", read_only=True
    )
    assignee_name = serializers.CharField(source="assignee.username", read_only=True)
    assignee_role_keys = serializers.SerializerMethodField()

    class Meta:
        model = RequestAssignmentHistory
        fields = [
            "id",
            "assigned_by",
            "assigned_by_name",
            "assigned_by_entity_name",
            "assignee",
            "assignee_name",
            "assignee_role_keys",
            "note",
            "created_at",
        ]

    def get_assignee_role_keys(self, obj):
        return get_user_role_keys(obj.assignee)


class RequestTeamReassignmentEventSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.username", read_only=True)
    changed_by_role_keys = serializers.SerializerMethodField()
    old_target_entity_name = serializers.CharField(
        source="old_target_entity.name", read_only=True
    )
    new_target_entity_name = serializers.CharField(
        source="new_target_entity.name", read_only=True
    )

    class Meta:
        model = RequestTeamReassignmentHistory
        fields = [
            "id",
            "old_target_entity",
            "old_target_entity_name",
            "new_target_entity",
            "new_target_entity_name",
            "changed_by",
            "changed_by_name",
            "changed_by_role_keys",
            "note",
            "created_at",
        ]

    def get_changed_by_role_keys(self, obj):
        return get_user_role_keys(obj.changed_by)


class RequestDetailSerializer(serializers.ModelSerializer):
    reference_code = serializers.CharField(source="request_number", read_only=True)
    type = serializers.CharField(source="category", read_only=True)
    target_entity_name = serializers.SerializerMethodField()
    source_entity_name = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()
    requester_name = serializers.CharField(source="requester_user.username", read_only=True)
    assignee_name = serializers.CharField(
        source="current_assignee.username", read_only=True
    )
    requester_avatar_url = serializers.SerializerMethodField()
    assignee_avatar_url = serializers.SerializerMethodField()
    attachment = serializers.FileField(read_only=True)
    attachment_url = serializers.SerializerMethodField()
    comments = serializers.SerializerMethodField()
    status_history = RequestHistorySerializer(many=True, read_only=True)
    assignment_history = RequestAssignmentEventSerializer(many=True, read_only=True)
    team_reassignment_history = RequestTeamReassignmentEventSerializer(
        many=True, read_only=True
    )
    role_keys = serializers.SerializerMethodField()
    can_assign_to_me = serializers.SerializerMethodField()
    can_update_status = serializers.SerializerMethodField()
    allowed_status_transitions = serializers.SerializerMethodField()
    can_reassign_target_team = serializers.SerializerMethodField()
    can_view_request_discussion = serializers.SerializerMethodField()
    available_reassignment_targets = serializers.SerializerMethodField()
    potential_assignees = serializers.SerializerMethodField()
    is_stuck = serializers.SerializerMethodField()
    is_submitted_to_target = serializers.BooleanField(read_only=True)
    is_pending_approval = serializers.SerializerMethodField()
    can_edit_deadline = serializers.SerializerMethodField()
    activity_timeline = serializers.SerializerMethodField()
    priority_label = serializers.SerializerMethodField()

    class Meta:
        model = ServiceRequest
        fields = [
            "id",
            "request_number",
            "reference_code",
            "title",
            "description",
            "attachment",
            "attachment_url",
            "type",
            "priority",
            "priority_label",
            "status",
            "created_at",
            "accepted_at",
            "completed_at",
            "closed_at",
            "deadline_date",
            "resolution_note",
            "company",
            "company_name",
            "source_entity",
            "source_entity_name",
            "target_entity",
            "target_unit",
            "target_entity_name",
            "requester_user",
            "requester_name",
            "requester_avatar_url",
            "current_assignee",
            "assignee_name",
            "assignee_avatar_url",
            "comments",
            "status_history",
            "assignment_history",
            "team_reassignment_history",
            "activity_timeline",
            "role_keys",
            "can_assign_to_me",
            "can_update_status",
            "allowed_status_transitions",
            "can_reassign_target_team",
            "can_view_request_discussion",
            "available_reassignment_targets",
            "potential_assignees",
            "is_stuck",
            "is_submitted_to_target",
            "is_pending_approval",
            "can_edit_deadline",
        ]

    def get_role_keys(self, obj):
        request = self.context.get("request")
        if not request:
            return []
        return get_user_role_keys(request.user)

    def get_source_entity_name(self, obj):
        return obj.source_entity.name if obj.source_entity_id else obj.requester_unit.name

    def get_target_entity_name(self, obj):
        return obj.target_entity.name if obj.target_entity_id else obj.target_unit.name

    def get_company_name(self, obj):
        if obj.company_id:
            return obj.company.name
        if obj.requester_user.company_id:
            return obj.requester_user.company.name
        return ""

    def get_can_assign_to_me(self, obj):
        request = self.context.get("request")
        can_assign_request = self.context.get("can_assign_request")
        if not request or not can_assign_request:
            return False
        if get_primary_role_key(request.user) == "senior":
            return False
        return obj.current_assignee_id is None

    def get_can_update_status(self, obj):
        return bool(self.context.get("can_manage_incoming_request"))

    def get_allowed_status_transitions(self, obj):
        return self.context.get("allowed_status_transitions") or []

    def get_can_reassign_target_team(self, obj):
        return bool(self.context.get("can_reassign_target_team"))

    def get_can_view_request_discussion(self, obj):
        return bool(self.context.get("can_view_request_discussion"))

    def get_comments(self, obj):
        if not self.context.get("can_view_request_discussion"):
            return []
        serializer = RequestCommentSerializer(
            obj.messages.all(),
            many=True,
            context=self.context,
        )
        return serializer.data

    def get_available_reassignment_targets(self, obj):
        targets = self.context.get("available_reassignment_targets") or []
        return targets

    def get_potential_assignees(self, obj):
        return self.context.get("potential_assignees") or []

    def get_is_stuck(self, obj):
        return bool(getattr(obj, "is_stuck", False))

    def get_is_pending_approval(self, obj):
        return (not obj.is_submitted_to_target) and obj.status == ServiceRequest.Status.NEW

    def get_can_edit_deadline(self, obj):
        return bool(self.context.get("can_edit_deadline"))

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.attachment.url)
        return obj.attachment.url

    def get_priority_label(self, obj):
        return obj.get_priority_display()

    def get_activity_timeline(self, obj):
        events = [
            {
                "kind": "created",
                "timestamp": obj.created_at,
                "title": "Request created",
                "description": f"{obj.requester_user.username} created {obj.request_number}.",
            }
        ]

        if obj.is_submitted_to_target:
            events.append(
                {
                    "kind": "sent",
                    "timestamp": obj.created_at,
                    "title": "Sent to target team",
                    "description": f"Sent from {self.get_source_entity_name(obj)} to {self.get_target_entity_name(obj)}.",
                }
            )

        for item in obj.assignment_history.all():
            events.append(
                {
                    "kind": "assignment",
                    "timestamp": item.created_at,
                    "title": "Assigned",
                    "description": f"{item.assigned_by.username} assigned the request to {item.assignee.username}.",
                    "note": item.note,
                }
            )

        for item in obj.team_reassignment_history.all():
            events.append(
                {
                    "kind": "reassignment",
                    "timestamp": item.created_at,
                    "title": "Target team changed",
                    "description": (
                        f"{item.changed_by.username} reassigned target team from "
                        f"{item.old_target_entity.name} to {item.new_target_entity.name}."
                    ),
                    "note": item.note,
                }
            )

        for item in obj.status_history.all():
            title = "Status changed"
            if item.new_status in {
                ServiceRequest.Status.COMPLETED,
                ServiceRequest.Status.CLOSED,
            }:
                title = "Resolved"
            elif item.new_status == ServiceRequest.Status.REJECTED:
                title = "Rejected"
            events.append(
                {
                    "kind": "status",
                    "timestamp": item.changed_at,
                    "title": title,
                    "description": f"{item.changed_by.username} changed status from {item.old_status} to {item.new_status}.",
                    "note": item.note,
                }
            )

        if self.context.get("can_view_request_discussion"):
            for item in obj.messages.all():
                events.append(
                    {
                        "kind": "comment",
                        "timestamp": item.created_at,
                        "title": "Comment added",
                        "description": f"{item.sender.username} commented from {item.sender.entity.name if item.sender.entity_id else 'Unknown entity'}.",
                        "note": item.message,
                    }
                )

        return sorted(events, key=lambda event: event["timestamp"], reverse=True)

    def get_requester_avatar_url(self, obj):
        if not obj.requester_user.avatar:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.requester_user.avatar.url)
        return obj.requester_user.avatar.url

    def get_assignee_avatar_url(self, obj):
        if not obj.current_assignee_id or not obj.current_assignee.avatar:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.current_assignee.avatar.url)
        return obj.current_assignee.avatar.url


class RequestTargetReassignSerializer(serializers.Serializer):
    target_team = serializers.IntegerField()
    note = serializers.CharField(required=False, allow_blank=True)


class RequestCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    attachment = serializers.FileField(required=False, allow_null=True)
    type = serializers.ChoiceField(choices=REQUEST_TYPE_CHOICES)
    priority = serializers.ChoiceField(
        choices=REQUEST_CREATE_PRIORITY_CHOICES,
        required=False,
        default=ServiceRequest.Priority.MEDIUM,
    )
    target_team = serializers.IntegerField()
    company_id = serializers.IntegerField(required=False)
    source_entity_id = serializers.IntegerField(required=False)

    def validate(self, attrs):
        description = (attrs.get("description") or "").strip()
        attachment = attrs.get("attachment")
        if not description and not attachment:
            raise serializers.ValidationError(
                {"description": "Provide a description or attach a file."}
            )
        return attrs


class RequestCommentCreateSerializer(serializers.Serializer):
    message = serializers.CharField(required=False, allow_blank=True)
    attachment = serializers.FileField(required=False, allow_null=True)

    def validate(self, attrs):
        message = (attrs.get("message") or "").strip()
        attachment = attrs.get("attachment")
        if not message and not attachment:
            raise serializers.ValidationError(
                {"message": "Provide a comment message or attach a file."}
            )
        return attrs


class RequestStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ServiceRequest.Status.choices)
    note = serializers.CharField(required=False, allow_blank=True)
    deadline_date = serializers.DateField(required=False)

    def validate(self, attrs):
        if attrs["status"] in {
            ServiceRequest.Status.COMPLETED,
            ServiceRequest.Status.CLOSED,
            ServiceRequest.Status.REJECTED,
        } and not attrs.get("note", "").strip():
            raise serializers.ValidationError(
                {"note": "A resolution note is required for this status."}
            )
        return attrs


class RequestDeadlineUpdateSerializer(serializers.Serializer):
    deadline_date = serializers.DateField()


class RequestAssignUserSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    note = serializers.CharField(required=False, allow_blank=True)
