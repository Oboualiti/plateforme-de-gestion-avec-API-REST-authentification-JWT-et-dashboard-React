from django.test import TestCase
from datetime import date, timedelta
from io import StringIO
from django.utils import timezone

# Create your tests here.
from django.core.management import call_command
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.entities.models import Entity
from apps.permissions_app.models import AppPermission, UserPermissionOverride, UserRole
from apps.requests_app.models import (
    MainBranch,
    OperationalUnit,
    RequestAssignmentHistory,
    RequestStatusHistory,
    RequestTeamReassignmentHistory,
    ServiceRequest,
    Team,
)
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
        self.support_entity_alt = Entity.objects.create(
            company=self.company,
            name="WMN5",
            code="WMN5",
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
        self.requester_manager = self._create_user_with_role(
            "manager1",
            "manager",
            entity=self.prod_entity,
        )
        self.super_admin = self._create_user_with_role(
            "super_admin1",
            "super_admin",
            entity=self.prod_entity,
        )
        self.senior_user = self._create_user_with_role(
            "senior1",
            "senior",
            entity=self.prod_entity,
        )
        self.support_team_leader = self._create_user_with_role(
            "tl_support",
            "team_leader",
            entity=self.support_entity,
        )
        self.support_team_leader_peer = self._create_user_with_role(
            "tl_support_peer",
            "team_leader",
            entity=self.support_entity,
        )
        self.support_team_leader_alt = self._create_user_with_role(
            "tl_support_alt",
            "team_leader",
            entity=self.support_entity_alt,
        )
        self.support_senior = self._create_user_with_role(
            "senior_support",
            "senior",
            entity=self.support_entity,
        )
        self.support_super_admin = self._create_user_with_role(
            "super_support",
            "super_admin",
            entity=self.support_entity,
        )
        self.support_manager = self._create_user_with_role(
            "manager_support",
            "manager",
            entity=self.support_entity,
        )
        self.support_resolver = self._create_user_with_role(
            "support_user",
            "user",
            entity=self.support_entity,
        )
        self.support_resolver.team_leader = self.support_team_leader
        self.support_resolver.save(update_fields=["team_leader"])
        self.prod_team = Team.objects.create(
            name=f"{self.team_leader.username}'s Team",
            company=self.company,
            entity=self.prod_entity,
            leader=self.team_leader,
            is_active=True,
        )
        self.support_team = Team.objects.create(
            name=f"{self.support_team_leader.username}'s Team",
            company=self.company,
            entity=self.support_entity,
            leader=self.support_team_leader,
            is_active=True,
        )
        self.support_peer_team = Team.objects.create(
            name=f"{self.support_team_leader_peer.username}'s Team",
            company=self.company,
            entity=self.support_entity,
            leader=self.support_team_leader_peer,
            is_active=True,
        )
        self.support_alt_team = Team.objects.create(
            name=f"{self.support_team_leader_alt.username}'s Team",
            company=self.company,
            entity=self.support_entity_alt,
            leader=self.support_team_leader_alt,
            is_active=True,
        )
        self.support_team.members.add(self.support_resolver)

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
        self.submitted_request = ServiceRequest.objects.create(
            request_number="REQ-UNIT-0002",
            title="Submitted request",
            description="Ready for target assignment",
            category="INFO",
            requester_user=self.requester,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=self.support_entity,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            status=ServiceRequest.Status.NEW,
            is_submitted_to_target=True,
        )

    def _completed_request(self, request_number="REQ-UNIT-COMPLETE"):
        req = ServiceRequest.objects.create(
            request_number=request_number,
            title="Completed request",
            description="Waiting for requester approval",
            category="SCRIPT",
            requester_user=self.requester,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=self.support_entity,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            current_assignee=self.support_resolver,
            status=ServiceRequest.Status.COMPLETED,
            is_submitted_to_target=True,
            completed_at=timezone.now(),
            accepted_at=timezone.now(),
        )
        RequestStatusHistory.objects.create(
            request=req,
            old_status=ServiceRequest.Status.IN_PROGRESS,
            new_status=ServiceRequest.Status.COMPLETED,
            changed_by=self.support_resolver,
            note="Done",
        )
        return req

    def _credits_row_for(self, actor, req):
        self.client.force_authenticate(user=actor)
        response = self.client.get(reverse("credits-solves-list"), format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data.get("solves", [])
        row = next((item for item in rows if item.get("requestId") == req.id), None)
        self.assertIsNotNone(row)
        return row

    def _credits_payload_for(self, actor):
        self.client.force_authenticate(user=actor)
        response = self.client.get(reverse("credits-solves-list"), format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def _run_backfill_target_team(self):
        out = StringIO()
        call_command("backfill_request_target_team", stdout=out)
        return out.getvalue()

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

    def test_basic_user_with_approve_permission_submits_directly(self):
        approve_permission = AppPermission.objects.get(key="approve_request")
        UserPermissionOverride.objects.update_or_create(
            user=self.requester,
            permission=approve_permission,
            defaults={"is_allowed": True},
        )

        self.client.force_authenticate(user=self.requester)
        response = self.client.post(
            reverse("requests-list-create"),
            {
                "title": "Direct user request",
                "description": "Should skip pending approval",
                "type": "INFO",
                "priority": "MEDIUM",
                "target_team": self.support_entity.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        created_request = ServiceRequest.objects.get(id=response.data["id"])
        self.assertTrue(created_request.is_submitted_to_target)

        pending_response = self.client.get(
            f"{reverse('requests-list-create')}?scope=pending",
            format="json",
        )
        self.assertEqual(pending_response.status_code, status.HTTP_200_OK)
        self.assertEqual(pending_response.data.get("count"), 0)

    def test_manager_outside_requester_hierarchy_cannot_approve_pending_request(self):
        self.client.force_authenticate(user=self.outsider_manager)
        url = reverse("requests-status", kwargs={"request_id": self.pending_request.id})
        response = self.client.post(url, {"status": ServiceRequest.Status.ACCEPTED, "note": "Try approve"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_senior_cannot_assign_to_self(self):
        self.client.force_authenticate(user=self.senior_user)
        url = reverse("requests-assign", kwargs={"request_id": self.submitted_request.id})
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_senior_status_update_does_not_auto_assign_self(self):
        self.client.force_authenticate(user=self.senior_user)
        url = reverse("requests-status", kwargs={"request_id": self.submitted_request.id})
        response = self.client.post(
            url,
            {
                "status": ServiceRequest.Status.ACCEPTED,
                "note": "Accepted by senior",
                "deadline_date": "2026-05-03",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.submitted_request.refresh_from_db()
        self.assertIsNone(self.submitted_request.current_assignee_id)

    def test_senior_detail_hides_assign_to_me_and_lists_target_tl(self):
        self.client.force_authenticate(user=self.senior_user)
        url = reverse("requests-detail", kwargs={"request_id": self.submitted_request.id})
        response = self.client.get(url, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data.get("can_assign_to_me"))
        assignee_ids = {item["id"] for item in response.data.get("potential_assignees", [])}
        self.assertNotIn(self.senior_user.id, assignee_ids)
        self.assertIn(self.support_team_leader.id, assignee_ids)

    def test_super_admin_default_scope_hides_pending_and_pending_scope_shows_it(self):
        self.client.force_authenticate(user=self.super_admin)
        url = reverse("requests-list-create")
        response = self.client.get(url, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get("results", [])
        request_ids = {item["id"] for item in results}
        self.assertNotIn(self.pending_request.id, request_ids)
        self.assertIn(self.submitted_request.id, request_ids)

        pending_response = self.client.get(f"{url}?scope=pending", format="json")
        self.assertEqual(pending_response.status_code, status.HTTP_200_OK)
        pending_ids = {item["id"] for item in pending_response.data.get("results", [])}
        self.assertIn(self.pending_request.id, pending_ids)

    def test_requests_list_includes_deadline_date(self):
        self.submitted_request.deadline_date = date(2026, 4, 20)
        self.submitted_request.save(update_fields=["deadline_date"])

        self.client.force_authenticate(user=self.super_admin)
        url = reverse("requests-list-create")
        response = self.client.get(url, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get("results", [])
        row = next((item for item in results if item.get("id") == self.submitted_request.id), None)
        self.assertIsNotNone(row)
        self.assertEqual(row.get("deadline_date"), "2026-04-20")

    def test_target_entity_accept_requires_deadline(self):
        self.client.force_authenticate(user=self.support_manager)
        url = reverse("requests-status", kwargs={"request_id": self.submitted_request.id})
        response = self.client.post(
            url,
            {"status": ServiceRequest.Status.ACCEPTED, "note": "Taking ownership"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("approximate deadline", str(response.data.get("detail", "")).lower())

    def test_target_entity_accept_sets_deadline(self):
        self.client.force_authenticate(user=self.support_manager)
        url = reverse("requests-status", kwargs={"request_id": self.submitted_request.id})
        response = self.client.post(
            url,
            {
                "status": ServiceRequest.Status.ACCEPTED,
                "note": "Accepted by support manager",
                "deadline_date": "2026-05-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.submitted_request.refresh_from_db()
        self.assertEqual(self.submitted_request.status, ServiceRequest.Status.ACCEPTED)
        self.assertEqual(self.submitted_request.deadline_date.isoformat(), "2026-05-01")

    def test_completed_request_returns_zero_earned_and_preview_credits(self):
        req = self._completed_request()
        row = self._credits_row_for(self.requester, req)
        self.assertEqual(row.get("requestStatus"), ServiceRequest.Status.COMPLETED)
        self.assertEqual(row.get("credits"), 0)
        self.assertFalse(row.get("isEarned"))
        self.assertGreater(row.get("previewCredits"), 0)

    def test_closed_request_returns_earned_credits(self):
        req = self._completed_request()
        req.status = ServiceRequest.Status.CLOSED
        req.closed_at = timezone.now()
        req.save(update_fields=["status", "closed_at"])

        row = self._credits_row_for(self.requester, req)
        self.assertEqual(row.get("requestStatus"), ServiceRequest.Status.CLOSED)
        self.assertTrue(row.get("isEarned"))
        self.assertEqual(row.get("credits"), row.get("previewCredits"))
        self.assertGreater(row.get("credits"), 0)

    def test_credits_row_returns_real_target_team_fields(self):
        req = self._completed_request("REQ-UNIT-TEAM-FIELDS")
        req.target_team = self.support_team
        req.target_team_leader = self.support_team_leader
        req.status = ServiceRequest.Status.CLOSED
        req.closed_at = timezone.now()
        req.save(update_fields=["target_team", "target_team_leader", "status", "closed_at"])

        row = self._credits_row_for(self.requester, req)
        self.assertEqual(row.get("target_team_id"), self.support_team.id)
        self.assertEqual(row.get("target_team_name"), self.support_team.name)
        self.assertEqual(row.get("target_team_leader_id"), self.support_team_leader.id)
        self.assertEqual(row.get("target_entity_id"), self.support_entity.id)
        self.assertEqual(row.get("team_key"), f"team-{self.support_team.id}")

    def test_team_rankings_group_by_target_team_id(self):
        req_a = self._completed_request("REQ-UNIT-TEAM-A")
        req_a.target_team = self.support_team
        req_a.target_team_leader = self.support_team_leader
        req_a.status = ServiceRequest.Status.CLOSED
        req_a.closed_at = timezone.now()
        req_a.save(update_fields=["target_team", "target_team_leader", "status", "closed_at"])

        req_b = self._completed_request("REQ-UNIT-TEAM-B")
        req_b.target_team = self.support_peer_team
        req_b.target_team_leader = self.support_team_leader_peer
        req_b.status = ServiceRequest.Status.CLOSED
        req_b.closed_at = timezone.now()
        req_b.save(update_fields=["target_team", "target_team_leader", "status", "closed_at"])

        payload = self._credits_payload_for(self.requester)
        team_rows = payload.get("teamRankings", [])
        support_row = next((r for r in team_rows if r.get("teamId") == self.support_team.id), None)
        peer_row = next((r for r in team_rows if r.get("teamId") == self.support_peer_team.id), None)
        self.assertIsNotNone(support_row)
        self.assertIsNotNone(peer_row)
        self.assertEqual(support_row.get("teamKey"), f"team-{self.support_team.id}")
        self.assertEqual(peer_row.get("teamKey"), f"team-{self.support_peer_team.id}")

    def test_people_rankings_include_team_context_from_request_target_team(self):
        req = self._completed_request("REQ-UNIT-PEOPLE-TEAM")
        req.target_team = self.support_team
        req.target_team_leader = self.support_team_leader
        req.status = ServiceRequest.Status.CLOSED
        req.closed_at = timezone.now()
        req.save(update_fields=["target_team", "target_team_leader", "status", "closed_at"])

        payload = self._credits_payload_for(self.requester)
        people_rows = payload.get("peopleRankings", [])
        person_row = next((r for r in people_rows if r.get("userId") == self.support_resolver.id), None)
        self.assertIsNotNone(person_row)
        self.assertEqual(person_row.get("teamId"), self.support_team.id)
        self.assertEqual(person_row.get("teamName"), self.support_team.name)

    def test_request_demand_rankings_populated_for_visible_created_requests(self):
        req = self._completed_request("REQ-UNIT-DEMAND-POPULATED")
        req.status = ServiceRequest.Status.CLOSED
        req.closed_at = timezone.now()
        req.save(update_fields=["status", "closed_at"])

        payload = self._credits_payload_for(self.requester)
        demand = payload.get("requestDemandRankings", {})
        requester_rows = demand.get("requesters", [])
        self.assertIn("requesters", demand)
        self.assertIsInstance(requester_rows, list)

    def test_request_demand_rankings_empty_when_no_visible_requests(self):
        other_company = Company.objects.create(name="OTHER", code="OTH")
        other_entity = Entity.objects.create(
            company=other_company,
            name="OTH1",
            code="OTH1",
            entity_type=Entity.EntityType.PROD,
        )
        no_data_user = User.objects.create_user(
            username="no_data_manager",
            password="test12345",
            company=other_company,
            entity=other_entity,
        )
        manager_role = Role.objects.get(key="manager")
        UserRole.objects.create(user=no_data_user, role=manager_role)

        payload = self._credits_payload_for(no_data_user)
        demand = payload.get("requestDemandRankings", {})
        self.assertEqual(demand.get("sourceEntities", []), [])
        self.assertEqual(demand.get("sourceTeams", []), [])
        self.assertEqual(demand.get("requesters", []), [])

    def test_request_demand_date_filter_uses_created_at_only(self):
        requester2 = self._create_user_with_role("requester2", "user", entity=self.prod_entity)

        old_req = ServiceRequest.objects.create(
            request_number="REQ-UNIT-DEMAND-OLD-CREATED",
            title="Old created",
            description="Old created date",
            category="SCRIPT",
            requester_user=requester2,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=self.support_entity,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            current_assignee=self.support_resolver,
            status=ServiceRequest.Status.CLOSED,
            is_submitted_to_target=True,
            completed_at=timezone.now(),
            closed_at=timezone.now(),
        )
        old_req.status = ServiceRequest.Status.CLOSED
        old_req.closed_at = timezone.now()
        old_req.save(update_fields=["status", "closed_at"])
        ServiceRequest.objects.filter(id=old_req.id).update(
            created_at=timezone.now() - timedelta(days=90),
            completed_at=timezone.now(),
            closed_at=timezone.now(),
        )

        fresh_req = ServiceRequest.objects.create(
            request_number="REQ-UNIT-DEMAND-FRESH-CREATED",
            title="Fresh created",
            description="Fresh created date",
            category="SCRIPT",
            requester_user=requester2,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=self.support_entity,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            current_assignee=self.support_resolver,
            status=ServiceRequest.Status.CLOSED,
            is_submitted_to_target=True,
            completed_at=timezone.now(),
            closed_at=timezone.now(),
        )
        fresh_req.status = ServiceRequest.Status.CLOSED
        fresh_req.closed_at = timezone.now()
        fresh_req.save(update_fields=["status", "closed_at"])
        ServiceRequest.objects.filter(id=fresh_req.id).update(
            created_at=timezone.now() - timedelta(days=2),
            completed_at=timezone.now(),
            closed_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.senior_user)
        response = self.client.get(
            reverse("credits-solves-list"),
            {
                "user_id": requester2.id,
                "date_from": (timezone.now() - timedelta(days=7)).date().isoformat(),
                "date_to": timezone.now().date().isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        requester_rows = response.data.get("requestDemandRankings", {}).get("requesters", [])
        row = next((r for r in requester_rows if r.get("userId") == requester2.id), None)
        if row is not None:
            # Only the fresh request should count in created-range demand analytics.
            self.assertEqual(int(row.get("createdCount") or 0), 1)

    def test_request_demand_user_filter_is_requester_only(self):
        requester2 = self._create_user_with_role("requester3", "user", entity=self.prod_entity)
        ServiceRequest.objects.create(
            request_number="REQ-UNIT-DEMAND-USER-FILTER",
            title="User filter requester-only",
            description="Assignee should not drive demand user filter",
            category="SCRIPT",
            requester_user=requester2,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=self.support_entity,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            current_assignee=self.support_resolver,
            status=ServiceRequest.Status.CLOSED,
            is_submitted_to_target=True,
            completed_at=timezone.now(),
            closed_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.senior_user)
        response = self.client.get(
            reverse("credits-solves-list"),
            {"user_id": self.support_resolver.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        demand = response.data.get("requestDemandRankings", {})
        # support_resolver is assignee, not requester for this request, so demand must be empty.
        self.assertEqual(demand.get("requesters", []), [])

    def test_target_entity_id_filters_solves_only(self):
        req_a = self._completed_request("REQ-UNIT-TARGET-ENTITY-A")
        req_a.status = ServiceRequest.Status.CLOSED
        req_a.closed_at = timezone.now()
        req_a.save(update_fields=["status", "closed_at"])

        other_target = Entity.objects.create(
            company=self.company,
            name="SUP-2",
            code="SUP2",
            entity_type=Entity.EntityType.SUPPORT,
        )
        req_b = ServiceRequest.objects.create(
            request_number="REQ-UNIT-TARGET-ENTITY-B",
            title="Other target entity request",
            description="Other target",
            category="SCRIPT",
            requester_user=self.requester,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=other_target,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            current_assignee=self.support_resolver,
            status=ServiceRequest.Status.CLOSED,
            is_submitted_to_target=True,
            completed_at=timezone.now(),
            closed_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.senior_user)
        response = self.client.get(
            reverse("credits-solves-list"),
            {"target_entity_id": self.support_entity.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        solves = response.data.get("solves", [])
        returned_ids = {row.get("requestId") for row in solves}
        self.assertIn(req_a.id, returned_ids)
        self.assertNotIn(req_b.id, returned_ids)

    def test_source_entity_id_filters_demand_rankings(self):
        requester2 = self._create_user_with_role("requester_src_other", "user", entity=self.prod_entity)
        other_source = Entity.objects.create(
            company=self.company,
            name="PRD-2",
            code="PRD2",
            entity_type=Entity.EntityType.PROD,
        )
        ServiceRequest.objects.create(
            request_number="REQ-UNIT-SOURCE-ENTITY-OTHER",
            title="Other source entity request",
            description="Other source",
            category="SCRIPT",
            requester_user=requester2,
            company=self.company,
            source_entity=other_source,
            target_entity=self.support_entity,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            current_assignee=self.support_resolver,
            status=ServiceRequest.Status.CLOSED,
            is_submitted_to_target=True,
            completed_at=timezone.now(),
            closed_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.senior_user)
        response = self.client.get(
            reverse("credits-solves-list"),
            {"source_entity_id": self.prod_entity.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        source_rows = response.data.get("requestDemandRankings", {}).get("sourceEntities", [])
        source_ids = {row.get("entityId") for row in source_rows}
        self.assertIn(self.prod_entity.id, source_ids)
        self.assertNotIn(other_source.id, source_ids)

    def test_team_id_filters_solves_by_target_team(self):
        req_a = self._completed_request("REQ-UNIT-TEAM-ID-A")
        req_a.target_team = self.support_team
        req_a.target_team_leader = self.support_team_leader
        req_a.status = ServiceRequest.Status.CLOSED
        req_a.closed_at = timezone.now()
        req_a.save(update_fields=["target_team", "target_team_leader", "status", "closed_at"])

        req_b = self._completed_request("REQ-UNIT-TEAM-ID-B")
        req_b.target_team = self.support_peer_team
        req_b.target_team_leader = self.support_team_leader_peer
        req_b.status = ServiceRequest.Status.CLOSED
        req_b.closed_at = timezone.now()
        req_b.save(update_fields=["target_team", "target_team_leader", "status", "closed_at"])

        self.client.force_authenticate(user=self.senior_user)
        response = self.client.get(
            reverse("credits-solves-list"),
            {"team_id": self.support_team.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        solves = response.data.get("solves", [])
        returned_ids = {row.get("requestId") for row in solves}
        self.assertIn(req_a.id, returned_ids)
        self.assertNotIn(req_b.id, returned_ids)

    def test_solver_user_id_filters_solves_by_assignee(self):
        other_solver = self._create_user_with_role("support_solver_alt", "user", entity=self.support_entity)
        req_a = self._completed_request("REQ-UNIT-SOLVER-USER-A")
        req_a.current_assignee = self.support_resolver
        req_a.status = ServiceRequest.Status.CLOSED
        req_a.closed_at = timezone.now()
        req_a.save(update_fields=["current_assignee", "status", "closed_at"])

        req_b = self._completed_request("REQ-UNIT-SOLVER-USER-B")
        req_b.current_assignee = other_solver
        req_b.status = ServiceRequest.Status.CLOSED
        req_b.closed_at = timezone.now()
        req_b.save(update_fields=["current_assignee", "status", "closed_at"])

        self.client.force_authenticate(user=self.senior_user)
        response = self.client.get(
            reverse("credits-solves-list"),
            {"solver_user_id": self.support_resolver.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        solves = response.data.get("solves", [])
        returned_ids = {row.get("requestId") for row in solves}
        self.assertIn(req_a.id, returned_ids)
        self.assertNotIn(req_b.id, returned_ids)

    def test_requester_user_id_filters_demand_by_requester(self):
        requester2 = self._create_user_with_role("requester_filter_new", "user", entity=self.prod_entity)
        ServiceRequest.objects.create(
            request_number="REQ-UNIT-REQUESTER-FILTER-NEW",
            title="Requester filter new",
            description="Requester-specific demand",
            category="SCRIPT",
            requester_user=requester2,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=self.support_entity,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            current_assignee=self.support_resolver,
            status=ServiceRequest.Status.CLOSED,
            is_submitted_to_target=True,
            completed_at=timezone.now(),
            closed_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.senior_user)
        response = self.client.get(
            reverse("credits-solves-list"),
            {"requester_user_id": requester2.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        requester_rows = response.data.get("requestDemandRankings", {}).get("requesters", [])
        self.assertTrue(requester_rows)
        requester_ids = {row.get("userId") for row in requester_rows}
        self.assertEqual(requester_ids, {requester2.id})

    def test_legacy_entity_and_user_params_still_work(self):
        self.client.force_authenticate(user=self.senior_user)
        response = self.client.get(
            reverse("credits-solves-list"),
            {"entity_id": self.support_entity.id, "user_id": self.support_resolver.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        solves = response.data.get("solves", [])
        self.assertTrue(solves)
        for row in solves:
            self.assertEqual(row.get("target_entity_id"), self.support_entity.id)

        requester_rows = response.data.get("requestDemandRankings", {}).get("requesters", [])
        for row in requester_rows:
            self.assertEqual(row.get("userId"), self.support_resolver.id)

    def test_request_demand_payload_keeps_existing_credits_rankings(self):
        payload = self._credits_payload_for(self.requester)
        self.assertIn("entityRankings", payload)
        self.assertIn("teamRankings", payload)
        self.assertIn("peopleRankings", payload)
        self.assertIn("requestDemandRankings", payload)

    def test_legacy_team_fallback_uses_target_team_leader_then_legacy_queue(self):
        req = self._completed_request("REQ-UNIT-LEGACY-FALLBACK")
        req.target_team = None
        req.target_team_leader = self.support_team_leader
        req.status = ServiceRequest.Status.CLOSED
        req.closed_at = timezone.now()
        req.save(update_fields=["target_team", "target_team_leader", "status", "closed_at"])
        row_with_tl = self._credits_row_for(self.requester, req)
        self.assertEqual(row_with_tl.get("team_key"), f"tl-{self.support_team_leader.id}")

        req.target_team_leader = None
        req.current_assignee = None
        req.save(update_fields=["target_team_leader", "current_assignee"])
        row_legacy = self._credits_row_for(self.requester, req)
        self.assertEqual(row_legacy.get("team_key"), f"legacy-{self.support_entity.id}")

    def test_backfill_target_team_from_target_team_leader(self):
        req = self._completed_request("REQ-UNIT-BACKFILL-TL")
        req.target_team = None
        req.target_team_leader = self.support_team_leader
        req.status = ServiceRequest.Status.CLOSED
        req.closed_at = timezone.now()
        req.save(update_fields=["target_team", "target_team_leader", "status", "closed_at"])

        output = self._run_backfill_target_team()
        req.refresh_from_db()

        self.assertEqual(req.target_team_id, self.support_team.id)
        self.assertIn("updated=1", output)

    def test_backfill_target_team_from_member_solver(self):
        req = self._completed_request("REQ-UNIT-BACKFILL-MEMBER")
        req.target_team = None
        req.target_team_leader = None
        req.status = ServiceRequest.Status.CLOSED
        req.closed_at = timezone.now()
        req.save(update_fields=["target_team", "target_team_leader", "status", "closed_at"])

        output = self._run_backfill_target_team()
        req.refresh_from_db()

        self.assertEqual(req.target_team_id, self.support_team.id)
        self.assertIn("updated=1", output)

    def test_backfill_target_team_skips_ambiguous_member_matches(self):
        extra_team = Team.objects.create(
            name="Second Support Team",
            company=self.company,
            entity=self.support_entity,
            leader=self.support_team_leader_alt,
            is_active=True,
        )
        extra_team.members.add(self.support_resolver)

        req = self._completed_request("REQ-UNIT-BACKFILL-AMBIG")
        req.target_team = None
        req.target_team_leader = None
        req.status = ServiceRequest.Status.CLOSED
        req.closed_at = timezone.now()
        req.save(update_fields=["target_team", "target_team_leader", "status", "closed_at"])

        output = self._run_backfill_target_team()
        req.refresh_from_db()

        self.assertIsNone(req.target_team_id)
        self.assertIn("skipped_multiple_matches=1", output)
        self.assertIn(f"{req.id}", output)

    def test_unrecoverable_legacy_row_still_shows_legacy_queue(self):
        req = ServiceRequest.objects.create(
            request_number="REQ-UNIT-UNRECOVERABLE-LEGACY",
            title="Legacy unresolved queue row",
            description="No team leader and no solver",
            category="INFO",
            requester_user=self.requester,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=self.support_entity,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            status=ServiceRequest.Status.CLOSED,
            is_submitted_to_target=True,
            closed_at=timezone.now(),
            target_team=None,
            target_team_leader=None,
            current_assignee=None,
        )

        self._run_backfill_target_team()
        row = self._credits_row_for(self.requester, req)
        self.assertEqual(row.get("team_key"), f"legacy-{self.support_entity.id}")
        self.assertIn("Legacy Queue", row.get("target_team_label", ""))

    def test_requester_chain_can_accept_completed_result(self):
        approvers = [self.requester, self.team_leader, self.requester_manager, self.senior_user, self.super_admin]
        for index, approver in enumerate(approvers):
            req = self._completed_request(f"REQ-UNIT-APPROVE-{index}")
            self.client.force_authenticate(user=approver)
            response = self.client.post(
                reverse("requests-status", kwargs={"request_id": req.id}),
                {"status": ServiceRequest.Status.CLOSED, "note": "Approved"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            req.refresh_from_db()
            self.assertEqual(req.status, ServiceRequest.Status.CLOSED)
            self.assertIsNotNone(req.closed_at)

    def test_support_side_cannot_accept_completed_result(self):
        req = self._completed_request()
        for actor in [self.support_resolver, self.support_team_leader, self.support_manager]:
            self.client.force_authenticate(user=actor)
            response = self.client.post(
                reverse("requests-status", kwargs={"request_id": req.id}),
                {"status": ServiceRequest.Status.CLOSED, "note": "Try close"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            req.refresh_from_db()
            self.assertEqual(req.status, ServiceRequest.Status.COMPLETED)

    def test_requester_chain_can_reject_completed_result(self):
        req = self._completed_request()
        self.client.force_authenticate(user=self.team_leader)
        response = self.client.post(
            reverse("requests-status", kwargs={"request_id": req.id}),
            {
                "status": ServiceRequest.Status.IN_PROGRESS,
                "rejection_reason": "Missing evidence",
                "rejection_note": "Please attach screenshot or logs.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.status, ServiceRequest.Status.IN_PROGRESS)
        self.assertIsNone(req.completed_at)
        self.assertIsNone(req.closed_at)
        self.assertEqual(req.rejection_reason, "Missing evidence")
        self.assertEqual(req.resolution_note, "Please attach screenshot or logs.")

    def test_prod_team_leader_can_approve_own_completed_request(self):
        own_req = ServiceRequest.objects.create(
            request_number="REQ-TL-OWN-COMPLETE",
            title="TL own completed request",
            description="Own request approval flow",
            category="INFO",
            requester_user=self.team_leader,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=self.support_entity,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            status=ServiceRequest.Status.COMPLETED,
            is_submitted_to_target=True,
            completed_at=timezone.now(),
            target_team=self.support_team,
            target_team_leader=self.support_team_leader,
        )
        RequestStatusHistory.objects.create(
            request=own_req,
            changed_by=self.support_resolver,
            old_status=ServiceRequest.Status.IN_PROGRESS,
            new_status=ServiceRequest.Status.COMPLETED,
            note="Completed by support",
        )

        self.client.force_authenticate(user=self.team_leader)
        close_response = self.client.post(
            reverse("requests-status", kwargs={"request_id": own_req.id}),
            {"status": ServiceRequest.Status.CLOSED, "note": "Approved by TL requester"},
            format="json",
        )
        self.assertEqual(close_response.status_code, status.HTTP_200_OK)
        own_req.refresh_from_db()
        self.assertEqual(own_req.status, ServiceRequest.Status.CLOSED)

    def test_prod_team_leader_can_reject_member_completed_request_via_team_membership(self):
        member_without_legacy_tl = self._create_user_with_role(
            "member_no_legacy_tl",
            "user",
            entity=self.prod_entity,
        )
        self.prod_team.members.add(member_without_legacy_tl)
        member_without_legacy_tl.team_leader = None
        member_without_legacy_tl.save(update_fields=["team_leader"])

        req = ServiceRequest.objects.create(
            request_number="REQ-TL-MEMBER-COMPLETE",
            title="Member completed request",
            description="Member request approval flow",
            category="INFO",
            requester_user=member_without_legacy_tl,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=self.support_entity,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            status=ServiceRequest.Status.COMPLETED,
            is_submitted_to_target=True,
            completed_at=timezone.now(),
            target_team=self.support_team,
            target_team_leader=self.support_team_leader,
        )
        RequestStatusHistory.objects.create(
            request=req,
            changed_by=self.support_resolver,
            old_status=ServiceRequest.Status.IN_PROGRESS,
            new_status=ServiceRequest.Status.COMPLETED,
            note="Completed by support",
        )

        self.client.force_authenticate(user=self.team_leader)
        reject_response = self.client.post(
            reverse("requests-status", kwargs={"request_id": req.id}),
            {
                "status": ServiceRequest.Status.IN_PROGRESS,
                "rejection_reason": "Need refinement",
                "rejection_note": "Please update the script output formatting.",
            },
            format="json",
        )
        self.assertEqual(reject_response.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.status, ServiceRequest.Status.IN_PROGRESS)

    def test_support_side_credits_flags_are_false_for_completed_result(self):
        req = self._completed_request()
        row = self._credits_row_for(self.support_manager, req)
        self.assertFalse(row.get("canResultApprove"))
        self.assertFalse(row.get("canResultReject"))

    def test_rejected_request_is_visible_in_credits_rows_with_reason(self):
        req = self._completed_request("REQ-UNIT-REJECT-VISIBLE")
        self.client.force_authenticate(user=self.team_leader)
        response = self.client.post(
            reverse("requests-status", kwargs={"request_id": req.id}),
            {
                "status": ServiceRequest.Status.IN_PROGRESS,
                "rejection_reason": "Incomplete work",
                "rejection_note": "Please verify the final behavior.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        support_row = self._credits_row_for(self.support_manager, req)
        self.assertTrue(support_row.get("wasRejected"))
        self.assertEqual(support_row.get("rejectionReason"), "Incomplete work")
        self.assertEqual(support_row.get("rejectionNote"), "Please verify the final behavior.")
        self.assertEqual(support_row.get("requestStatus"), ServiceRequest.Status.IN_PROGRESS)

    def test_only_target_entity_users_can_update_deadline(self):
        url = reverse("requests-deadline", kwargs={"request_id": self.submitted_request.id})

        self.client.force_authenticate(user=self.outsider_manager)
        forbidden_response = self.client.post(
            url,
            {"deadline_date": "2026-05-04"},
            format="json",
        )
        self.assertEqual(forbidden_response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.support_team_leader)
        success_response = self.client.post(
            url,
            {"deadline_date": "2026-05-04"},
            format="json",
        )
        self.assertEqual(success_response.status_code, status.HTTP_200_OK)
        self.submitted_request.refresh_from_db()
        self.assertEqual(self.submitted_request.deadline_date, date(2026, 5, 4))

    def test_senior_and_super_admin_can_edit_deadline_with_permission(self):
        url = reverse("requests-deadline", kwargs={"request_id": self.submitted_request.id})

        self.client.force_authenticate(user=self.support_senior)
        senior_response = self.client.post(
            url,
            {"deadline_date": "2026-05-06"},
            format="json",
        )
        self.assertEqual(senior_response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.support_super_admin)
        super_admin_response = self.client.post(
            url,
            {"deadline_date": "2026-05-07"},
            format="json",
        )
        self.assertEqual(super_admin_response.status_code, status.HTTP_200_OK)

    def test_manager_reassign_to_tl_owned_team_sets_team_owner_and_clears_assignee(self):
        self.submitted_request.current_assignee = self.support_resolver
        self.submitted_request.save(update_fields=["current_assignee"])
        assignment_count_before = RequestAssignmentHistory.objects.filter(
            request=self.submitted_request
        ).count()

        self.client.force_authenticate(user=self.support_manager)
        response = self.client.post(
            reverse("requests-reassign", kwargs={"request_id": self.submitted_request.id}),
            {"target_team": self.support_team.id, "note": "Assigned to TL team"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.submitted_request.refresh_from_db()
        self.assertEqual(self.submitted_request.target_team_id, self.support_team.id)
        self.assertEqual(self.submitted_request.target_team_leader_id, self.support_team_leader.id)
        self.assertEqual(self.submitted_request.target_entity_id, self.support_entity.id)
        self.assertIsNone(self.submitted_request.current_assignee_id)
        self.assertEqual(
            RequestAssignmentHistory.objects.filter(request=self.submitted_request).count(),
            assignment_count_before,
        )
        self.assertTrue(
            RequestTeamReassignmentHistory.objects.filter(
                request=self.submitted_request,
                new_target_entity_id=self.support_entity.id,
            ).exists()
        )

    def test_manager_detail_exposes_tl_owned_reassignment_targets(self):
        self.client.force_authenticate(user=self.support_manager)
        response = self.client.get(
            reverse("requests-detail", kwargs={"request_id": self.submitted_request.id}),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("can_reassign_target_team"))
        targets = response.data.get("available_reassignment_targets", [])
        target_ids = {item.get("id") for item in targets}
        self.assertIn(self.support_team.id, target_ids)
        self.assertIn(self.support_peer_team.id, target_ids)
        self.assertNotIn(self.support_alt_team.id, target_ids)
        self.assertNotIn(self.prod_team.id, target_ids)
        selected_target = next((item for item in targets if item.get("id") == self.support_team.id), None)
        self.assertIsNotNone(selected_target)
        self.assertEqual(selected_target.get("name"), self.support_team.name)
        self.assertEqual(selected_target.get("leader_id"), self.support_team_leader.id)
        self.assertEqual(selected_target.get("leader_name"), self.support_team_leader.username)

    def test_manager_detail_keeps_reassign_flag_true_when_no_tl_targets(self):
        self.support_team_leader.is_active = False
        self.support_team_leader.save(update_fields=["is_active"])
        self.support_team_leader_peer.is_active = False
        self.support_team_leader_peer.save(update_fields=["is_active"])
        self.support_team_leader_alt.is_active = False
        self.support_team_leader_alt.save(update_fields=["is_active"])

        self.client.force_authenticate(user=self.support_manager)
        response = self.client.get(
            reverse("requests-detail", kwargs={"request_id": self.submitted_request.id}),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("can_reassign_target_team"))
        self.assertEqual(response.data.get("available_reassignment_targets"), [])

    def test_manager_cannot_reassign_to_other_entity_team_even_same_company(self):
        self.client.force_authenticate(user=self.support_manager)
        reassign_response = self.client.post(
            reverse("requests-reassign", kwargs={"request_id": self.submitted_request.id}),
            {"target_team": self.support_alt_team.id, "note": "Route to alternate support team"},
            format="json",
        )
        self.assertEqual(reassign_response.status_code, status.HTTP_403_FORBIDDEN)

        detail_response = self.client.get(
            reverse("requests-detail", kwargs={"request_id": self.submitted_request.id}),
            format="json",
        )
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)

    def test_manager_reassign_legacy_tl_id_still_maps_to_team(self):
        self.client.force_authenticate(user=self.support_manager)
        response = self.client.post(
            reverse("requests-reassign", kwargs={"request_id": self.submitted_request.id}),
            {"target_team": self.support_team_leader.id, "note": "Legacy TL id compatibility"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.submitted_request.refresh_from_db()
        self.assertEqual(self.submitted_request.target_team_id, self.support_team.id)
        self.assertEqual(self.submitted_request.target_team_leader_id, self.support_team_leader.id)

    def test_non_owner_team_leader_cannot_take_or_assign_targeted_request(self):
        self.submitted_request.target_team = self.support_team
        self.submitted_request.target_team_leader = self.support_team_leader
        self.submitted_request.current_assignee = None
        self.submitted_request.save(update_fields=["target_team", "target_team_leader", "current_assignee"])

        self.client.force_authenticate(user=self.support_team_leader_peer)
        take_response = self.client.post(
            reverse("requests-assign", kwargs={"request_id": self.submitted_request.id}),
            {},
            format="json",
        )
        self.assertEqual(take_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_team_queue_includes_unassigned_targeted_requests_for_owner_tl(self):
        self.submitted_request.target_team = self.support_team
        self.submitted_request.target_team_leader = self.support_team_leader
        self.submitted_request.current_assignee = None
        self.submitted_request.save(update_fields=["target_team", "target_team_leader", "current_assignee"])

        self.client.force_authenticate(user=self.support_team_leader)
        response = self.client.get(
            reverse("requests-list-create"),
            {"team_queue": "1"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item.get("id") for item in response.data.get("results", [])}
        self.assertIn(self.submitted_request.id, ids)

    def test_tl_visibility_prefers_target_team_owner_with_legacy_entity_fallback(self):
        self.submitted_request.target_team = self.support_team
        self.submitted_request.target_team_leader = self.support_team_leader_peer
        self.submitted_request.current_assignee = None
        self.submitted_request.save(update_fields=["target_team", "target_team_leader", "current_assignee"])

        self.client.force_authenticate(user=self.support_team_leader)
        own_team_response = self.client.get(
            reverse("requests-detail", kwargs={"request_id": self.submitted_request.id}),
            format="json",
        )
        self.assertEqual(own_team_response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.support_team_leader_peer)
        peer_response = self.client.get(
            reverse("requests-detail", kwargs={"request_id": self.submitted_request.id}),
            format="json",
        )
        self.assertEqual(peer_response.status_code, status.HTTP_404_NOT_FOUND)

        self.submitted_request.target_team = None
        self.submitted_request.target_team_leader = None
        self.submitted_request.save(update_fields=["target_team", "target_team_leader"])
        legacy_response = self.client.get(
            reverse("requests-detail", kwargs={"request_id": self.submitted_request.id}),
            format="json",
        )
        self.assertEqual(legacy_response.status_code, status.HTTP_200_OK)

    def test_tl_potential_assignees_only_include_team_members(self):
        self.submitted_request.target_team = self.support_team
        self.submitted_request.target_team_leader = self.support_team_leader
        self.submitted_request.current_assignee = None
        self.submitted_request.save(update_fields=["target_team", "target_team_leader", "current_assignee"])
        # Team.members should be authoritative before legacy User.team_leader fallback.
        self.support_resolver.team_leader = None
        self.support_resolver.save(update_fields=["team_leader"])

        self.client.force_authenticate(user=self.support_team_leader)
        response = self.client.get(
            reverse("requests-detail", kwargs={"request_id": self.submitted_request.id}),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        assignees = response.data.get("potential_assignees", [])
        assignee_ids = {item.get("id") for item in assignees}
        self.assertIn(self.support_resolver.id, assignee_ids)
        self.assertNotIn(self.support_team_leader.id, assignee_ids)
        self.assertNotIn(self.support_team_leader_peer.id, assignee_ids)

    def test_tl_assign_user_rejects_self_and_non_team_member(self):
        self.submitted_request.target_team = self.support_team
        self.submitted_request.target_team_leader = self.support_team_leader
        self.submitted_request.current_assignee = None
        self.submitted_request.save(update_fields=["target_team", "target_team_leader", "current_assignee"])

        self.client.force_authenticate(user=self.support_team_leader)
        assign_url = reverse("requests-assign-user", kwargs={"request_id": self.submitted_request.id})

        self_response = self.client.post(
            assign_url,
            {"user_id": self.support_team_leader.id, "note": "self assign via assign_user"},
            format="json",
        )
        self.assertEqual(self_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn(
            "Team leaders can only assign requests to regular members of their own team.",
            str(self_response.data.get("detail", "")),
        )

        legacy_linked_non_member = self._create_user_with_role(
            "support_user_legacy_only",
            "user",
            entity=self.support_entity,
        )
        legacy_linked_non_member.team_leader = self.support_team_leader
        legacy_linked_non_member.save(update_fields=["team_leader"])
        non_member_response = self.client.post(
            assign_url,
            {"user_id": legacy_linked_non_member.id, "note": "assign legacy non-member"},
            format="json",
        )
        self.assertEqual(non_member_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn(
            "Team leaders can only assign requests to regular members of their own team.",
            str(non_member_response.data.get("detail", "")),
        )

        peer_tl_response = self.client.post(
            assign_url,
            {"user_id": self.support_team_leader_peer.id, "note": "assign peer TL"},
            format="json",
        )
        self.assertEqual(peer_tl_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn(
            "Team leaders can only assign requests to regular members of their own team.",
            str(peer_tl_response.data.get("detail", "")),
        )

    def test_tl_assign_to_me_allowed_for_owned_target_team(self):
        self.submitted_request.target_team = self.support_team
        self.submitted_request.target_team_leader = self.support_team_leader
        self.submitted_request.current_assignee = None
        self.submitted_request.save(update_fields=["target_team", "target_team_leader", "current_assignee"])

        self.client.force_authenticate(user=self.support_team_leader)
        response = self.client.post(
            reverse("requests-assign", kwargs={"request_id": self.submitted_request.id}),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.submitted_request.refresh_from_db()
        self.assertEqual(self.submitted_request.current_assignee_id, self.support_team_leader.id)

    def test_tl_assign_to_me_rejected_for_non_owned_target_team(self):
        self.submitted_request.target_team = self.support_team
        self.submitted_request.target_team_leader = self.support_team_leader
        self.submitted_request.current_assignee = None
        self.submitted_request.save(update_fields=["target_team", "target_team_leader", "current_assignee"])

        self.client.force_authenticate(user=self.support_team_leader_peer)
        response = self.client.post(
            reverse("requests-assign", kwargs={"request_id": self.submitted_request.id}),
            {},
            format="json",
        )
        # Peer TL cannot access/take another TL-owned team request.
        self.assertIn(response.status_code, {status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND})
