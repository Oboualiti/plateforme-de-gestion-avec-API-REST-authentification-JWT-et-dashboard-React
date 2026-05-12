from django.conf import settings
from django.db import models

from apps.companies.models import Company
from apps.entities.models import Entity


class MainBranch(models.Model):
    name = models.CharField(max_length=255)
    senior = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="main_branches_as_senior",
    )

    def __str__(self):
        return self.name


class OperationalUnit(models.Model):
    class TeamType(models.TextChoices):
        PROD = "PROD", "Production"
        SUPPORT = "SUPPORT", "Support"
        TDEV = "TDEV", "Technical Development"

    main_branch = models.ForeignKey(
        MainBranch, on_delete=models.CASCADE, related_name="operational_units"
    )
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    team_type = models.CharField(max_length=20, choices=TeamType.choices)
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_operational_units",
    )
    telegram_chat_id = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.code} - {self.name}"


class UnitMembership(models.Model):
    class Role(models.TextChoices):
        MANAGER = "MANAGER", "Manager"
        TEAM_LEADER = "TEAM_LEADER", "Team Leader"
        USER = "USER", "User"

    unit = models.ForeignKey(
        OperationalUnit, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="unit_memberships",
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.USER)

    class Meta:
        unique_together = ("unit", "user")

    def __str__(self):
        return f"{self.user} in {self.unit} ({self.role})"


class Team(models.Model):
    name = models.CharField(max_length=255)
    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="teams",
    )
    entity = models.ForeignKey(
        Entity,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="teams",
    )
    leader = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="led_teams",
    )
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="teams",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["leader"], name="team_leader_idx"),
            models.Index(fields=["company", "is_active"], name="team_company_active_idx"),
            models.Index(fields=["entity", "is_active"], name="team_entity_active_idx"),
            models.Index(fields=["is_active"], name="team_active_idx"),
        ]

    def __str__(self):
        return self.name


class ServiceRequest(models.Model):
    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        CRITICAL = "CRITICAL", "Critical"

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        ACCEPTED = "ACCEPTED", "Accepted"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        REJECTED = "REJECTED", "Rejected"
        COMPLETED = "COMPLETED", "Completed"
        CLOSED = "CLOSED", "Closed"

    request_number = models.CharField(max_length=50, unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField()
    attachment = models.FileField(upload_to="request_attachments/", null=True, blank=True)
    category = models.CharField(max_length=100)
    priority = models.CharField(
        max_length=20, choices=Priority.choices, default=Priority.MEDIUM
    )
    requester_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="service_requests_created",
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_requests",
    )
    source_entity = models.ForeignKey(
        Entity,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_requests_sent",
    )
    target_entity = models.ForeignKey(
        Entity,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_requests_received",
    )
    requester_unit = models.ForeignKey(
        OperationalUnit,
        on_delete=models.PROTECT,
        related_name="service_requests_requested",
    )
    target_unit = models.ForeignKey(
        OperationalUnit,
        on_delete=models.PROTECT,
        related_name="service_requests_received",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    is_submitted_to_target = models.BooleanField(default=True)
    current_assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_requests_assigned",
    )
    target_team_leader = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_requests_target_team_owned",
    )
    target_team = models.ForeignKey(
        Team,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_requests",
    )
    rejection_reason = models.TextField(blank=True)
    resolution_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    deadline_date = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["status"], name="req_status_idx"),
            models.Index(fields=["created_at"], name="req_created_at_idx"),
            models.Index(fields=["completed_at"], name="req_completed_at_idx"),
            models.Index(fields=["closed_at"], name="req_closed_at_idx"),
            models.Index(fields=["deadline_date"], name="req_deadline_idx"),
            models.Index(fields=["priority"], name="req_priority_idx"),
            models.Index(fields=["status", "created_at"], name="req_status_created_idx"),
            models.Index(fields=["status", "completed_at"], name="req_status_completed_idx"),
            models.Index(fields=["status", "closed_at"], name="req_status_closed_idx"),
            models.Index(fields=["company", "status"], name="req_company_status_idx"),
            models.Index(fields=["source_entity", "status"], name="req_source_status_idx"),
            models.Index(fields=["target_entity", "status"], name="req_target_status_idx"),
            models.Index(fields=["current_assignee", "status"], name="req_assignee_status_idx"),
            models.Index(fields=["current_assignee", "completed_at"], name="req_assignee_completed_idx"),
            models.Index(fields=["requester_user", "status"], name="req_requester_status_idx"),
            models.Index(fields=["company", "created_at"], name="req_company_created_idx"),
            models.Index(fields=["target_entity", "completed_at"], name="req_target_completed_idx"),
            models.Index(fields=["target_entity", "created_at"], name="req_target_created_idx"),
            models.Index(fields=["target_team_leader"], name="req_target_tl_idx"),
            models.Index(fields=["target_team"], name="req_target_team_idx"),
            models.Index(
                fields=["requester_user", "created_at"],
                name="req_requester_created_idx",
            ),
        ]

    def __str__(self):
        return self.request_number


class RequestStatusHistory(models.Model):
    request = models.ForeignKey(
        ServiceRequest, on_delete=models.CASCADE, related_name="status_history"
    )
    old_status = models.CharField(max_length=20, choices=ServiceRequest.Status.choices)
    new_status = models.CharField(max_length=20, choices=ServiceRequest.Status.choices)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="request_status_changes",
    )
    note = models.TextField(blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.request_id}: {self.old_status} -> {self.new_status}"


class RequestAssignmentHistory(models.Model):
    request = models.ForeignKey(
        ServiceRequest, on_delete=models.CASCADE, related_name="assignment_history"
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="request_assignments_made",
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="request_assignments_received",
    )
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.request_id}: {self.assignee_id}"


class RequestMessage(models.Model):
    request = models.ForeignKey(
        ServiceRequest, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="request_messages_sent",
    )
    reply_to_comment = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replies",
    )
    message = models.TextField()
    attachment = models.FileField(upload_to="request_attachments/", null=True, blank=True)
    telegram_message_id = models.BigIntegerField(null=True, blank=True)
    telegram_reply_to_message_id = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    is_pinned = models.BooleanField(default=False)
    pinned_at = models.DateTimeField(null=True, blank=True)
    pinned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="request_messages_pinned",
    )

    def __str__(self):
        return f"Message {self.id} on {self.request_id}"


class RequestTeamReassignmentHistory(models.Model):
    request = models.ForeignKey(
        ServiceRequest, on_delete=models.CASCADE, related_name="team_reassignment_history"
    )
    old_target_entity = models.ForeignKey(
        Entity,
        on_delete=models.PROTECT,
        related_name="request_team_reassignments_from",
    )
    new_target_entity = models.ForeignKey(
        Entity,
        on_delete=models.PROTECT,
        related_name="request_team_reassignments_to",
    )
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="request_team_reassignments_made",
    )
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return (
            f"{self.request_id}: {self.old_target_entity_id}"
            f" -> {self.new_target_entity_id}"
        )
