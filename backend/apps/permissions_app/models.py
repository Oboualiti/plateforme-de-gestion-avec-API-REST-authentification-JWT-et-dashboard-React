from django.conf import settings
from django.db import models


class AppPermission(models.Model):
    key = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["key"]

    def __str__(self):
        return self.key


class RolePermission(models.Model):
    role = models.ForeignKey(
        "roles.Role", on_delete=models.CASCADE, related_name="role_permissions"
    )
    permission = models.ForeignKey(
        AppPermission, on_delete=models.CASCADE, related_name="permission_roles"
    )

    class Meta:
        unique_together = ("role", "permission")

    def __str__(self):
        return f"{self.role.key} -> {self.permission.key}"



class RoleDefaultPermission(models.Model):
    role = models.ForeignKey(
        "roles.Role", on_delete=models.CASCADE, related_name="default_permissions"
    )
    permission = models.ForeignKey(
        AppPermission, on_delete=models.CASCADE, related_name="role_default_permissions"
    )

    class Meta:
        unique_together = ("role", "permission")

    def __str__(self):
        return f"default {self.role.key} -> {self.permission.key}"

class PermissionDelegation(models.Model):
    role = models.ForeignKey(
        "roles.Role", on_delete=models.CASCADE, related_name="delegatable_permissions"
    )
    permission = models.ForeignKey(
        AppPermission, on_delete=models.CASCADE, related_name="delegatable_by_roles"
    )

    class Meta:
        unique_together = ("role", "permission")

    def __str__(self):
        return f"{self.role.key} can delegate {self.permission.key}"


class UserRole(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assigned_roles"
    )
    role = models.ForeignKey(
        "roles.Role", on_delete=models.CASCADE, related_name="user_assignments"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user"], name="unique_role_per_user"),
            models.UniqueConstraint(fields=["user", "role"], name="unique_user_role_pair"),
        ]

    def __str__(self):
        return f"{self.user} as {self.role.key}"


class UserPermissionOverride(models.Model):
    class ScopeType(models.TextChoices):
        GLOBAL = "GLOBAL", "Global"
        COMPANY = "COMPANY", "Company"
        ENTITY = "ENTITY", "Entity"
        TEAM = "TEAM", "Team"
        OWN = "OWN", "Own"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="permission_overrides",
    )
    permission = models.ForeignKey(
        AppPermission, on_delete=models.CASCADE, related_name="user_overrides"
    )
    is_allowed = models.BooleanField()
    scope_type = models.CharField(
        max_length=20,
        choices=ScopeType.choices,
        default=ScopeType.GLOBAL,
    )
    reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "permission")

    def __str__(self):
        mode = "allow" if self.is_allowed else "deny"
        return f"{self.user}: {mode} {self.permission.key}"


class UserAccessDelegation(models.Model):
    delegator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="delegations_given",
    )
    delegate = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="delegations_received",
    )
    permissions = models.ManyToManyField(
        AppPermission,
        related_name="user_access_delegations",
        blank=True,
    )
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.CharField(max_length=255, blank=True)
    is_revoked = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="delegations_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.delegator} -> {self.delegate} ({self.start_date} to {self.end_date})"


class UserRequestVisibilityOverride(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="request_visibility_overrides",
    )
    request = models.ForeignKey(
        "requests_app.ServiceRequest",
        on_delete=models.CASCADE,
        related_name="visibility_overrides",
    )
    can_view = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_request_visibility_overrides",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "request")

    def __str__(self):
        mode = "can_view" if self.can_view else "blocked"
        return f"{self.user.username} {mode} {self.request.request_number}"


class UserRequestPermissionOverride(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="request_permission_overrides",
    )
    request = models.ForeignKey(
        "requests_app.ServiceRequest",
        on_delete=models.CASCADE,
        related_name="permission_overrides",
    )
    permission_key = models.CharField(max_length=100)
    allowed = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_request_permission_overrides",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "request", "permission_key")
        indexes = [
            models.Index(fields=["user", "permission_key"]),
            models.Index(fields=["request", "permission_key"]),
            models.Index(fields=["user", "request", "permission_key"]),
        ]

    def __str__(self):
        mode = "allow" if self.allowed else "deny"
        return (
            f"{self.user.username} {mode} {self.permission_key} "
            f"on {self.request.request_number}"
        )


class UserScopedAccessOverride(models.Model):
    class ControlKey(models.TextChoices):
        VIEW_USERS = "view_users", "View Users"
        MANAGE_USERS = "manage_users", "Manage Users"
        PERMISSION_MANAGEMENT = "permission_management", "Permission Management"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="scoped_access_overrides",
    )
    subject_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="scoped_access_subject_overrides",
    )
    control_key = models.CharField(max_length=40, choices=ControlKey.choices)
    allowed = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_scoped_access_overrides",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "subject_user", "control_key")
        indexes = [
            models.Index(fields=["user", "control_key"]),
            models.Index(fields=["subject_user", "control_key"]),
            models.Index(fields=["user", "subject_user", "control_key"]),
        ]

    def __str__(self):
        mode = "allow" if self.allowed else "deny"
        return f"{self.user.username} {mode} {self.control_key} for {self.subject_user.username}"
