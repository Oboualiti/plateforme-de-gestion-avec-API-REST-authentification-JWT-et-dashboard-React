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
  Trophy,
  KeyRound,
} from "lucide-react";

const dashboard = { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard };
const adminDashboard = { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard };
const profile = { label: "Profile", to: "/profile", icon: UserCircle };

export function getNavForRole(role, user = null) {
  const permissionKeys = new Set(user?.effective_permission_keys || []);
  const has = (permissionKey) => permissionKeys.has(permissionKey);
  const hasAny = (permissionList) => permissionList.some((permissionKey) => has(permissionKey));
  const canAccessCompanies = hasAny(["manage_companies", "view_all_companies"]);
  const canAccessEntities = hasAny(["manage_entities", "manage_company_entities", "view_company_entities", "view_all_entities"]);
  const canCreateRequests = Boolean(user?.request_creation_allowed) && has("create_request");
  const canApprovePending = has("approve_request")
    && (
      role === "super_admin"
      || role === "senior"
      || ((role === "manager" || role === "team_leader") && user?.entity_type === "PROD")
    );
  const canApproveAsBasicUser = role === "user" && has("approve_request");
  const canTrackOwnPending = has("view_own_requests") && canCreateRequests;
  const canAccessPending = canApprovePending || canTrackOwnPending;
  const canAccessRequests = hasAny([
    "view_all_requests",
    "view_company_requests",
    "view_entity_requests",
    "view_team_requests",
    "view_own_requests",

  ]);
  const canAccessReports = Boolean(user?.reports_page_access_allowed);
  const canExportReports = has("export_data");
  const canManageUsers = hasAny(["manage_users_global", "manage_users_company", "manage_users_entity", "manage_assigned_users"]);
  const canAccessUsers = hasAny([
    "manage_users_global",
    "manage_users_company",
    "manage_users_entity",
    "manage_assigned_users",
    "view_users_global",
    "view_users_company",
    "view_users_entity",
  ]);
  const canAccessHierarchy = has("view_company_entities");
  const canAccessRoles = has("permission_management");
  const canAccessAuditLogs = hasAny(["view_user_audit_logs", "view_access_audit_logs", "view_org_audit_logs"]);

  const canSolveRequests =
    permissionKeys.has("complete_request") ||
    permissionKeys.has("complete_requests") ||
    permissionKeys.has("solve_request") ||
    permissionKeys.has("solve_requests") ||
    permissionKeys.has("view_assigned_requests");

  const entityType =
    user?.entity_type ||
    user?.entity?.entity_type ||
    user?.entity?.type ||
    user?.entityType;

  const isSupportDevEntity =
    entityType && entityType !== "PROD" && entityType !== "production";

  const isSupportDevUser =
    role === "user" && (canSolveRequests || isSupportDevEntity);
  const isProdResultApproverUser =
    role === "user" && String(user?.entity_type || "").toUpperCase() === "PROD" && has("approve_request");

  const auditLogItems = [
    ...(has("view_user_audit_logs") ? [{ label: "User logs", to: "/admin/audit-logs/users", icon: ScrollText }] : []),
    ...(has("view_access_audit_logs") ? [{ label: "Access / role logs", to: "/admin/audit-logs/access", icon: ScrollText }] : []),
    ...(has("view_org_audit_logs") ? [{ label: "Organization logs", to: "/admin/audit-logs/organization", icon: ScrollText }] : []),
  ];
  switch (role) {
    case "user":
      return [
        { label: "Platform", items: [dashboard] },
        {
          label: "Workspace",
          items: [
            ...(canCreateRequests
              ? [{ label: "Create Request", to: "/requests/create", icon: PlusCircle }]
              : []),
            ...(canCreateRequests && !canApproveAsBasicUser
              ? [{ label: "Pending Requests", to: "/pending-requests", icon: Inbox }]
              : []),
            ...(has("view_own_requests")
              ? [{ label: "Requests", to: "/requests?scope=all", icon: ListChecks }]
              : []),
            ...((isSupportDevUser || isProdResultApproverUser) ? [{ label: "Credits Board", to: "/credits-board", icon: Trophy }] : []),
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
          items: auditLogItems,
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
              ? [{ label: "Requests", to: "/requests?scope=all", icon: Inbox }]
              : []),
            ...(canCreateRequests
              ? [{ label: "Create Request", to: "/requests/create", icon: PlusCircle }]
              : []),
            ...(canAccessPending
              ? [{ label: "Pending Requests", to: "/pending-requests", icon: Inbox }]
              : []),
            ...(canManageUsers
              ? [{ label: "Team Members", to: "/team", icon: UsersRound }]
              : []),
            { label: "Credits Board", to: "/credits-board", icon: Trophy },
            { label: "Notifications", to: "/notifications", icon: Bell },
            ...(canAccessReports ? [{ label: "Reports", to: "/admin/reports", icon: BarChart3 }] : []),
          ],
        },
        {
          label: "Admin",
          items: [
            ...(canAccessCompanies ? [{ label: "Companies", to: "/admin/companies", icon: Building2 }] : []),
            ...(canAccessEntities ? [{ label: "Entities", to: "/admin/entities", icon: Boxes }] : []),
            ...(canAccessHierarchy ? [{ label: "Hierarchy", to: "/admin/hierarchy", icon: Network }] : []),
            ...(canAccessUsers ? [{ label: "Users", to: "/admin/users", icon: Users }] : []),
            ...(canAccessRoles ? [{ label: "Roles", to: "/admin/roles", icon: ShieldCheck }] : []),
            ...(canManageUsers ? [{ label: "Permission Control", to: "/admin/permission-control/request-permissions", icon: KeyRound }] : []),
          ],
        },
        ...(canAccessAuditLogs ? [{
          label: "Audit Logs",
          items: auditLogItems,
        }] : []),
        { label: "Account", items: [profile] },
      ];
    case "manager":
      return [
        { label: "Platform", items: [dashboard] },
        {
          label: "Workspace",
          items: [
            ...(canAccessRequests
              ? [{ label: "Requests", to: "/requests?scope=all", icon: ListChecks }]
              : []),
            ...(canAccessPending
              ? [{ label: "Pending Requests", to: "/pending-requests", icon: Inbox }]
              : []),
            { label: "Credits Board", to: "/credits-board", icon: Trophy },
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
            ...(canManageUsers ? [{ label: "Permission Control", to: "/admin/permission-control/request-permissions", icon: KeyRound }] : []),
            ...(canAccessHierarchy ? [{ label: "Hierarchy", to: "/admin/hierarchy", icon: Network }] : []),
          ],
        },
        ...(canAccessAuditLogs ? [{
          label: "Audit Logs",
          items: auditLogItems,
        }] : []),
        { label: "Account", items: [profile] },
      ];
    case "senior":
      return [
        { label: "Platform", items: [dashboard] },
        {
          label: "Operations",
          items: [
            ...(canAccessRequests
              ? [{ label: "Requests", to: "/requests?scope=all", icon: ListChecks }]
              : []),
            ...(canAccessPending
              ? [{ label: "Pending Requests", to: "/pending-requests", icon: Inbox }]
              : []),
            { label: "Credits Board", to: "/credits-board", icon: Trophy },
            { label: "Notifications", to: "/notifications", icon: Bell },
            ...(canAccessReports ? [{ label: "Reports", to: "/admin/reports", icon: BarChart3 }] : []),
          ],
        },
        {
          label: "Organization",
          items: [
            ...(canAccessCompanies ? [{ label: "Companies", to: "/admin/companies", icon: Building2 }] : []),
            ...(has("manage_entities") || has("manage_company_entities") || has("view_company_entities") || has("view_all_entities")
              ? [{ label: "Entities", to: "/admin/entities", icon: Boxes }]
              : []),
            ...(canAccessHierarchy ? [{ label: "Hierarchy", to: "/admin/hierarchy", icon: Network }] : []),
            ...(canAccessUsers ? [{ label: "Users", to: "/admin/users", icon: Users }] : []),
            ...(canAccessRoles ? [{ label: "Roles", to: "/admin/roles", icon: ShieldCheck }] : []),
            ...(canManageUsers ? [{ label: "Permission Control", to: "/admin/permission-control/request-permissions", icon: KeyRound }] : []),
          ],
        },
        ...(canAccessAuditLogs ? [{
          label: "Audit Logs",
          items: auditLogItems,
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
            ...(canAccessRoles ? [{ label: "Roles", to: "/admin/roles", icon: ShieldCheck }] : []),
            { label: "Permission Control", to: "/admin/permission-control/request-permissions", icon: KeyRound },
          ],
        },
        {
          label: "Operations",
          items: [
            ...(hasAny(["view_all_requests", "view_company_requests", "view_entity_requests", "view_team_requests", "view_own_requests"])
              ? [{ label: "Requests", to: "/requests", icon: Briefcase }]
              : []),
            ...(canAccessPending ? [{ label: "Pending Requests", to: "/pending-requests", icon: Inbox }] : []),
            { label: "Credits Board", to: "/credits-board", icon: Trophy },
            { label: "Notifications", to: "/notifications", icon: Bell },
            ...(canAccessReports ? [{ label: "Reports", to: "/admin/reports", icon: BarChart3 }] : []),
          ],
        },
        ...(canAccessAuditLogs ? [{
          label: "Audit Logs",
          items: auditLogItems,
        }] : []),
        { label: "Account", items: [profile] },
      ];
  }
}
