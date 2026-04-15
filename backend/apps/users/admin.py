from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    fieldsets = DjangoUserAdmin.fieldsets + (
        (
            "Organization",
            {"fields": ("company", "entity", "job_title", "phone_number")},
        ),
    )
    list_display = ("username", "email", "first_name", "last_name", "company", "entity")
