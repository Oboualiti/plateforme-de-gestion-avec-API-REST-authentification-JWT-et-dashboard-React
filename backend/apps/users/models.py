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

    def __str__(self):
        return self.get_full_name() or self.username
