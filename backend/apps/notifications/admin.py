from django.contrib import admin
from .models import NotificationPreference, UserNotification


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ("label", "event_key", "in_app_enabled", "email_enabled", "telegram_enabled", "is_active")
    search_fields = ("label", "event_key")
    list_filter = ("is_active", "in_app_enabled", "email_enabled", "telegram_enabled")


@admin.register(UserNotification)
class UserNotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "event_type", "title", "is_read", "created_at")
    search_fields = ("user__username", "title", "message")
    list_filter = ("event_type", "is_read", "created_at")
