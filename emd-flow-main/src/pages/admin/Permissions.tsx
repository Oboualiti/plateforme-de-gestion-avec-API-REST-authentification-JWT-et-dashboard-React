import { PageHeader } from "@/components/PageHeader";
import { ROLE_LABELS } from "@/store/auth";
import type { Role } from "@/types";
import { Check, Minus } from "lucide-react";

const roles: Role[] = ["super_admin", "senior", "manager", "team_leader", "user"];

const matrix: { group: string; perms: { name: string; desc: string; allowed: Role[] }[] }[] = [
  {
    group: "Requests",
    perms: [
      { name: "Create request", desc: "Open a new request as production user", allowed: ["super_admin", "senior", "manager", "team_leader", "user"] },
      { name: "Accept / reject", desc: "Move requests out of New", allowed: ["super_admin", "senior", "manager", "team_leader"] },
      { name: "Reassign", desc: "Change assignee", allowed: ["super_admin", "manager", "team_leader"] },
      { name: "Close", desc: "Permanently close a request", allowed: ["super_admin", "manager"] },
    ],
  },
  {
    group: "Organization",
    perms: [
      { name: "Manage companies", desc: "Create / edit / disable companies", allowed: ["super_admin"] },
      { name: "Manage entities", desc: "Create / edit / disable entities", allowed: ["super_admin", "senior"] },
      { name: "View hierarchy", desc: "See chain of command", allowed: ["super_admin", "senior", "manager"] },
    ],
  },
  {
    group: "Access control",
    perms: [
      { name: "Manage users", desc: "Invite / deactivate / reassign", allowed: ["super_admin", "senior", "manager"] },
      { name: "Manage roles", desc: "Edit role permissions", allowed: ["super_admin"] },
      { name: "Delegation rules", desc: "Configure temporary delegations", allowed: ["super_admin", "senior"] },
    ],
  },
  {
    group: "Monitoring",
    perms: [
      { name: "Audit logs", desc: "Read full audit trail", allowed: ["super_admin", "senior"] },
      { name: "Reports", desc: "Generate analytics", allowed: ["super_admin", "senior"] },
    ],
  },
];

export default function AdminPermissions() {
  return (
    <div>
      <PageHeader title="Permissions" description="Granular permission matrix per role. Overrides can be set per user." />

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Permission</th>
                {roles.map((r) => (
                  <th key={r} className="px-4 py-3 text-center font-medium">{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.flatMap((group) => [
                <tr key={`g-${group.group}`} className="bg-surface-3/60">
                  <td colSpan={roles.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.group}
                  </td>
                </tr>,
                ...group.perms.map((p) => (
                  <tr key={`${group.group}-${p.name}`} className="data-table-row border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.desc}</div>
                    </td>
                    {roles.map((r) => (
                      <td key={r} className="px-4 py-3 text-center">
                        {p.allowed.includes(r) ? (
                          <Check className="mx-auto h-4 w-4 text-success" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" />
                        )}
                      </td>
                    ))}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
