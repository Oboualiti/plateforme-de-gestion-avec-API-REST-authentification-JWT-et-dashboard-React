from django.conf import settings
from django.db import models


class AdminAuditLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admin_audit_logs",
    )
    module = models.CharField(max_length=50)
    action = models.CharField(max_length=50)
    target_model = models.CharField(max_length=100, blank=True)
    target_id = models.CharField(max_length=50, blank=True)
    target_label = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.module}:{self.action}"
