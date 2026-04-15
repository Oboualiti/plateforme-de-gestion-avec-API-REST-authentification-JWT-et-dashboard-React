from django.apps import apps
from django.core.exceptions import ValidationError
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )
    entity = models.ForeignKey(
        "entities.Entity",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )
    job_title = models.CharField(max_length=120, blank=True)
    phone_number = models.CharField(max_length=30, blank=True)
    team_leader = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="team_members",
        limit_choices_to={"is_active": True},
    )

    def clean(self):
        super().clean()
        if self.entity_id and self.company_id and self.entity.company_id != self.company_id:
            raise ValidationError({"entity": "Entity must belong to the selected company."})

        if self.team_leader_id:
            if self.team_leader_id == self.id:
                raise ValidationError({"team_leader": "User cannot be their own Team Leader."})
            if self.company_id and self.team_leader.company_id != self.company_id:
                raise ValidationError(
                    {"team_leader": "Team Leader must belong to the same company."}
                )
            if self.entity_id and self.team_leader.entity_id != self.entity_id:
                raise ValidationError(
                    {"team_leader": "Team Leader must belong to the same entity."}
                )
            UserRole = apps.get_model("permissions_app", "UserRole")
            if not UserRole.objects.filter(
                user_id=self.team_leader_id, role__key="team_leader"
            ).exists():
                raise ValidationError(
                    {"team_leader": "Selected user must have Team Leader role."}
                )

    def __str__(self):
        return self.get_full_name() or self.username
