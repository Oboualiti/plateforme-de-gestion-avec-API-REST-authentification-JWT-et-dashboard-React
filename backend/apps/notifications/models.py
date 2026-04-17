from django.db import models
from django.conf import settings


class NotificationPreference(models.Model):
    event_key = models.CharField(max_length=100, unique=True)
    label = models.CharField(max_length=150)
    email_enabled = models.BooleanField(default=True)
    in_app_enabled = models.BooleanField(default=True)
    telegram_enabled = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["label"]

    def __str__(self):
        return self.label


class UserNotification(models.Model):
    class EventType(models.TextChoices):
        REQUEST_CREATED = "REQUEST_CREATED", "Request created"
        REQUEST_MESSAGE = "REQUEST_MESSAGE", "Request message"
        USER_CREATED = "USER_CREATED", "User created"
        GENERAL = "GENERAL", "General"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    event_type = models.CharField(
        max_length=40,
        choices=EventType.choices,
        default=EventType.GENERAL,
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    link = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user_id} - {self.title}"
