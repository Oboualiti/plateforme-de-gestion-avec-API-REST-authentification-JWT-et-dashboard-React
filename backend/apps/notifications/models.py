from django.db import models


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
