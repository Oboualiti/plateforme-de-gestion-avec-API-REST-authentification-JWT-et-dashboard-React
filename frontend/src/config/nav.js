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
  const canCreateRequests = Boolean(user?.request_creation_allowed);
  const canAccessPending = role === "super_admin"
    || role === "senior"
    || ((role === "manager" || role === "team_leader") && user?.entity_type === "PROD");
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
            { label: "My Requests", to: "/requests?scope=mine", icon: ListChecks },
            { label: "Notifications", to: "/notifications", icon: Bell },
          ],
        },
        { label: "Account", items: [profile] },
      ];
    case "team_leader":
      return [
        { label: "Platform", items: [dashboard] },
        {
          label: "Workspace",
          items: [
            { label: "Incoming Queue", to: "/requests?scope=team", icon: Inbox },
            ...(canCreateRequests
              ? [{ label: "Create Request", to: "/requests/create", icon: PlusCircle }]
              : []),
            ...(canAccessPending
              ? [{ label: "Pending Requests", to: "/requests?scope=pending", icon: Inbox }]
              : []),
            { label: "Team Members", to: "/team", icon: UsersRound },
            { label: "Notifications", to: "/notifications", icon: Bell },
          ],
        },
        {
          label: "Admin",
          items: [
            { label: "Hierarchy", to: "/admin/hierarchy", icon: Network },
            { label: "Roles", to: "/admin/roles", icon: ShieldCheck },
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
    case "manager":
      return [
        { label: "Platform", items: [dashboard] },
        {
          label: "Workspace",
          items: [
            { label: "Entity Requests", to: "/requests?scope=entity", icon: ListChecks },
            ...(canAccessPending
              ? [{ label: "Pending Requests", to: "/requests?scope=pending", icon: Inbox }]
              : []),
            { label: "Notifications", to: "/notifications", icon: Bell },
            { label: "Reports", to: "/admin/reports", icon: BarChart3 },
          ],
        },
        {
          label: "Admin",
          items: [
            { label: "Users", to: "/admin/users", icon: Users },
            { label: "Roles", to: "/admin/roles", icon: ShieldCheck },
            { label: "Hierarchy", to: "/admin/hierarchy", icon: Network },
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
    case "senior":
      return [
        { label: "Platform", items: [dashboard] },
        {
          label: "Operations",
          items: [
            { label: "Company Requests", to: "/requests?scope=company", icon: ListChecks },
            { label: "Pending Requests", to: "/requests?scope=pending", icon: Inbox },
            { label: "Notifications", to: "/notifications", icon: Bell },
            { label: "Reports", to: "/admin/reports", icon: BarChart3 },
          ],
        },
        {
          label: "Organization",
          items: [
            { label: "Entities", to: "/admin/entities", icon: Boxes },
            { label: "Hierarchy", to: "/admin/hierarchy", icon: Network },
            { label: "Users", to: "/admin/users", icon: Users },
            { label: "Roles", to: "/admin/roles", icon: ShieldCheck },
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
            { label: "Requests", to: "/requests", icon: Briefcase },
            { label: "Pending Requests", to: "/requests?scope=pending", icon: Inbox },
            { label: "Notifications", to: "/notifications", icon: Bell },
            { label: "Reports", to: "/admin/reports", icon: BarChart3 },
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
