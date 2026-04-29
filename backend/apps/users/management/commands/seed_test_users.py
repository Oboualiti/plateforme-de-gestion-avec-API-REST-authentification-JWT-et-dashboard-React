from django.core.management.base import BaseCommand

from apps.companies.models import Company
from apps.entities.models import Entity
from apps.permissions_app.models import UserRole
from apps.roles.models import Role
from apps.users.models import User


COMPANIES = [
    {"code": "CMH", "name": "CMH"},
    {"code": "WMN", "name": "WMN"},
    {"code": "VMS", "name": "VMS"},
]


class Command(BaseCommand):
    help = "Seed fixed companies, entities, and hierarchy test users."

    def handle(self, *args, **options):
        companies = {}
        for payload in COMPANIES:
            company, _ = Company.objects.get_or_create(
                code=payload["code"],
                defaults={"name": payload["name"]},
            )
            companies[payload["code"]] = company

        entities = {
            "CMH-1": self._get_entity(companies["CMH"], "CMH-1", "PROD"),
            "CMH-2": self._get_entity(companies["CMH"], "CMH-2", "SUPPORT"),
            "WMN-1": self._get_entity(companies["WMN"], "WMN-1", "PROD"),
            "WMN-2": self._get_entity(companies["WMN"], "WMN-2", "SUPPORT"),
            "VMS-1": self._get_entity(companies["VMS"], "VMS-1", "TDEV"),
        }

        users = [
            {
                "username": "superadmin",
                "email": "superadmin@test.com",
                "first_name": "Super",
                "last_name": "Admin",
                "company": None,
                "entity": None,
                "job_title": "Global Admin",
                "role_key": "super_admin",
                "is_staff": True,
                "team_leader": None,
            },
            
        ]

        created_users = {}
        for payload in users:
            role_key = payload["role_key"]
            user, _ = User.objects.get_or_create(
                username=payload["username"],
                defaults={
                    "email": payload["email"],
                    "first_name": payload["first_name"],
                    "last_name": payload["last_name"],
                    "entity": payload["entity"],
                    "job_title": payload["job_title"],
                    "is_staff": payload["is_staff"],
                    "company": payload["company"],
                },
            )
            changed = False
            for key in ("email", "first_name", "last_name", "job_title", "is_staff"):
                if getattr(user, key) != payload[key]:
                    setattr(user, key, payload[key])
                    changed = True
            target_company_id = payload["company"].id if payload["company"] else None
            target_entity_id = payload["entity"].id if payload["entity"] else None

            if user.company_id != target_company_id:
                user.company = payload["company"] if payload["company"] else None
                changed = True
            if user.entity_id != target_entity_id:
                user.entity = payload["entity"] if payload["entity"] else None
                changed = True
            if not user.check_password("test12345"):
                user.set_password("test12345")
                changed = True
            if changed:
                user.save()

            role = Role.objects.filter(key=role_key).first()
            if role:
                UserRole.objects.filter(user=user).delete()
                UserRole.objects.create(user=user, role=role)

            created_users[payload["username"]] = user

        for payload in users:
            user = created_users[payload["username"]]
            leader_username = payload.get("team_leader_username")
            team_leader = created_users.get(leader_username) if leader_username else None
            if user.team_leader_id != (team_leader.id if team_leader else None):
                user.team_leader = team_leader
                user.save(update_fields=["team_leader"])

            self.stdout.write(self.style.SUCCESS(f"Seeded {user.username}"))

    def _get_entity(self, company, code, entity_type):
        entity, _ = Entity.objects.get_or_create(
            code=code,
            defaults={
                "company": company,
                "name": code,
                "entity_type": entity_type,
            },
        )
        changed = False
        if entity.company_id != company.id:
            entity.company = company
            changed = True
        if entity.name != code:
            entity.name = code
            changed = True
        if entity.entity_type != entity_type:
            entity.entity_type = entity_type
            changed = True
        if changed:
            entity.save()
        return entity
