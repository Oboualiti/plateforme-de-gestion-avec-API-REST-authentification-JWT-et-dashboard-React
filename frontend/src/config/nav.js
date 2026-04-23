import {
  LayoutDashboard,
  Inbox,
  PlusCircle,
  ListChecks,
  Building2,
  Boxes,
  Network,
  Users,
  ShieldCheck,
  ScrollText,
  Bell,
  BarChart3,
  UserCircle,
  Briefcase,
  UsersRound,
} from "lucide-react";

const dashboard = { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard };
const adminDashboard = { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard };
const profile = { label: "Profile", to: "/profile", icon: UserCircle };

export function getNavForRole(role, user = null) {
  const permissionKeys = new Set(user?.effective_permission_keys || []);
  const has = (permissionKey) => permissionKeys.has(permissionKey);
  const hasAny = (permissionList) => permissionList.some((permissionKey) => has(permissionKey));
  const canAccessCompanies = hasAny(["manage_companies", "view_all_companies"]);
  const canAccessEntities = hasAny(["manage_entities", "view_company_entities"]);
  const canCreateRequests = Boolean(user?.request_creation_allowed) && has("create_request");
  const canApprovePending = has("approve_request")
    && (
      role === "super_admin"
      || role === "senior"
      || ((role === "manager" || role === "team_leader") && user?.entity_type === "PROD")
    );
  const canTrackOwnPending = has("view_own_requests") && canCreateRequests;
  const canAccessPending = canApprovePending || canTrackOwnPending;
  const canAccessReports = hasAny(["view_global_reports", "view_company_reports", "view_entity_reports"]);
  const canExportReports = has("export_data");
  const canAccessUsers = hasAny(["manage_users_global", "manage_users_company", "manage_users_entity"]);
  const canAccessHierarchy = has("view_company_entities");
  const canAccessRoles = canAccessUsers || has("view_own_requests");
  const canAccessAuditLogs = hasAny([
    "manage_users_global",
    "manage_users_company",
    "manage_users_entity",
    "view_all_requests",
    "view_company_requests",
    "view_entity_requests",
    "view_team_requests",
  ]);
  switch (role) {
    case "user":
      return [
        { label: "Platform", items: [dashboard] },
        {
          label: "Workspace",
          items: [
            dashboard,
            ...(canCreateRequests
              ? [{ label: "Create Request", to: "/requests/create", icon: PlusCircle }]
              : []),
            ...(canCreateRequests
              ? [{ label: "Pending Requests", to: "/requests?scope=pending", icon: Inbox }]
              : []),
            ...(has("view_own_requests")
              ? [{ label: "My Requests", to: "/requests?scope=mine", icon: ListChecks }]
              : []),
            { label: "Notifications", to: "/notifications", icon: Bell },
          ],
        },
        ...(canAccessCompanies || canAccessEntities || canAccessUsers || canAccessHierarchy ? [{
          label: "Admin",
          items: [
            ...(canAccessCompanies ? [{ label: "Companies", to: "/admin/companies", icon: Building2 }] : []),
            ...(canAccessEntities ? [{ label: "Entities", to: "/admin/entities", icon: Boxes }] : []),
            ...(canAccessHierarchy ? [{ label: "Hierarchy", to: "/admin/hierarchy", icon: Network }] : []),
            ...(canAccessUsers ? [{ label: "Users", to: "/admin/users", icon: Users }] : []),
            ...(canAccessRoles ? [{ label: "Roles", to: "/admin/roles", icon: ShieldCheck }] : []),
          ],
        }] : []),
        ...(canAccessAuditLogs ? [{
          label: "Audit Logs",
          items: [
            { label: "All logs", to: "/admin/audit-logs/all", icon: ScrollText },
            { label: "User logs", to: "/admin/audit-logs/users", icon: ScrollText },
            { label: "Access / role logs", to: "/admin/audit-logs/access", icon: ScrollText },
            { label: "Organization logs", to: "/admin/audit-logs/organization", icon: ScrollText },
          ],
        }] : []),
        ...(canAccessReports ? [{
          label: "Monitoring",
          items: [{ label: "Reports", to: "/admin/reports", icon: BarChart3 }],
        }] : []),
        { label: "Account", items: [profile] },
      ];
    case "team_leader":
      return [
        { label: "Platform", items: [dashboard] },
        {
          label: "Workspace",
          items: [
            ...(has("view_team_requests")
              ? [{ label: "Incoming Queue", to: "/requests?scope=team", icon: Inbox }]
              : []),
            ...(canCreateRequests
              ? [{ label: "Create Request", to: "/requests/create", icon: PlusCircle }]
              : []),
            ...(canAccessPending
              ? [{ label: "Pending Requests", to: "/requests?scope=pending", icon: Inbox }]
              : []),
            ...(canAccessUsers
              ? [{ label: "Team Members", to: "/team", icon: UsersRound }]
              : []),
            { label: "Notifications", to: "/notifications", icon: Bell },
          ],
        },
        {
          label: "Admin",
          items: [
            ...(canAccessCompanies ? [{ label: "Companies", to: "/admin/companies", icon: Building2 }] : []),
            ...(canAccessEntities ? [{ label: "Entities", to: "/admin/entities", icon: Boxes }] : []),
            ...(canAccessHierarchy ? [{ label: "Hierarchy", to: "/admin/hierarchy", icon: Network }] : []),
            ...(canAccessRoles ? [{ label: "Roles", to: "/admin/roles", icon: ShieldCheck }] : []),
          ],
        },
        ...(canAccessAuditLogs ? [{
          label: "Audit Logs",
          items: [
            { label: "All logs", to: "/admin/audit-logs/all", icon: ScrollText },
            { label: "User logs", to: "/admin/audit-logs/users", icon: ScrollText },
            { label: "Access / role logs", to: "/admin/audit-logs/access", icon: ScrollText },
            { label: "Organization logs", to: "/admin/audit-logs/organization", icon: ScrollText },
          ],
        }] : []),
        { label: "Account", items: [profile] },
      ];
    case "manager":
      return [
        { label: "Platform", items: [dashboard] },
        {
          label: "Workspace",
          items: [
            ...(has("view_entity_requests")
              ? [{ label: "Entity Requests", to: "/requests?scope=entity", icon: ListChecks }]
              : []),
            ...(canAccessPending
              ? [{ label: "Pending Requests", to: "/requests?scope=pending", icon: Inbox }]
              : []),
            { label: "Notifications", to: "/notifications", icon: Bell },
            ...(canAccessReports ? [{ label: "Reports", to: "/admin/reports", icon: BarChart3 }] : []),
          ],
        },
        {
          label: "Admin",
          items: [
            ...(canAccessCompanies ? [{ label: "Companies", to: "/admin/companies", icon: Building2 }] : []),
            ...(canAccessEntities ? [{ label: "Entities", to: "/admin/entities", icon: Boxes }] : []),
            ...(canAccessUsers ? [{ label: "Users", to: "/admin/users", icon: Users }] : []),
            ...(canAccessRoles ? [{ label: "Roles", to: "/admin/roles", icon: ShieldCheck }] : []),
            ...(canAccessHierarchy ? [{ label: "Hierarchy", to: "/admin/hierarchy", icon: Network }] : []),
          ],
        },
        ...(canAccessAuditLogs ? [{
          label: "Audit Logs",
          items: [
            { label: "All logs", to: "/admin/audit-logs/all", icon: ScrollText },
            { label: "User logs", to: "/admin/audit-logs/users", icon: ScrollText },
            { label: "Access / role logs", to: "/admin/audit-logs/access", icon: ScrollText },
            { label: "Organization logs", to: "/admin/audit-logs/organization", icon: ScrollText },
          ],
        }] : []),
        { label: "Account", items: [profile] },
      ];
    case "senior":
      return [
        { label: "Platform", items: [dashboard] },
        {
          label: "Operations",
          items: [
            ...(has("view_company_requests")
              ? [{ label: "Company Requests", to: "/requests?scope=company", icon: ListChecks }]
              : []),
            { label: "Pending Requests", to: "/requests?scope=pending", icon: Inbox },
            { label: "Notifications", to: "/notifications", icon: Bell },
            ...(canAccessReports ? [{ label: "Reports", to: "/admin/reports", icon: BarChart3 }] : []),
          ],
        },
        {
          label: "Organization",
          items: [
            ...(canAccessCompanies ? [{ label: "Companies", to: "/admin/companies", icon: Building2 }] : []),
            ...(has("manage_entities") || has("view_company_entities")
              ? [{ label: "Entities", to: "/admin/entities", icon: Boxes }]
              : []),
            ...(canAccessHierarchy ? [{ label: "Hierarchy", to: "/admin/hierarchy", icon: Network }] : []),
            ...(canAccessUsers ? [{ label: "Users", to: "/admin/users", icon: Users }] : []),
            ...(canAccessRoles ? [{ label: "Roles", to: "/admin/roles", icon: ShieldCheck }] : []),
          ],
        },
        ...(canAccessAuditLogs ? [{
          label: "Audit Logs",
          items: [
            { label: "All logs", to: "/admin/audit-logs/all", icon: ScrollText },
            { label: "User logs", to: "/admin/audit-logs/users", icon: ScrollText },
            { label: "Access / role logs", to: "/admin/audit-logs/access", icon: ScrollText },
            { label: "Organization logs", to: "/admin/audit-logs/organization", icon: ScrollText },
          ],
        }] : []),
        { label: "Account", items: [profile] },
      ];
    case "super_admin":
    default:
      return [
        { label: "Platform", items: [adminDashboard] },
        {
          label: "Organization",
          items: [
            { label: "Companies", to: "/admin/companies", icon: Building2 },
            { label: "Entities", to: "/admin/entities", icon: Boxes },
            { label: "Hierarchy", to: "/admin/hierarchy", icon: Network },
          ],
        },
        {
          label: "Access Control",
          items: [
            { label: "Users", to: "/admin/users", icon: Users },
            { label: "Roles", to: "/admin/roles", icon: ShieldCheck },
          ],
        },
        {
          label: "Operations",
          items: [
            ...(hasAny(["view_all_requests", "view_company_requests", "view_entity_requests", "view_team_requests", "view_own_requests"])
              ? [{ label: "Requests", to: "/requests", icon: Briefcase }]
              : []),
            ...(canAccessPending ? [{ label: "Pending Requests", to: "/requests?scope=pending", icon: Inbox }] : []),
            { label: "Notifications", to: "/notifications", icon: Bell },
            ...(canAccessReports || canExportReports ? [{ label: "Reports", to: "/admin/reports", icon: BarChart3 }] : []),
          ],
        },
        {
          label: "Audit Logs",
          items: [
            { label: "All logs", to: "/admin/audit-logs/all", icon: ScrollText },
            { label: "User logs", to: "/admin/audit-logs/users", icon: ScrollText },
            { label: "Access / role logs", to: "/admin/audit-logs/access", icon: ScrollText },
            { label: "Organization logs", to: "/admin/audit-logs/organization", icon: ScrollText },
          ],
        },
        { label: "Account", items: [profile] },
      ];
  }
}

