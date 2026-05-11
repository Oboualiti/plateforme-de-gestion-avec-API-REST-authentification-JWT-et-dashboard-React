from django.contrib import admin

from .models import Team


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "leader", "company", "entity", "is_active", "created_at")
    list_filter = ("is_active", "company", "entity")
    search_fields = ("name", "leader__username", "company__name", "entity__name")
    filter_horizontal = ("members",)
