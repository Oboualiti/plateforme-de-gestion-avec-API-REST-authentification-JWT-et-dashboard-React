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
    current_assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_requests_assigned",
    )
    rejection_reason = models.TextField(blank=True)
    resolution_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

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
    message = models.TextField()
    attachment = models.FileField(upload_to="request_attachments/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Message {self.id} on {self.request_id}"
