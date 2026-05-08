from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.audit_logs.models import AdminAuditLog
from apps.entities.models import Entity
from apps.permissions_app.constants import PERMISSION_DEFINITIONS
from apps.permissions_app.models import (
    AppPermission,
    UserPermissionOverride,
    UserRequestPermissionOverride,
    UserRole,
)
from apps.permissions_app.services import can_manage_any_users, get_effective_permission_keys
from apps.requests_app.models import MainBranch, OperationalUnit, ServiceRequest
from apps.roles.models import Role
from apps.users.models import User


class PermissionModelTests(TestCase):
    def setUp(self):
        call_command("seed_roles_permissions")
        self.company = Company.objects.create(name="WMN", code="WMN")
        self.entity = Entity.objects.create(
            company=self.company,
            name="WMN1",
            code="WMN1",
            entity_type=Entity.EntityType.PROD,
        )

    def _create_user_with_role(self, username, role_key):
        user = User.objects.create_user(
            username=username,
            password="test12345",
            company=self.company,
            entity=self.entity,
        )
        role = Role.objects.get(key=role_key)
        UserRole.objects.create(user=user, role=role)
        return user

    def test_manager_defaults_use_unified_approve_permission(self):
        manager = self._create_user_with_role("manager1", "manager")
        keys = set(get_effective_permission_keys(manager))
        self.assertIn("approve_request", keys)
        self.assertNotIn("approve_request_tl", keys)
        self.assertNotIn("approve_request_mgr", keys)
        self.assertNotIn("approve_request_snr", keys)

    def test_user_permission_override_deny_takes_precedence(self):
        senior = self._create_user_with_role("senior1", "senior")
        permission = AppPermission.objects.get(key="assign_request")
        UserPermissionOverride.objects.create(
            user=senior,
            permission=permission,
            is_allowed=False,
            reason="Denied for test",
        )
        keys = set(get_effective_permission_keys(senior))
        self.assertNotIn("assign_request", keys)

    def test_manage_users_permission_scope_controls_admin_access(self):
        team_leader = self._create_user_with_role("tl1", "team_leader")
        manager = self._create_user_with_role("mgr2", "manager")
        self.assertFalse(can_manage_any_users(team_leader))
        self.assertTrue(can_manage_any_users(manager))


class RolePagePermissionTests(APITestCase):
    def setUp(self):
        call_command("seed_roles_permissions")
        self.company = Company.objects.create(name="WMN", code="WMN")
        self.other_company = Company.objects.create(name="VMS", code="VMS")
        self.prod_entity = Entity.objects.create(
            company=self.company,
            name="WMN1",
            code="WMN1",
            entity_type=Entity.EntityType.PROD,
        )
        self.prod_entity_other = Entity.objects.create(
            company=self.company,
            name="WMN2",
            code="WMN2",
            entity_type=Entity.EntityType.PROD,
        )
        self.other_company_entity = Entity.objects.create(
            company=self.other_company,
            name="VMS1",
            code="VMS1",
            entity_type=Entity.EntityType.PROD,
        )

        self.super_admin = self._create_user("super_admin_test", "super_admin", self.company, self.prod_entity)
        self.senior = self._create_user("senior_test", "senior", self.company, self.prod_entity)
        self.manager = self._create_user("manager_test", "manager", self.company, self.prod_entity)
        self.team_leader = self._create_user("tl_test", "team_leader", self.company, self.prod_entity)
        self.user = self._create_user("user_test", "user", self.company, self.prod_entity)
        self.user_other_entity = self._create_user("user_other_entity", "user", self.company, self.prod_entity_other)
        self.user_other_company = self._create_user(
            "user_other_company",
            "user",
            self.other_company,
            self.other_company_entity,
        )
        self.user.team_leader = self.team_leader
        self.user.save(update_fields=["team_leader"])
        branch_main = MainBranch.objects.create(name="WMN")
        branch_other = MainBranch.objects.create(name="VMS")
        self.unit_prod = OperationalUnit.objects.create(
            main_branch=branch_main,
            code=self.prod_entity.code,
            name=self.prod_entity.name,
            team_type=OperationalUnit.TeamType.PROD,
        )
        self.unit_prod_other = OperationalUnit.objects.create(
            main_branch=branch_other,
            code=self.other_company_entity.code,
            name=self.other_company_entity.name,
            team_type=OperationalUnit.TeamType.PROD,
        )
        self.unit_target = OperationalUnit.objects.create(
            main_branch=branch_main,
            code="WMN-SUP",
            name="WMN-SUP",
            team_type=OperationalUnit.TeamType.SUPPORT,
        )
        self.unit_target_other = OperationalUnit.objects.create(
            main_branch=branch_other,
            code="VMS-SUP",
            name="VMS-SUP",
            team_type=OperationalUnit.TeamType.SUPPORT,
        )
        ServiceRequest.objects.create(
            request_number="REQ-RPT-0001",
            title="Local request",
            description="local",
            category="INFO",
            requester_user=self.user,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=self.prod_entity_other,
            requester_unit=self.unit_prod,
            target_unit=self.unit_target,
            status=ServiceRequest.Status.NEW,
            is_submitted_to_target=True,
        )
        ServiceRequest.objects.create(
            request_number="REQ-RPT-0002",
            title="Other company request",
            description="other",
            category="INFO",
            requester_user=self.user_other_company,
            company=self.other_company,
            source_entity=self.other_company_entity,
            target_entity=self.other_company_entity,
            requester_unit=self.unit_prod_other,
            target_unit=self.unit_target_other,
            status=ServiceRequest.Status.NEW,
            is_submitted_to_target=True,
        )

        self.role_user = Role.objects.get(key="user")
        self.role_manager = Role.objects.get(key="manager")
        self.role_senior = Role.objects.get(key="senior")
        self.role_team_leader = Role.objects.get(key="team_leader")
        self.role_super_admin = Role.objects.get(key="super_admin")

    def _create_user(self, username, role_key, company, entity):
        user = User.objects.create_user(
            username=username,
            password="test12345",
            company=company,
            entity=entity,
        )
        role = Role.objects.get(key=role_key)
        UserRole.objects.create(user=user, role=role)
        return user

    def _allow_permission(self, user, permission_key):
        permission = AppPermission.objects.get(key=permission_key)
        UserPermissionOverride.objects.update_or_create(
            user=user,
            permission=permission,
            defaults={"is_allowed": True, "reason": "test-allow"},
        )

    def test_roles_page_access_matrix_by_role(self):
        url = reverse("admin-roles")
        allowed = [self.super_admin, self.senior, self.manager]
        denied = [self.team_leader, self.user]

        for actor in allowed:
            self.client.force_authenticate(user=actor)
            response = self.client.get(url)
            self.assertEqual(
                response.status_code,
                status.HTTP_200_OK,
                msg=f"{actor.username} should access roles page",
            )

        for actor in denied:
            self.client.force_authenticate(user=actor)
            response = self.client.get(url)
            self.assertEqual(
                response.status_code,
                status.HTTP_403_FORBIDDEN,
                msg=f"{actor.username} should be denied on roles page",
            )

    def test_roles_page_includes_actor_own_role_for_visibility(self):
        cases = [
            (self.manager, {"manager", "team_leader", "user"}),
            (self.team_leader, {"team_leader", "user"}),
            (self.user, {"user"}),
        ]

        for actor, expected_keys in cases:
            self.client.force_authenticate(user=actor)
            response = self.client.get(reverse("admin-roles"))
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            payload_keys = {item.get("key") for item in response.data.get("roles", [])}
            self.assertEqual(payload_keys, expected_keys)

    def test_roles_page_catalog_matches_new_permission_keys(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.get(reverse("admin-roles"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        keys = set(response.data.get("all_permission_keys", []))
        expected = {item["key"] for item in PERMISSION_DEFINITIONS}
        self.assertEqual(keys, expected)
        self.assertNotIn("approve_request_tl", keys)
        self.assertNotIn("approve_request_mgr", keys)
        self.assertNotIn("approve_request_snr", keys)
        self.assertNotIn("manage_users_team", keys)

    def test_senior_cannot_edit_senior_role_defaults(self):
        self.client.force_authenticate(user=self.senior)
        response = self.client.patch(
            reverse("admin-role-detail", kwargs={"role_id": self.role_senior.id}),
            {"permission_keys": ["view_own_requests"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_update_user_role_permissions_only_in_own_entity_scope(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.patch(
            reverse("admin-role-detail", kwargs={"role_id": self.role_user.id}),
            {"permission_keys": ["view_own_requests"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.user_other_entity.refresh_from_db()
        own_entity_keys = set(get_effective_permission_keys(self.user))
        other_entity_keys = set(get_effective_permission_keys(self.user_other_entity))
        self.assertIn("view_own_requests", own_entity_keys)
        self.assertNotIn("create_request", own_entity_keys)
        self.assertIn("create_request", other_entity_keys)

    def test_manager_cannot_edit_manager_role_permissions(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.patch(
            reverse("admin-role-detail", kwargs={"role_id": self.role_manager.id}),
            {"permission_keys": ["view_own_requests"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_cannot_edit_upward_role_permissions(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.patch(
            reverse("admin-role-detail", kwargs={"role_id": self.role_senior.id}),
            {"permission_keys": ["view_own_requests"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("You can only manage users below your role", response.data.get("detail", ""))

    def test_senior_can_edit_below_hierarchy_role_permissions(self):
        self.client.force_authenticate(user=self.senior)
        response = self.client.patch(
            reverse("admin-role-detail", kwargs={"role_id": self.role_manager.id}),
            {"permission_keys": ["view_company_entities", "view_own_requests"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_super_admin_can_assign_any_permission_to_any_role(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.patch(
            reverse("admin-role-detail", kwargs={"role_id": self.role_user.id}),
            {"permission_keys": ["manage_companies", "view_own_requests"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        updated_keys = set(
            AppPermission.objects.filter(permission_roles__role=self.role_user).values_list("key", flat=True)
        )
        self.assertIn("manage_companies", updated_keys)

    def test_manager_cannot_assign_permissions_not_in_own_effective_set(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.patch(
            reverse("admin-role-detail", kwargs={"role_id": self.role_user.id}),
            {"permission_keys": ["view_all_requests"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("You can only assign permissions you already have", response.data.get("detail", ""))

    def test_manager_cannot_assign_manage_companies_without_having_it(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.patch(
            reverse("admin-role-detail", kwargs={"role_id": self.role_user.id}),
            {"permission_keys": ["manage_companies"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("You can only assign permissions you already have", response.data.get("detail", ""))
    def test_manager_with_view_all_companies_sees_all_companies(self):
        self._allow_permission(self.manager, "view_all_companies")
        self.client.force_authenticate(user=self.manager)
        response = self.client.get(reverse("admin-companies"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        company_ids = {item["id"] for item in response.data.get("companies", [])}
        self.assertIn(self.company.id, company_ids)
        self.assertIn(self.other_company.id, company_ids)

    def test_manager_with_manage_companies_and_entities_can_manage_global_catalog(self):
        self._allow_permission(self.manager, "view_all_companies")
        self._allow_permission(self.manager, "manage_companies")
        self._allow_permission(self.manager, "manage_entities")
        self.client.force_authenticate(user=self.manager)

        create_company_response = self.client.post(
            reverse("admin-companies"),
            {"name": "NEW CO", "code": "NCO", "is_active": True},
            format="json",
        )
        self.assertEqual(create_company_response.status_code, status.HTTP_201_CREATED)
        new_company_id = create_company_response.data["id"]

        companies_response = self.client.get(reverse("admin-companies"))
        self.assertEqual(companies_response.status_code, status.HTTP_200_OK)
        company_ids = {item["id"] for item in companies_response.data.get("companies", [])}
        self.assertIn(new_company_id, company_ids)

        create_entity_response = self.client.post(
            reverse("admin-entities"),
            {
                "name": "NEW ENTITY",
                "code": "NENT",
                "entity_type": Entity.EntityType.SUPPORT,
                "company": new_company_id,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_entity_response.status_code, status.HTTP_201_CREATED)

        entities_response = self.client.get(reverse("admin-entities"))
        self.assertEqual(entities_response.status_code, status.HTTP_200_OK)
        entity_ids = {item["id"] for item in entities_response.data.get("entities", [])}
        self.assertIn(create_entity_response.data["id"], entity_ids)

    def test_manager_with_manage_company_entities_can_only_manage_own_company_entities(self):
        self._allow_permission(self.manager, "manage_company_entities")
        self.client.force_authenticate(user=self.manager)

        create_own_company_response = self.client.post(
            reverse("admin-entities"),
            {
                "name": "OWN COMPANY ENTITY",
                "code": "OWN-ENT",
                "entity_type": Entity.EntityType.SUPPORT,
                "company": self.company.id,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_own_company_response.status_code, status.HTTP_201_CREATED)

        create_other_company_response = self.client.post(
            reverse("admin-entities"),
            {
                "name": "OTHER COMPANY ENTITY",
                "code": "OTH-ENT",
                "entity_type": Entity.EntityType.SUPPORT,
                "company": self.other_company.id,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_other_company_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_deactivating_company_deactivates_all_its_entities(self):
        self.client.force_authenticate(user=self.super_admin)
        self.assertTrue(
            Entity.objects.filter(company_id=self.company.id).values_list("is_active", flat=True).first()
        )

        response = self.client.patch(
            reverse("admin-company-detail", kwargs={"company_id": self.company.id}),
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        own_company_statuses = list(
            Entity.objects.filter(company_id=self.company.id).values_list("is_active", flat=True)
        )
        other_company_statuses = list(
            Entity.objects.filter(company_id=self.other_company.id).values_list("is_active", flat=True)
        )
        self.assertTrue(own_company_statuses and all(status is False for status in own_company_statuses))
        self.assertTrue(other_company_statuses and all(status is True for status in other_company_statuses))

    def test_manager_with_view_global_reports_gets_global_report_totals(self):
        self._allow_permission(self.manager, "view_global_reports")
        self.client.force_authenticate(user=self.manager)
        response = self.client.get(reverse("admin-reports"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        total = sum(int(item.get("total") or 0) for item in response.data.get("requests_by_status", []))
        self.assertEqual(total, 2)

    def test_audit_logs_permissions_gate_and_filter_modules(self):
        AdminAuditLog.objects.create(actor=self.manager, module="roles", action="update_permissions")
        AdminAuditLog.objects.create(actor=self.manager, module="users", action="update")
        AdminAuditLog.objects.create(actor=self.user_other_company, module="roles", action="update_permissions")

        for permission_key in [
            "view_audit_logs",
            "view_user_audit_logs",
            "view_org_audit_logs",
        ]:
            permission = AppPermission.objects.get(key=permission_key)
            UserPermissionOverride.objects.update_or_create(
                user=self.manager,
                permission=permission,
                defaults={"is_allowed": False, "reason": "test-deny"},
            )
        self._allow_permission(self.manager, "view_access_audit_logs")
        self.client.force_authenticate(user=self.manager)
        response = self.client.get(reverse("admin-audit-logs"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        modules = {item["module"] for item in response.data}
        self.assertEqual(modules, {"roles"})

    def test_audit_logs_denied_without_any_log_permissions(self):
        for permission_key in [
            "view_audit_logs",
            "view_user_audit_logs",
            "view_access_audit_logs",
            "view_org_audit_logs",
        ]:
            permission = AppPermission.objects.get(key=permission_key)
            UserPermissionOverride.objects.update_or_create(
                user=self.manager,
                permission=permission,
                defaults={"is_allowed": False, "reason": "test-deny"},
            )
        self.client.force_authenticate(user=self.manager)
        response = self.client.get(reverse("admin-audit-logs"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_role_editability_matrix_patch_for_all_roles(self):
        url = lambda role_id: reverse("admin-role-detail", kwargs={"role_id": role_id})

        cases = [
            (self.senior, self.role_manager, status.HTTP_200_OK),
            (self.senior, self.role_team_leader, status.HTTP_200_OK),
            (self.senior, self.role_user, status.HTTP_200_OK),
            (self.senior, self.role_super_admin, status.HTTP_403_FORBIDDEN),
            (self.manager, self.role_team_leader, status.HTTP_200_OK),
            (self.manager, self.role_user, status.HTTP_200_OK),
            (self.manager, self.role_manager, status.HTTP_403_FORBIDDEN),
            (self.team_leader, self.role_user, status.HTTP_403_FORBIDDEN),
            (self.user, self.role_user, status.HTTP_403_FORBIDDEN),
            (self.super_admin, self.role_senior, status.HTTP_200_OK),
        ]

        for actor, target_role, expected_status in cases:
            self.client.force_authenticate(user=actor)
            response = self.client.patch(
                url(target_role.id),
                {"permission_keys": ["view_own_requests"]},
                format="json",
            )
            self.assertEqual(
                response.status_code,
                expected_status,
                msg=f"{actor.username} patch role {target_role.key} expected {expected_status} got {response.status_code}",
            )

    def test_super_admin_global_role_update_clears_stale_user_overrides(self):
        permission = AppPermission.objects.get(key="manage_entities")
        UserPermissionOverride.objects.create(
            user=self.team_leader,
            permission=permission,
            is_allowed=False,
            reason="stale deny",
        )
        self.assertNotIn("manage_entities", set(get_effective_permission_keys(self.team_leader)))

        self.client.force_authenticate(user=self.super_admin)
        response = self.client.patch(
            reverse("admin-role-detail", kwargs={"role_id": self.role_team_leader.id}),
            {"permission_keys": ["manage_entities"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.team_leader.refresh_from_db()
        self.assertIn("manage_entities", set(get_effective_permission_keys(self.team_leader)))
        self.assertFalse(
            UserPermissionOverride.objects.filter(
                user=self.team_leader,
                permission=permission,
            ).exists()
        )

    def test_role_restore_matrix_post_for_all_roles(self):
        url = lambda role_id: reverse("admin-role-detail", kwargs={"role_id": role_id})
        cases = [
            (self.super_admin, self.role_super_admin, status.HTTP_200_OK),
            (self.super_admin, self.role_manager, status.HTTP_200_OK),
            (self.senior, self.role_manager, status.HTTP_200_OK),
            (self.senior, self.role_user, status.HTTP_200_OK),
            (self.senior, self.role_senior, status.HTTP_403_FORBIDDEN),
            (self.manager, self.role_team_leader, status.HTTP_200_OK),
            (self.manager, self.role_user, status.HTTP_200_OK),
            (self.manager, self.role_manager, status.HTTP_403_FORBIDDEN),
            (self.team_leader, self.role_user, status.HTTP_403_FORBIDDEN),
            (self.user, self.role_user, status.HTTP_403_FORBIDDEN),
        ]

        for actor, target_role, expected_status in cases:
            self.client.force_authenticate(user=actor)
            response = self.client.post(url(target_role.id), {}, format="json")
            self.assertEqual(
                response.status_code,
                expected_status,
                msg=f"{actor.username} restore role {target_role.key} expected {expected_status} got {response.status_code}",
            )
    def test_restore_uses_latest_saved_role_defaults(self):
        self.client.force_authenticate(user=self.super_admin)

        save_defaults_response = self.client.patch(
            reverse("admin-role-default-detail", kwargs={"role_id": self.role_user.id}),
            {"permission_keys": ["manage_companies", "view_own_requests"]},
            format="json",
        )
        self.assertEqual(save_defaults_response.status_code, status.HTTP_200_OK)

        live_update_response = self.client.patch(
            reverse("admin-role-detail", kwargs={"role_id": self.role_user.id}),
            {"permission_keys": ["view_own_requests"]},
            format="json",
        )
        self.assertEqual(live_update_response.status_code, status.HTTP_200_OK)

        role_keys_after_live_update = set(
            AppPermission.objects.filter(permission_roles__role=self.role_user).values_list("key", flat=True)
        )
        self.assertNotIn("manage_companies", role_keys_after_live_update)

        restore_response = self.client.post(
            reverse("admin-role-detail", kwargs={"role_id": self.role_user.id}),
            {},
            format="json",
        )
        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertIn("manage_companies", set(get_effective_permission_keys(self.user)))


class RequestPermissionControlTests(APITestCase):
    def setUp(self):
        call_command("seed_roles_permissions")
        self.company = Company.objects.create(name="CMH", code="CMH")
        self.prod_entity = Entity.objects.create(
            company=self.company,
            name="CMH-PROD",
            code="CMHP",
            entity_type=Entity.EntityType.PROD,
        )
        self.support_entity = Entity.objects.create(
            company=self.company,
            name="CMH-SUP",
            code="CMHS",
            entity_type=Entity.EntityType.SUPPORT,
        )
        self.other_prod_entity = Entity.objects.create(
            company=self.company,
            name="CMH-PROD-2",
            code="CMHP2",
            entity_type=Entity.EntityType.PROD,
        )
        branch = MainBranch.objects.create(name="CMH")
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

        self.super_admin = self._create_user("superadmin_perm", "super_admin", self.prod_entity)
        self.manager_prod = self._create_user("manager_prod", "manager", self.prod_entity)
        self.manager_support = self._create_user("manager_support", "manager", self.support_entity)
        self.manager_other_prod = self._create_user("manager_other", "manager", self.other_prod_entity)
        self.normal_user = self._create_user("user_perm", "user", self.prod_entity)
        self.requester = self._create_user("requester_perm", "user", self.prod_entity)

        self.request_pending = ServiceRequest.objects.create(
            request_number="REQ-PERM-0001",
            title="Pending for approval",
            description="pending",
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
        self.request_submitted = ServiceRequest.objects.create(
            request_number="REQ-PERM-0002",
            title="Submitted ticket",
            description="submitted",
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
        self.request_hidden_by_default = ServiceRequest.objects.create(
            request_number="REQ-PERM-0003",
            title="Manager-only ticket",
            description="manager ticket",
            category="INFO",
            requester_user=self.manager_prod,
            company=self.company,
            source_entity=self.prod_entity,
            target_entity=self.support_entity,
            requester_unit=self.prod_unit,
            target_unit=self.support_unit,
            status=ServiceRequest.Status.NEW,
            is_submitted_to_target=True,
        )
        self.base_control_url = reverse(
            "admin-request-permission-control",
            kwargs={"user_id": self.manager_prod.id},
        )

    def _create_user(self, username, role_key, entity):
        user = User.objects.create_user(
            username=username,
            password="test12345",
            company=self.company,
            entity=entity,
        )
        role = Role.objects.get(key=role_key)
        UserRole.objects.create(user=user, role=role)
        return user

    def _set_override(self, user, request_obj, permission_key, allowed):
        UserRequestPermissionOverride.objects.update_or_create(
            user=user,
            request=request_obj,
            permission_key=permission_key,
            defaults={"allowed": allowed, "created_by": self.super_admin},
        )

    def test_super_admin_can_access_endpoint(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.get(
            self.base_control_url,
            {"permission_key": "request.view"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_non_super_admin_gets_403(self):
        self.client.force_authenticate(user=self.manager_prod)
        response = self.client.get(
            self.base_control_url,
            {"permission_key": "request.view"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_permission_key_returns_400(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.get(
            self.base_control_url,
            {"permission_key": "request.invalid"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_adding_request_view_allows_specific_request_visibility(self):
        self.client.force_authenticate(user=self.super_admin)
        save_response = self.client.post(
            reverse("admin-request-permission-control", kwargs={"user_id": self.normal_user.id}),
            {
                "permission_key": "request.view",
                "allowed_request_ids": [self.request_hidden_by_default.id],
                "denied_request_ids": [],
            },
            format="json",
        )
        self.assertEqual(save_response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.normal_user)
        list_response = self.client.get(reverse("requests-list-create"), format="json")
        ids = {item["id"] for item in list_response.data.get("results", [])}
        self.assertIn(self.request_hidden_by_default.id, ids)

    def test_denying_request_view_blocks_list_and_detail_access(self):
        self._set_override(self.manager_prod, self.request_submitted, "request.view", False)
        self.client.force_authenticate(user=self.manager_prod)

        list_response = self.client.get(reverse("requests-list-create"), format="json")
        ids = {item["id"] for item in list_response.data.get("results", [])}
        self.assertNotIn(self.request_submitted.id, ids)

        detail_response = self.client.get(
            reverse("requests-detail", kwargs={"request_id": self.request_submitted.id}),
            format="json",
        )
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_request_assign_allow_and_deny_are_request_scoped(self):
        self._set_override(self.manager_support, self.request_submitted, "request.assign", True)
        self._set_override(self.manager_support, self.request_pending, "request.assign", False)
        self.client.force_authenticate(user=self.manager_support)

        allowed_response = self.client.post(
            reverse("requests-assign", kwargs={"request_id": self.request_submitted.id}),
            {},
            format="json",
        )
        self.assertEqual(allowed_response.status_code, status.HTTP_200_OK)

        denied_response = self.client.post(
            reverse("requests-assign", kwargs={"request_id": self.request_pending.id}),
            {},
            format="json",
        )
        self.assertEqual(denied_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_request_approve_can_be_granted_for_specific_request(self):
        self._set_override(self.manager_other_prod, self.request_pending, "request.approve", True)
        self._set_override(self.manager_other_prod, self.request_pending, "request.view", True)
        self.client.force_authenticate(user=self.manager_other_prod)
        response = self.client.post(
            reverse("requests-status", kwargs={"request_id": self.request_pending.id}),
            {"status": ServiceRequest.Status.ACCEPTED, "note": "override approve"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_deny_request_update_status_blocks_status_change(self):
        self._set_override(self.manager_support, self.request_submitted, "request.update_status", False)
        self.client.force_authenticate(user=self.manager_support)
        response = self.client.post(
            reverse("requests-status", kwargs={"request_id": self.request_submitted.id}),
            {"status": ServiceRequest.Status.ACCEPTED, "note": "deny"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_post_save_does_not_create_duplicate_overrides(self):
        self.client.force_authenticate(user=self.super_admin)
        save_url = reverse("admin-request-permission-control", kwargs={"user_id": self.manager_prod.id})
        payload = {
            "permission_key": "request.assign",
            "allowed_request_ids": [self.request_submitted.id],
            "denied_request_ids": [self.request_pending.id],
        }
        first_response = self.client.post(save_url, payload, format="json")
        second_response = self.client.post(save_url, payload, format="json")
        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            UserRequestPermissionOverride.objects.filter(
                user=self.manager_prod,
                permission_key="request.assign",
            ).count(),
            2,
        )

    def test_normal_role_permission_still_works_when_no_override_exists(self):
        self.client.force_authenticate(user=self.manager_support)
        response = self.client.post(
            reverse("requests-assign", kwargs={"request_id": self.request_submitted.id}),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
