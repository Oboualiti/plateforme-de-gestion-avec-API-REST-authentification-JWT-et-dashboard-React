from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.entities.models import Entity
from apps.permissions_app.constants import PERMISSION_DEFINITIONS
from apps.permissions_app.models import AppPermission, UserPermissionOverride, UserRole
from apps.permissions_app.services import can_manage_any_users, get_effective_permission_keys
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
        manage_companies = AppPermission.objects.get(key="manage_companies")

        self.client.force_authenticate(user=self.super_admin)
        update_response = self.client.patch(
            reverse("admin-role-detail", kwargs={"role_id": self.role_user.id}),
            {"permission_keys": ["manage_companies", "view_own_requests"]},
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)

        UserPermissionOverride.objects.update_or_create(
            user=self.user,
            permission=manage_companies,
            defaults={"is_allowed": False, "reason": "temporary deny for test"},
        )
        self.assertNotIn("manage_companies", set(get_effective_permission_keys(self.user)))

        restore_response = self.client.post(
            reverse("admin-role-detail", kwargs={"role_id": self.role_user.id}),
            {},
            format="json",
        )
        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertIn("manage_companies", set(get_effective_permission_keys(self.user)))