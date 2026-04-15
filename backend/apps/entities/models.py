from django.db import models

from apps.companies.models import Company


class Entity(models.Model):
    company = models.ForeignKey(
        Company, on_delete=models.CASCADE, related_name="entities"
    )
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        unique_together = ("company", "name")

    def __str__(self):
        return self.name
