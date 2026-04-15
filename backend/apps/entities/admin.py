from django.contrib import admin

from .models import Entity


@admin.register(Entity)
class EntityAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "company", "entity_type", "is_active", "created_at")
    search_fields = ("name", "code", "company__name", "company__code")
    list_filter = ("company", "entity_type", "is_active")
