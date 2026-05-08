from django.test import TestCase
from datetime import date
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
            {"target_team": self.support_team_leader.id, "note": "Assigned to TL team"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.submitted_request.refresh_from_db()
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

    def test_tl_visibility_prefers_target_team_owner_with_legacy_entity_fallback(self):
        self.submitted_request.target_team_leader = self.support_team_leader
        self.submitted_request.current_assignee = None
        self.submitted_request.save(update_fields=["target_team_leader", "current_assignee"])

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

        self.submitted_request.target_team_leader = None
        self.submitted_request.save(update_fields=["target_team_leader"])
        legacy_response = self.client.get(
            reverse("requests-detail", kwargs={"request_id": self.submitted_request.id}),
            format="json",
        )
        self.assertEqual(legacy_response.status_code, status.HTTP_200_OK)

    def test_tl_potential_assignees_only_include_team_members(self):
        self.submitted_request.target_team_leader = self.support_team_leader
        self.submitted_request.current_assignee = None
        self.submitted_request.save(update_fields=["target_team_leader", "current_assignee"])

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
