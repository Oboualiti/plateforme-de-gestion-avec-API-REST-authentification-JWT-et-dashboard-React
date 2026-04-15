from django.core.management.base import BaseCommand

from apps.companies.models import Company
from apps.entities.models import Entity
from apps.users.models import User


class Command(BaseCommand):
    help = "Seed basic test users for local development."

    def handle(self, *args, **options):
        company, _ = Company.objects.get_or_create(
            code="WSERVICE",
            defaults={"name": "W Service"},
        )
        prod_entity, _ = Entity.objects.get_or_create(
            code="PROD",
            defaults={"company": company, "name": "Production"},
        )
        support_entity, _ = Entity.objects.get_or_create(
            code="SUPPORT",
            defaults={"company": company, "name": "Support"},
        )

        users = [
            {
                "username": "prod",
                "email": "prod@test.com",
                "first_name": "Prod",
                "last_name": "User",
                "entity": prod_entity,
                "job_title": "Production Specialist",
            },
            {
                "username": "support",
                "email": "support@test.com",
                "first_name": "Support",
                "last_name": "User",
                "entity": support_entity,
                "job_title": "Support Specialist",
            },
        ]

        for payload in users:
            user, created = User.objects.get_or_create(
                email=payload["email"],
                defaults={**payload, "company": company},
            )
            changed = False
            for key, value in payload.items():
                if getattr(user, key) != value:
                    setattr(user, key, value)
                    changed = True
            if user.company_id != company.id:
                user.company = company
                changed = True
            if created or not user.check_password("test12345"):
                user.set_password("test12345")
                changed = True
            if changed:
                user.save()
            self.stdout.write(
                self.style.SUCCESS(
                    f"{'Created' if created else 'Updated'} {payload['email']}"
                )
            )
