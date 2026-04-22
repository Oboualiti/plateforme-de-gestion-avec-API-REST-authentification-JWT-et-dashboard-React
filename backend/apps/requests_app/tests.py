from django.test import TestCase

# Create your tests here.
from django.core.management import call_command
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.entities.models import Entity
from apps.permissions_app.models import UserRole
from apps.requests_app.models import MainBranch, OperationalUnit, ServiceRequest
from apps.roles.models import Role
from apps.users.models import User


class RequestPermissionWorkflowTests(APITestCase):
    def setUp(self):
        call_command("seed_roles_permissions")
        self.company = Company.objects.create(name="WMN", code="WMN")
        self.prod_entity = Entity.objects.create(
            company=self.company,
            name="WMN1",
            code="WMN1",
            entity_type=Entity.EntityType.PROD,
        )
        self.support_entity = Entity.objects.create(
            company=self.company,
            name="WMN4",
            code="WMN4",
            entity_type=Entity.EntityType.SUPPORT,
        )
        self.other_prod_entity = Entity.objects.create(
            company=self.company,
            name="WMN2",
            code="WMN2",
            entity_type=Entity.EntityType.PROD,
        )

        branch = MainBranch.objects.create(name="WMN")
        self.prod_unit = OperationalUnit.objects.create(
            main_branch=branch,
            code=self.prod_entity.code,
            name=self.prod_entity.name,
            team_type=OperationalUnit.TeamType.PROD,
        )
        self.support_unit = OperationalUnit.objects.create(
            main_branch=branch,
            code=self.support_entity.code,
            name=self.support_entity.name,
            team_type=OperationalUnit.TeamType.SUPPORT,
        )

        self.requester = self._create_user_with_role("user1", "user", entity=self.prod_entity)
        self.team_leader = self._create_user_with_role(
            "tl1",
            "team_leader",
            entity=self.prod_entity,
        )
        self.requester.team_leader = self.team_leader
        self.requester.save(update_fields=["team_leader"])
        self.outsider_manager = self._create_user_with_role(
            "manager2",
            "manager",
            entity=self.other_prod_entity,
        )

        self.pending_request = ServiceRequest.objects.create(
            request_number="REQ-UNIT-0001",
            title="Pending approval request",
            description="Pending before target queue",
            category="INFO",
            requester_user=self.requester,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=self.support_entity,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            status=ServiceRequest.Status.NEW,
            is_submitted_to_target=False,
        )

    def _create_user_with_role(self, username, role_key, entity):
        user = User.objects.create_user(
            username=username,
            password="test12345",
            company=self.company,
            entity=entity,
        )
        role = Role.objects.get(key=role_key)
        UserRole.objects.create(user=user, role=role)
        return user

    def test_pending_approval_accept_sets_submitted_and_keeps_new_status(self):
        self.client.force_authenticate(user=self.team_leader)
        url = reverse("requests-status", kwargs={"request_id": self.pending_request.id})
        response = self.client.post(url, {"status": ServiceRequest.Status.ACCEPTED, "note": "Approved"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.pending_request.refresh_from_db()
        self.assertTrue(self.pending_request.is_submitted_to_target)
        self.assertEqual(self.pending_request.status, ServiceRequest.Status.NEW)

    def test_manager_outside_requester_hierarchy_cannot_approve_pending_request(self):
        self.client.force_authenticate(user=self.outsider_manager)
        url = reverse("requests-status", kwargs={"request_id": self.pending_request.id})
        response = self.client.post(url, {"status": ServiceRequest.Status.ACCEPTED, "note": "Try approve"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
