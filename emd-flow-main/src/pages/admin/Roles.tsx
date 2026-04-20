import { PageHeader } from "@/components/PageHeader";
import { ROLE_LABELS, ROLE_RANK } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import type { Role } from "@/types";
import { users } from "@/data/mock";

const roleDescriptions: Record<Role, string> = {
  super_admin: "Full platform control across all companies, entities, users and settings.",
  senior: "Oversight of a single company and its entities.",
  manager: "Manages an entity, its team leaders, and entity-level requests.",
  team_leader: "Manages a team of users within an entity.",
  user: "Creates and tracks their own requests.",
};

export default function AdminRoles() {
  return (
    <div>
      <PageHeader title="Roles" description="Default capabilities granted to each role across the platform." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(ROLE_LABELS) as Role[])
          .sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])
          .map((role) => {
            const count = users.filter((u) => u.role === role).length;
            return (
              <div key={role} className="surface-card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-accent-foreground">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-base font-semibold">{ROLE_LABELS[role]}</div>
                      <div className="text-xs text-muted-foreground">{count} user{count === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-mono">L{ROLE_RANK[role]}</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{roleDescriptions[role]}</p>
                <Button variant="outline" size="sm" className="mt-4 w-full">Edit permissions</Button>
              </div>
            );
          })}
      </div>
    </div>
  );
}
