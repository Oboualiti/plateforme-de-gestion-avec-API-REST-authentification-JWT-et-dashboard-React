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
  ArrowLeftRight,
  ScrollText,
  Bell,
  BarChart3,
  UserCircle,
  Briefcase,
  UsersRound,
} from "lucide-react";

const dashboard = { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard };
const profile = { label: "Profile", to: "/profile", icon: UserCircle };

export function getNavForRole(role) {
  switch (role) {
    case "user":
      return [
        { label: "Workspace", items: [dashboard, { label: "Create Request", to: "/requests/create", icon: PlusCircle }, { label: "My Requests", to: "/requests?scope=mine", icon: ListChecks }] },
        { label: "Account", items: [profile] },
      ];
    case "team_leader":
      return [
        {
          label: "Workspace",
          items: [
            dashboard,
            { label: "Incoming Queue", to: "/requests?scope=team", icon: Inbox },
            { label: "Team Requests", to: "/requests?scope=team-all", icon: ListChecks },
            { label: "Create Request", to: "/requests/create", icon: PlusCircle },
            { label: "Team Members", to: "/team", icon: UsersRound },
          ],
        },
        { label: "Admin", items: [{ label: "Roles", to: "/admin/roles", icon: ShieldCheck }] },
        { label: "Account", items: [profile] },
      ];
    case "manager":
      return [
        {
          label: "Workspace",
          items: [
            dashboard,
            { label: "Entity Requests", to: "/requests?scope=entity", icon: ListChecks },
            { label: "Incoming Queue", to: "/requests?scope=team", icon: Inbox },
            { label: "Team Members", to: "/team", icon: UsersRound },
          ],
        },
        {
          label: "Admin",
          items: [
            { label: "Users", to: "/admin/users", icon: Users },
            { label: "Roles", to: "/admin/roles", icon: ShieldCheck },
          ],
        },
        { label: "Account", items: [profile] },
      ];
    case "senior":
      return [
        {
          label: "Operations",
          items: [
            dashboard,
            { label: "Company Requests", to: "/requests?scope=company", icon: ListChecks },
            { label: "Monitoring", to: "/admin/monitoring", icon: BarChart3 },
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
        { label: "Account", items: [profile] },
      ];
    case "super_admin":
    default:
      return [
        { label: "Platform", items: [dashboard] },
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
            { label: "Delegation Rules", to: "/admin/delegation", icon: ArrowLeftRight },
          ],
        },
        {
          label: "Operations",
          items: [
            { label: "Requests", to: "/requests", icon: Briefcase },
            { label: "Monitoring", to: "/admin/monitoring", icon: BarChart3 },
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
