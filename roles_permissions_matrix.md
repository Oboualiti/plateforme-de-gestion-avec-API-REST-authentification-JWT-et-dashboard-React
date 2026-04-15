# Roles and Permissions Matrix: EMD Request Management System

This matrix defines the default permissions for each role. Permissions can be further restricted or granted via user-level overrides.

| Permission | Super Admin | Senior | Manager | Team Leader | User | Handler |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Organization** | | | | | | |
| `manage_companies` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `view_all_companies` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `manage_entities` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `view_company_entities` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **User Management** | | | | | | |
| `manage_users_global` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `manage_users_company` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `manage_users_entity` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Requests** | | | | | | |
| `create_request` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `view_all_requests` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `view_company_requests`| ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `view_entity_requests` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `view_team_requests` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `view_own_requests` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Actions** | | | | | | |
| `approve_request_tl` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `approve_request_mgr` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `approve_request_snr` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `assign_request` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `resolve_request` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `close_request` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Reporting** | | | | | | |
| `view_global_reports` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `view_company_reports` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `view_entity_reports` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `export_data` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

## Legend
*   ✅: Default Allowed
*   ❌: Default Denied
*   *Note: Use `UserPermissionOverride` to "Allow" a specific ❌ or "Deny" a specific ✅ for any user.*
