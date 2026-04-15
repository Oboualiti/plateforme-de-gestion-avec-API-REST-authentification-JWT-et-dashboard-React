from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


class UserAdminForm(forms.ModelForm):
    class Meta:
        model = User
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        if "team_leader" not in self.fields:
            return

        company_id = None
        entity_id = None

        if self.is_bound:
            company_id = self.data.get("company") or None
            entity_id = self.data.get("entity") or None
        elif self.instance and self.instance.pk:
            company_id = self.instance.company_id
            entity_id = self.instance.entity_id

        queryset = User.objects.filter(
            assigned_roles__role__key="team_leader",
            company_id=company_id,
            entity_id=entity_id,
            is_active=True,
        ).distinct()

        if self.instance and self.instance.pk:
            queryset = queryset.exclude(pk=self.instance.pk)

        self.fields["team_leader"].queryset = queryset


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    form = UserAdminForm
    fieldsets = DjangoUserAdmin.fieldsets + (
        (
            "Organization",
            {"fields": ("company", "entity", "team_leader", "job_title", "phone_number")},
        ),
    )
    list_display = (
        "username",
        "email",
        "first_name",
        "last_name",
        "company",
        "entity",
        "team_leader",
    )
