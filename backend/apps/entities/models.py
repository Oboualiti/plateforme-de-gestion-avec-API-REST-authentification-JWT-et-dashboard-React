from django.db import models

from apps.companies.models import Company


class Entity(models.Model):
    class EntityType(models.TextChoices):
        PROD = "PROD", "Production"
        SUPPORT = "SUPPORT", "Support"
        TDEV = "TDEV", "Technical Development"

    company = models.ForeignKey(
        Company, on_delete=models.CASCADE, related_name="entities"
    )
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    entity_type = models.CharField(
        max_length=20,
        choices=EntityType.choices,
        default=EntityType.PROD,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        unique_together = ("company", "name")

    def __str__(self):
        return f"{self.name} ({self.get_entity_type_display()})"
