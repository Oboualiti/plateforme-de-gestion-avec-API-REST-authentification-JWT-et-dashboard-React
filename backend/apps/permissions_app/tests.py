from django.test import TestCase

# Create your tests here.
from django.core.management import call_command
from django.test import TestCase

from apps.companies.models import Company
from apps.entities.models import Entity
from apps.permissions_app.models import AppPermission, UserPermissionOverride, UserRole
from apps.permissions_app.services import (
    can_manage_any_users,
    get_effective_permission_keys,
)
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
