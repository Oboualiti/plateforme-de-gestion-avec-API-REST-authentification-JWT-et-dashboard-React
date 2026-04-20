# Real Users Permission Matrix: EMD Request Management System

This matrix shows effective permissions for each **real seeded user** based on their assigned role.

## Users and Assigned Roles

| Username | Assigned Role |
| :--- | :--- |
| `superadmin` | `super_admin` |
| `senior_cmh` | `senior` |
| `senior_wmn` | `senior` |
| `senior_vms` | `senior` |
| `manager_wmn1` | `manager` |
| `tl_wmn1` | `team_leader` |
| `user_wmn1_a` | `user` |
| `user_wmn1_b` | `user` |

## Real User Permission Matrix

| Permission | superadmin | senior_cmh | senior_wmn | senior_vms | manager_wmn1 | tl_wmn1 | user_wmn1_a | user_wmn1_b |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Organization** | | | | | | | | |
| `manage_companies` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `view_all_companies` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `manage_entities` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `view_company_entities` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **User Management** | | | | | | | | |
| `manage_users_global` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `manage_users_company` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `manage_users_entity` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `manage_users_team` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Requests** | | | | | | | | |
| `create_request` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `view_all_requests` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `view_company_requests` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `view_entity_requests` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `view_team_requests` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `view_own_requests` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Actions** | | | | | | | | |
| `approve_request_tl` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `approve_request_mgr` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `approve_request_snr` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `assign_request` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `resolve_request` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `close_request` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Reporting** | | | | | | | | |
| `view_global_reports` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `view_company_reports` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `view_entity_reports` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `export_data` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

## Legend
- ✅: Allowed
- ❌: Denied

## Source of Truth
- `backend/apps/users/management/commands/seed_test_users.py`
- `backend/apps/permissions_app/management/commands/seed_roles_permissions.py`

> Note: this reflects seeded role defaults mapped to the real seeded users.
